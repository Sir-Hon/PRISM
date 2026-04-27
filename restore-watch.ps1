param(
    [ValidateSet("Init", "Watch", "Help")]
    [string]$Mode = "Help",
    [string]$Root = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-BaselineRoot {
    param([string]$ProjectRoot)
    return (Join-Path $ProjectRoot ".restore-baseline")
}

function Should-SkipPath {
    param([string]$FullPath, [string]$ProjectRoot)
    $rel = $FullPath.Substring($ProjectRoot.Length).TrimStart("\", "/")
    if ($rel -like ".restore-baseline*") { return $true }
    if ($rel -like ".git*") { return $true }
    if ($rel -like "node_modules*") { return $true }
    if ($rel -like ".cursor*") { return $true }
    return $false
}

function Get-TrackedFiles {
    param([string]$ProjectRoot)
    $allowed = @(".html", ".js", ".css", ".php", ".sql")
    Get-ChildItem -Path $ProjectRoot -Recurse -File | Where-Object {
        -not (Should-SkipPath $_.FullName $ProjectRoot) -and $allowed -contains $_.Extension.ToLowerInvariant()
    }
}

function Build-Baseline {
    param([string]$ProjectRoot)
    $baseRoot = Get-BaselineRoot $ProjectRoot
    if (-not (Test-Path $baseRoot)) {
        New-Item -Path $baseRoot -ItemType Directory | Out-Null
    }

    $files = Get-TrackedFiles $ProjectRoot
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($ProjectRoot.Length).TrimStart("\", "/")
        $dest = Join-Path $baseRoot $rel
        $destDir = Split-Path -Parent $dest
        if (-not (Test-Path $destDir)) {
            New-Item -Path $destDir -ItemType Directory | Out-Null
        }
        Copy-Item -Path $f.FullName -Destination $dest -Force
    }

    Write-Host "Baseline built at: $baseRoot"
    Write-Host "Tracked files:" $files.Count
    Write-Host "Use markers then run: .\restore-watch.ps1 -Mode Watch"
}

function Has-RestoreMarker {
    param([string]$Text)
    return (
        $Text -match "<!--\s*restore(?::block)?\s*-->" -or
        $Text -match "//\s*restore(?::block)?" -or
        $Text -match "/\*\s*restore(?::block)?\s*\*/"
    )
}

function Try-RestoreFile {
    param([string]$ProjectRoot, [string]$ChangedPath)

    if (-not (Test-Path $ChangedPath)) { return }
    if (Should-SkipPath $ChangedPath $ProjectRoot) { return }

    $baseRoot = Get-BaselineRoot $ProjectRoot
    if (-not (Test-Path $baseRoot)) { return }

    $rel = $ChangedPath.Substring($ProjectRoot.Length).TrimStart("\", "/")
    $baseFile = Join-Path $baseRoot $rel
    if (-not (Test-Path $baseFile)) { return }

    $content = Get-Content -Path $ChangedPath -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) { return }
    if (-not (Has-RestoreMarker $content)) { return }

    Copy-Item -Path $baseFile -Destination $ChangedPath -Force
    Write-Host ("[AUTO-RESTORE] Restored: " + $rel)
}

# Self-contained: Register-ObjectEvent runs handlers in a job where sibling script functions are not in scope.
function Invoke-PrismRestoreFromBaseline {
    param([string]$ProjectRoot, [string]$ChangedPath)
    if (-not (Test-Path $ChangedPath)) { return }
    $proj = [string]$ProjectRoot.TrimEnd("\", "/")
    $full = (Resolve-Path -LiteralPath $ChangedPath).Path
    if (-not $full.StartsWith($proj, [StringComparison]::OrdinalIgnoreCase)) { return }
    $rel = $full.Substring($proj.Length).TrimStart("\", "/")
    if ($rel -like ".restore-baseline*" -or $rel -like ".git*" -or $rel -like "node_modules*" -or $rel -like ".cursor*") { return }
    $baseRoot = Join-Path $ProjectRoot ".restore-baseline"
    if (-not (Test-Path $baseRoot)) { return }
    $baseFile = Join-Path $baseRoot $rel
    if (-not (Test-Path $baseFile)) { return }
    $content = Get-Content -Path $ChangedPath -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) { return }
    if (-not (
            $content -match "<!--\s*restore(?::block)?\s*-->" -or
            $content -match "//\s*restore(?::block)?" -or
            $content -match "/\*\s*restore(?::block)?\s*\*/"
        )) { return }
    Copy-Item -Path $baseFile -Destination $ChangedPath -Force
    Write-Host ("[AUTO-RESTORE] Restored: " + $rel)
}

function Start-Watcher {
    param([string]$ProjectRoot)

    $fullRoot = (Resolve-Path $ProjectRoot).Path
    $baseRoot = Get-BaselineRoot $fullRoot
    if (-not (Test-Path $baseRoot)) {
        throw "Baseline missing. Run: .\restore-watch.ps1 -Mode Init"
    }

    Write-Host "Watching: $fullRoot"
    Write-Host "Marker triggers (save file after adding):"
    Write-Host "  Outside <script>:  <!-- restore -->"
    Write-Host "  Inside <script>:   // restore   (do not use HTML comments in JS)"
    Write-Host "  CSS:               /* restore */"
    Write-Host "  (also restore:block variants)"
    Write-Host "Press Ctrl+C to stop."

    # Register-ObjectEvent runs -Action in a separate job runspace: $using: is invalid there.
    # Pass project root via -MessageData; handler must be a global function with no script-local dependencies.
    Set-Item -Path function:global:PrismRestore_Run -Value ${function:Invoke-PrismRestoreFromBaseline} -Force

    $action = {
        try {
            Start-Sleep -Milliseconds 120
            $projectRoot = $Event.MessageData
            $fullPath = $Event.SourceEventArgs.FullPath
            PrismRestore_Run -ProjectRoot $projectRoot -ChangedPath $fullPath
        } catch {
            Write-Host ("[AUTO-RESTORE] Error: " + $_.Exception.Message)
        }
    }

    $watcher = New-Object IO.FileSystemWatcher $fullRoot, "*.*"
    $watcher.IncludeSubdirectories = $true
    $watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, Size'
    $watcher.EnableRaisingEvents = $true

    $subs = @(
        Register-ObjectEvent $watcher Changed  -MessageData $fullRoot -Action $action
        Register-ObjectEvent $watcher Created  -MessageData $fullRoot -Action $action
        Register-ObjectEvent $watcher Renamed  -MessageData $fullRoot -Action $action
    )

    try {
        while ($true) { Start-Sleep -Seconds 1 }
    } finally {
        foreach ($s in $subs) {
            Unregister-Event -SourceIdentifier $s.Name -ErrorAction SilentlyContinue
            Remove-Job -Id $s.Id -Force -ErrorAction SilentlyContinue
        }
        $watcher.Dispose()
        Remove-Item -Path function:global:PrismRestore_Run -ErrorAction SilentlyContinue
    }
}

switch ($Mode) {
    "Init" {
        Build-Baseline -ProjectRoot (Resolve-Path $Root).Path
    }
    "Watch" {
        Start-Watcher -ProjectRoot $Root
    }
    default {
        Write-Host "Auto restore watcher"
        Write-Host ""
        Write-Host "Init baseline:"
        Write-Host "  .\restore-watch.ps1 -Mode Init"
        Write-Host ""
        Write-Host "Start watcher:"
        Write-Host "  .\restore-watch.ps1 -Mode Watch"
        Write-Host ""
        Write-Host "How to use:"
        Write-Host "  1) Delete/break code in a tracked file."
        Write-Host "  2) Add marker (in HTML: <!-- restore --> outside script; use // restore inside <script>)"
        Write-Host "  3) Save file. Script restores from baseline immediately."
    }
}
