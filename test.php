<?php date_default_timezone_set('Asia/Kuala_Lumpur');
// Script to receive data from the ESP32 (GET request)
if (isset($_GET['temp'])
    && isset($_GET['humid']) 
    && isset($_GET['press']) 
    && isset($_GET['wspd'])
    && isset($_GET['wdir'])
    && isset($_GET['solpwr'])
    && isset($_GET['syspwr'])
    && isset($_GET['sysvolt'])
    && isset($_GET['raindet'])) {

    $temperature = $_GET['temp'];
    $humidity = $_GET['humid'];
    $pressure = $_GET['press'];
    $wind_speed = $_GET['wspd'];
    $wind_direction = $_GET['wdir'];
    $solar_power = $_GET['solpwr'];
    $system_power = $_GET['syspwr'];
    $system_voltage = $_GET['sysvolt'];
    $rain_detector = $_GET['raindet'];

    $sensor_data = 
        "Temp: $temperature °C - Humidity: $humidity % - Pressure: $pressure hPa - Wind Speed: $wind_speed m/s - Wind Direction: $wind_direction ° - Solar Power: $solar_power W - System Power: $system_power W - System Voltage: $system_voltage V - Rain Detector: $rain_detector";

    echo "Data received successfully!";

    // Optional: Log data to a file
    $log_file = 'sensor_log.txt';
    $timestamp = date("Y-m-d H:i:s");
    $log_entry = $timestamp . " - " . $sensor_data . "\n";
    file_put_contents($log_file, $log_entry, FILE_APPEND | LOCK_EX);

} else {
    echo $temperature = $_GET['temp'];
    echo $humidity = $_GET['humid'];
    echo $pressure = $_GET['press'];
    echo $wind_speed = $_GET['wspd'];
    echo $wind_direction = $_GET['wdir'];
    echo $solar_power = $_GET['solpwr'];
    echo $system_power = $_GET['syspwr'];
    echo $system_voltage = $_GET['sysvolt'];
    echo $rain_detector = $_GET['raindet'];
    echo "Error: No 'data' parameter found.";
}
?>