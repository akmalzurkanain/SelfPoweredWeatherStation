<?php 
declare(strict_types=1);
date_default_timezone_set('Asia/Kuala_Lumpur');

// Script to receive data from the ESP32 (GET request)
header('Content-Type: application/json; charset=utf-8');

$required_params = [
    // Environment
    'temp' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'humid' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'press' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'gas' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'uv' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 1],
    
    // Wind & Rain
    'wspd' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'wdir' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'raindet' => ['type' => FILTER_VALIDATE_INT],
    'rainamt' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 1],
    
    // Solar Power System
    'solvolt' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'solcurr' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'solpwr' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 3],
    
    // Battery System
    'batvolt' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'batcurr' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'batpwr' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 3],
    
    // System Power
    'sysvolt' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'syscurr' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 2],
    'syspwr' => ['type' => FILTER_VALIDATE_FLOAT, 'decimals' => 3]
];

$data = [];
$errors = [];

// Validate all parameters
foreach ($required_params as $param => $config) {
    if (!isset($_GET[$param])) {
        $errors[] = "Missing parameter: $param";
        continue;
    }
    
    $value = filter_var($_GET[$param], $config['type']);
    if ($value === false || $value === null) {
        $errors[] = "Invalid value for $param: {$_GET[$param]}";
        continue;
    }
    
    if (isset($config['range'])) {
        [$min, $max] = $config['range'];
        if ($value < $min || $value > $max) {
            $errors[] = "$param out of range ($min to $max): $value";
            continue;
        }
    }
    
    // Format number to specified decimals if needed
    $data[$param] = isset($config['decimals']) ? 
        number_format((float)$value, $config['decimals'], '.', '') : 
        $value;
}

    // If there were validation errors, return them
    if (!empty($errors)) {
        header('Content-Type: application/json');
        http_response_code(400);
        echo json_encode([
            'ok' => false,
            'errors' => $errors
        ]);
        exit;
    }

    // Build the log entry with all parameters
    $sensor_data = sprintf(
        "Temp: %s °C - " .
        "Humidity: %s %% - " .
        "Pressure: %s hPa - " .
        "Gas: %s kΩ - " .
        "UV Index: %s - " .
        "Wind Speed: %s m/s - " .
        "Wind Direction: %s ° - " .
        "Rain Detector: %s - " .
        "Rain Amount: %s mm - " .
        "Solar Voltage: %s V - " .
        "Solar Current: %s mA - " .
        "Solar Power: %s W - " .
        "Battery Voltage: %s V - " .
        "Battery Current: %s mA - " .
        "Battery Power: %s W - " .
        "System Voltage: %s V - " .
        "System Current: %s mA - " .
        "System Power: %s W",
        $data['temp'],
        $data['humid'],
        $data['press'],
        $data['gas'],
        $data['uv'],
        $data['wspd'],
        $data['wdir'],
        $data['raindet'],
        $data['rainamt'],
        $data['solvolt'],
        $data['solcurr'],
        $data['solpwr'],
        $data['batvolt'],
        $data['batcurr'],
        $data['batpwr'],
        $data['sysvolt'],
        $data['syscurr'],
        $data['syspwr']
    );

    // Log data to file
    $log_file = __DIR__ . DIRECTORY_SEPARATOR . 'sensor_log.txt';
    $timestamp = date('Y-m-d H:i:s');
    $log_entry = $timestamp . " - " . $sensor_data . "\n";
    
    if (file_put_contents($log_file, $log_entry, FILE_APPEND | LOCK_EX) === false) {
        header('Content-Type: application/json');
        http_response_code(500);
        echo json_encode([
            'ok' => false,
            'error' => 'Failed to write to log file'
        ]);
        exit;
    }

    // Return success response with parsed data
    echo json_encode([
        'ok' => true,
        'message' => 'Data received and logged',
        'timestamp' => $timestamp,
        'data' => $data
    ]);
?>