<?php
// api/notebooks.php — notebooks and notes for the signed-in account
require_once 'config.php';
setHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$user   = requireAuth();
$db     = getDB();

function prism_ensure_user_notebooks(PDO $db): bool {
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $db->exec(
            'CREATE TABLE IF NOT EXISTS user_notebooks (
                user_id VARCHAR(50) NOT NULL PRIMARY KEY,
                payload MEDIUMTEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        $ready = true;
    } catch (PDOException $e) {
        error_log('PRISM notebooks: ' . $e->getMessage());
        $ready = false;
    }
    return $ready;
}

if ($action === 'get') {
    if (!prism_ensure_user_notebooks($db)) ok(['notebooks' => []]);
    $stmt = $db->prepare('SELECT payload FROM user_notebooks WHERE user_id = ?');
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();
    $list = [];
    if ($row && !empty($row['payload'])) {
        $decoded = json_decode($row['payload'], true);
        if (is_array($decoded)) $list = $decoded;
    }
    ok(['notebooks' => $list]);
}

if ($method === 'POST' && $action === 'save') {
    if (!prism_ensure_user_notebooks($db)) fail('Could not save notebooks', 500);
    $b = getBody();
    $list = $b['notebooks'] ?? null;
    if (!is_array($list)) fail('Notebooks are required');
    if (count($list) > 200) fail('Too many notebooks');
    $payload = json_encode($list, JSON_UNESCAPED_UNICODE);
    if ($payload === false || strlen($payload) > 1500000) fail('Notes are too large to save');
    $db->prepare(
        'INSERT INTO user_notebooks (user_id, payload) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload)'
    )->execute([$user['id'], $payload]);
    ok(['saved' => true]);
}

fail('Unknown action', 404);
