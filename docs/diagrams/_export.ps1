$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$dir = "c:\Users\USER\OneDrive\Documents\prism\docs\diagrams"
$sizes = @{
  "student-flow" = "1140,1220"
  "teacher-flow" = "1380,1020"
  "admin-flow"   = "1120,1300"
  "prism-erd"    = "1500,1360"
}
foreach ($name in @("student-flow","teacher-flow","admin-flow","prism-erd")) {
  $html = Join-Path $dir "$name.html"
  $png = Join-Path $dir "$name.png"
  $uri = ([Uri]$html).AbsoluteUri
  $win = $sizes[$name]
  if (Test-Path $png) { Remove-Item $png -Force }
  & $edge --headless=new --disable-gpu --allow-file-access-from-files --hide-scrollbars --window-size=$win --screenshot="$png" "$uri"
  Start-Sleep -Seconds 2
  if (Test-Path $png) { Write-Output ("OK $name.png " + (Get-Item $png).Length) } else { Write-Output "FAIL $name.png" }
}
