<?php
declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$log_file = __DIR__ . DIRECTORY_SEPARATOR . 'sensor_log.txt';
$max_logs = isset($_GET['max']) ? max(1, (int)$_GET['max']) : 10;
$want_json = isset($_GET['format']) && strtolower((string)$_GET['format']) === 'json';

/**
 * Parse one log line into structured data
 * @param string $line Raw log line to parse
 * @return array{
 *   timestamp: string,
 *   temp?: string,
 *   temp_num?: float,
 *   humid?: string,
 *   humid_num?: float,
 *   press?: string,
 *   press_num?: float,
 *   gas?: string,
 *   gas_num?: float,
 *   uv?: string,
 *   uv_num?: float,
 *   wspd?: string,
 *   wspd_num?: float,
 *   wdir?: string,
 *   wdir_num?: float,
 *   raindet?: string,
 *   raindet_num?: float,
 *   rainamt?: string,
 *   rainamt_num?: float,
 *   solvolt?: string,
 *   solvolt_num?: float,
 *   solcurr?: string,
 *   solcurr_num?: float,
 *   solpwr?: string,
 *   solpwr_num?: float,
 *   batvolt?: string,
 *   batvolt_num?: float,
 *   batcurr?: string,
 *   batcurr_num?: float,
 *   batpwr?: string,
 *   batpwr_num?: float,
 *   sysvolt?: string,
 *   sysvolt_num?: float,
 *   syscurr?: string,
 *   syscurr_num?: float,
 *   syspwr?: string,
 *   syspwr_num?: float
 * }|null All fields except timestamp are optional
 */
function parse_line(string $line): ?array {
    $line = trim($line);
    if ($line === '') return null;

    $tokens = explode(' - ', $line);
    if (count($tokens) < 2) return null;

    $timestamp = trim($tokens[0]);
    $data = ['timestamp' => $timestamp];

    for ($i = 1; $i < count($tokens); $i++) {
        $tok = trim($tokens[$i]);
        if ($tok === '') continue;

        $kv = explode(':', $tok, 2);
        if (count($kv) !== 2) continue;

        $key = trim($kv[0]);
        $valText = trim($kv[1]);

        $data[$key] = $valText;

        if (preg_match('/-?\d+(?:\.\d+)?/', $valText, $m)) {
            $data[$key . '_num'] = (float)$m[0];
        }
    }
    return $data;
}

/** Read last N rows from file (newest-first) */
/** Read last N rows from file (newest-first) efficiently without loading whole file */
function read_rows(string $path, int $limit): array {
    if (!is_file($path) || !is_readable($path)) return [];

    // Try to use SplFileObject to seek from the end and read only the needed lines.
    try {
        $file = new SplFileObject($path, 'r');
        // Seek to the end to get the total lines count
        $file->seek(PHP_INT_MAX);
        $lastLineIndex = $file->key();

        $rows = [];
        for ($i = 0; $i < $limit && $lastLineIndex - $i >= 0; $i++) {
            $file->seek($lastLineIndex - $i);
            $line = $file->current();
            if ($line === false) continue;
            $line = trim($line);
            if ($line === '') continue;
            $p = parse_line($line);
            if ($p) $rows[] = $p;
        }
        return $rows; // already newest-first
    } catch (Throwable $e) {
        // Fallback to safe but less efficient method
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) return [];
        $lines = array_reverse($lines);

        $rows = [];
        foreach ($lines as $line) {
            if (count($rows) >= $limit) break;
            $p = parse_line($line);
            if ($p) $rows[] = $p;
        }
        return $rows;
    }
}

$rows = read_rows($log_file, $max_logs);

if ($want_json) {
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

header('Content-Type: text/html; charset=UTF-8');
if (!$rows) {
    echo "<tr><td colspan='2' style='text-align:center; color:#6c757d;'>No data available or unreadable log.</td></tr>";
    exit;
}

foreach ($rows as $r) {
    $ts = htmlspecialchars($r['timestamp'], ENT_QUOTES, 'UTF-8');
    $values = [];
    foreach ($r as $k => $v) {
        if ($k === 'timestamp') continue;
        if (str_ends_with($k, '_num')) continue;
        $values[] = htmlspecialchars("$k: $v", ENT_QUOTES, 'UTF-8');
    }
    echo "<tr><td>{$ts}</td><td>" . implode(' | ', $values) . "</td></tr>";
}
