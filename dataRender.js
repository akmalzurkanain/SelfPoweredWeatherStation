// Config
let TABLE_MAX_LOGS = parseInt(localStorage.getItem('tableMaxLogs')) || 10;  // table rows (newest-first)
const CHART_MAX_LOGS = 6000;       // ~24h at ~15s/sample
const FETCH_EVERY_MS = 10000;      // fetch cadence (10s)

// Function to update table max logs
function updateTableMaxLogs(value) {
    TABLE_MAX_LOGS = parseInt(value) || 10;
    localStorage.setItem('tableMaxLogs', TABLE_MAX_LOGS);
    fetchAndRenderAll(); // Refresh data immediately
}

// Display name mapping for better readability in legends, tables, and tooltips
const DISPLAY_NAMES = {
  // Environmental Sensors
  temp: 'Temperature (°C)',
  humid: 'Humidity (%)',
  press: 'Barometric Pressure (hPa)',
  gas: 'Air Quality (AQI)',
  uv: 'UV Index',
  
  // Wind & Rain
  wspd: 'Wind Speed (m/s)',
  wdir: 'Wind Direction (°)',
  raindet: 'Rain Detection',
  rainamt: 'Rainfall Amount (mm)',
  
  // Solar System
  solvolt: 'Solar Panel Voltage (V)',
  solcurr: 'Solar Panel Current (mA)',
  solpwr: 'Solar Power (W)',
  
  // Battery System
  batvolt: 'Battery Voltage (V)',
  batcurr: 'Battery Current (mA)',
  batpwr: 'Battery Power (W)',
  
  // System Power
  sysvolt: 'System Voltage (V)',
  syscurr: 'System Current (mA)',
  syspwr: 'System Power (W)',
  
  // General
  timestamp: 'Time Stamp'
};

// Metric groups following sketch layout (6 charts total)
// Left column - Sensor charts
const TEMP_KEYS = ['Temp'];
const HUMID_KEYS = ['Humidity'];
const PRESS_KEYS = ['Pressure'];
const GAS_KEYS = ['Gas'];
const UV_KEYS = ['UV'];
const WIND_KEYS = ['Wind Speed'];
const RAIN_KEYS = ['Rainfall Amount'];

// Right column - Power system charts
const VOLTAGE_KEYS = ['Solar Voltage', 'Battery Voltage', 'System Voltage'];
const CURRENT_KEYS = ['Solar Current', 'Battery Current', 'System Current'];
const POWER_KEYS = ['Solar Power', 'Battery Power', 'System Power'];

/** Ensure Chart.js instance for given canvas */
function ensureChartFor(canvasId) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  if (el._chart) return el._chart;

  // Get the container dimensions for better initial sizing
  const container = el.parentElement;
  const containerStyle = window.getComputedStyle(container);
  const paddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
  const paddingY = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);

  el._chart = new Chart(el, {
    type: 'line',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 150,
      animation: false,
      parsing: false,
      devicePixelRatio: window.devicePixelRatio || 1,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      scales: {
        x: {
          type: 'time',
          bounds: 'ticks',
          time: { unit: 'hour', displayFormats: { hour: 'h:mm a' } },
          ticks: { maxRotation: 0, autoSkip: true }
        },
        y: { beginAtZero: false, grace: '10%' }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { 
            boxWidth: 16, 
            padding: 10, 
            font: { size: 12 },
            // Use friendly names in legend
            generateLabels: (chart) => {
              const datasets = chart.data.datasets;
              return datasets.map(dataset => ({
                text: dataset.label,
                fillStyle: dataset.backgroundColor,
                strokeStyle: dataset.borderColor,
                lineWidth: dataset.borderWidth,
                index: dataset.index
              }));
            }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => {
              const value = ctx.parsed.y;
              if (!Number.isFinite(value)) return `${ctx.dataset.label}: --`;
              
              // Extract the unit from the display name if possible
              const label = ctx.dataset.label;
              const match = label.match(/.*\((.*?)\)/);
              const unit = match ? ` ${match[1]}` : '';
              
              // Format the value with the unit
              return `${label}: ${value}${unit}`;
            }
          }
        }
      },
      elements: {
        point: { radius: 0 },   // many points → faster rendering
        line: { spanGaps: true, tension: 0.25, borderWidth: 2 }
      }
    }
  });
  return el._chart;
}

// Helper function to get numeric value from row
function getNumericValue(row, key) {
  const numKey = `${key}_num`;
  if (numKey in row) {
    return row[numKey];
  }
  // Fallback to parsing the string value
  const rawKey = key;
  if (rawKey in row) {
    const str = String(row[rawKey]).replace(/[^\d.-]/g, '');
    return parseFloat(str);
  }
  return NaN;
}

/** Build {x,y} datasets from newest-first rows for specified keys */
function buildDatasets(rowsNewestFirst, keys, limit = CHART_MAX_LOGS) {
  if (!Array.isArray(rowsNewestFirst) || !rowsNewestFirst.length) return [];
  const rows = [...rowsNewestFirst.slice(0, limit)].reverse(); // oldest→newest

  // Define a color palette for different series
  const colorPalette = {
    // Temperature and Environmental
    'Temp': '#FF5252',           // Red
    'Humidity': '#2196F3',       // Blue
    'Pressure': '#795548',       // Brown
    'Gas': '#607D8B',           // Blue Grey
    'UV': '#FFC107',            // Amber
    'Wind Speed': '#00BCD4',     // Cyan
    'Rainfall Amount': '#3F51B5', // Indigo
    
    // Voltage measurements
    'Solar Voltage': '#FF9800',  // Orange
    'Battery Voltage': '#4CAF50', // Green
    'System Voltage': '#9C27B0',  // Purple
    
    // Current measurements
    'Solar Current': '#FF9800',   // Orange
    'Battery Current': '#4CAF50', // Green
    'System Current': '#9C27B0',  // Purple
    
    // Power measurements 
    'Solar Power': '#FF9800',     // Orange
    'Battery Power': '#4CAF50',  // Green
    'System Power': '#9C27B0'    // Purple
  };

  return keys.map(key => {
    const data = rows.map(r => {
      const d = new Date(r.timestamp.replace(' ', 'T'));
      const y = getNumericValue(r, key);
      const point = (!isNaN(d) && Number.isFinite(y)) ? { x: d, y } : { x: d, y: NaN };
      return point;
    });

    // Get the color for this series from the palette, or generate one if not found
    const color = colorPalette[key] || '#' + Math.floor(Math.random()*16777215).toString(16);
    
    return { 
      label: DISPLAY_NAMES[key.toLowerCase()] || key,
      data,
      borderWidth: 2,
      fill: false,
      borderColor: color,
      backgroundColor: color,
      tension: 0.3, // Add slight curve to lines
      pointRadius: 0, // Hide points
      pointHoverRadius: 5, // Show points on hover
    };
  });
}

/** Fix the x-axis to the last 24 hours */
function applyDailyWindow(chart) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  chart.options.scales.x.min = new Date(now - dayMs);
  chart.options.scales.x.max = new Date(now);
  chart.options.scales.x.time.unit = 'hour';
  chart.options.scales.x.time.displayFormats = { hour: 'h:mm a' };
}

/** Render table (unit values, hides *_num) */
function renderTableFromJson(rowsNewestFirst) {
  const thead = document.getElementById('sensor-head');
  const tbody = document.getElementById('sensor-data-body');
  if (!thead || !tbody) return;

  const rows = rowsNewestFirst.slice(0, TABLE_MAX_LOGS);
  const colSet = new Set(['timestamp']);
  for (const r of rows) for (const k of Object.keys(r)) {
    if (k === 'timestamp' || k.endsWith('_num')) continue;
    colSet.add(k);
  }
  const cols = Array.from(colSet);

  thead.innerHTML = `<tr>${cols.map(c => 
    `<th>${DISPLAY_NAMES[c] || c}</th>`
  ).join('')}</tr>`;
  tbody.innerHTML = rows.map(r =>
    `<tr>${cols.map(c => {
      const value = r[c] ?? '';
      const label = DISPLAY_NAMES[c] || c;
      // Add data-label for mobile view and title for hover
      return `<td data-label="${label}" title="${label}: ${value}">${value}</td>`;
    }).join('')}</tr>`
  ).join('') || `<tr><td colspan="${cols.length}" style="text-align:center; color:#6c757d;">No data</td></tr>`;
}

/** Update compass based on latest wind direction */
function updateCompass(latestRow) {
  const arrow = document.getElementById('compass-arrow');
  const valueEl = document.getElementById('compass-value');
  if (!arrow || !valueEl || !latestRow) return;

  // Get wind direction value
  const direction = getNumericValue(latestRow, 'Wind Direction');
  if (!Number.isFinite(direction)) return;

  console.log('Updating compass with direction:', direction); // Debug logging

  // rotate compass - only apply translateX and rotation
  arrow.style.transform = `translateX(-50%) rotate(${direction}deg)`;
  valueEl.textContent = `Wind Direction: ${direction.toFixed(0)}°`;
}

/** Update power flow diagram based on latest data */
function updatePowerFlow(latestRow) {
  if (!latestRow) return;

  // Get power values
  const solarPower = getNumericValue(latestRow, 'Solar Power');
  const batteryPower = getNumericValue(latestRow, 'Battery Power');
  const systemPower = getNumericValue(latestRow, 'System Power');

  // Update display values
  const solarValueEl = document.getElementById('solar-power-value');
  const batteryValueEl = document.getElementById('battery-power-value');
  const loadValueEl = document.getElementById('load-power-value');

  if (solarValueEl && Number.isFinite(solarPower)) {
    solarValueEl.textContent = `${solarPower.toFixed(2)} W`;
    solarValueEl.className = 'power-node-value ' + (solarPower >= 0 ? 'positive' : 'negative');
  }

  if (batteryValueEl && Number.isFinite(batteryPower)) {
    batteryValueEl.textContent = `${batteryPower.toFixed(2)} W`;
    batteryValueEl.className = 'power-node-value ' + (batteryPower >= 0 ? 'positive' : 'negative');
  }

  if (loadValueEl && Number.isFinite(systemPower)) {
    loadValueEl.textContent = `${Math.abs(systemPower).toFixed(2)} W`;
    loadValueEl.className = 'power-node-value positive';
  }

  // Update arrow states based on power flow
  const arrowSolarController = document.getElementById('arrow-solar-controller');
  const arrowBatteryController = document.getElementById('arrow-battery-controller');
  const arrowControllerLoad = document.getElementById('arrow-controller-load');

  if (arrowSolarController) {
    arrowSolarController.className = 'power-arrow solar-to-battery ' + (solarPower > 0 ? 'active' : 'inactive');
  }

  if (arrowBatteryController) {
    // Battery discharging (positive) means it's powering the load
    arrowBatteryController.className = 'power-arrow battery-to-load ' + (batteryPower > 0 ? 'active' : 'inactive');
  }

  if (arrowControllerLoad) {
    arrowControllerLoad.className = 'power-arrow solar-to-load ' + (systemPower < 0 ? 'active' : 'inactive');
  }
}


/** Fetch once, then update table + all charts */
function fetchAndRenderAll() {
  const url = `./sensorData.php?format=json&max=${Math.max(TABLE_MAX_LOGS, CHART_MAX_LOGS)}`;
  const msg = document.getElementById('refresh-message');

  fetch(url, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`); return r.json(); })
    .then(rowsNewestFirst => {
      if (!Array.isArray(rowsNewestFirst)) return;
      console.log('Data received:', rowsNewestFirst[0]); // Log the latest data point

      // Table
      renderTableFromJson(rowsNewestFirst);

      // Compass: latest wind direction (first element = newest)
      updateCompass(rowsNewestFirst[0]);

      // After updateCompass call, add:
      updatePowerFlow(rowsNewestFirst[0]);

      // Update battery status from latest values
      if (rowsNewestFirst[0]) {
        const latest = rowsNewestFirst[0];
        
        // Update battery voltage and status
        const voltage = getNumericValue(latest, 'Battery Voltage');
        updateBatteryIndicator(voltage);
      }

      // Left Column - Sensor Charts
      const tempChart = ensureChartFor('chartTemp');
      const humidChart = ensureChartFor('chartHumid');
      const pressChart = ensureChartFor('chartPress');
      const gasChart = ensureChartFor('chartGas');
      const uvChart = ensureChartFor('chartUV');
      const windChart = ensureChartFor('chartWind');
      const rainChart = ensureChartFor('chartRain');
      
      // Right Column - Power Charts
      const voltageChart = ensureChartFor('chartVoltage');
      const currentChart = ensureChartFor('chartCurrent');
      const powerChart = ensureChartFor('chartPower');

      // Update Sensor Charts
      if (tempChart) {
        tempChart.options.scales.y = {
          beginAtZero: false,
          grace: '10%'
        };
        const ds = buildDatasets(rowsNewestFirst, TEMP_KEYS);
        tempChart.data.datasets = ds;
        applyDailyWindow(tempChart);
        tempChart.update('none');
      }

      if (humidChart) {
        humidChart.options.scales.y = {
          beginAtZero: true,
          min: 0,
          max: 100,
          grace: '5%'
        };
        const ds = buildDatasets(rowsNewestFirst, HUMID_KEYS);
        humidChart.data.datasets = ds;
        applyDailyWindow(humidChart);
        humidChart.update('none');
      }

      if (pressChart) {
        pressChart.options.scales.y = {
          beginAtZero: false,
          grace: '5%'
        };
        const ds = buildDatasets(rowsNewestFirst, PRESS_KEYS);
        pressChart.data.datasets = ds;
        applyDailyWindow(pressChart);
        pressChart.update('none');
      }

      if (gasChart) {
        gasChart.options.scales.y = {
          beginAtZero: true,
          grace: '10%'
        };
        const ds = buildDatasets(rowsNewestFirst, GAS_KEYS);
        gasChart.data.datasets = ds;
        applyDailyWindow(gasChart);
        gasChart.update('none');
      }

      if (uvChart) {
        uvChart.options.scales.y = {
          beginAtZero: true,
          min: 0,
          max: 11,
          grace: '5%'
        };
        const ds = buildDatasets(rowsNewestFirst, UV_KEYS);
        uvChart.data.datasets = ds;
        applyDailyWindow(uvChart);
        uvChart.update('none');
      }

      if (windChart) {
        windChart.options.scales.y = {
          beginAtZero: true,
          grace: '10%'
        };
        const ds = buildDatasets(rowsNewestFirst, WIND_KEYS);
        windChart.data.datasets = ds;
        applyDailyWindow(windChart);
        windChart.update('none');
      }

      if (rainChart) {
        rainChart.options.scales.y = {
          beginAtZero: true,
          grace: '5%'
        };
        const ds = buildDatasets(rowsNewestFirst, RAIN_KEYS);
        rainChart.data.datasets = ds;
        applyDailyWindow(rainChart);
        rainChart.update('none');
      }

      // Update Power Charts
      if (voltageChart) {
        voltageChart.options.scales.y = {
          beginAtZero: true,
          min: 0,
          grace: '10%'
        };
        const ds = buildDatasets(rowsNewestFirst, VOLTAGE_KEYS);
        voltageChart.data.datasets = ds;
        applyDailyWindow(voltageChart);
        voltageChart.update('none');
      }

      if (currentChart) {
        currentChart.options.scales.y = {
          beginAtZero: false,
          grace: '10%'
        };
        const ds = buildDatasets(rowsNewestFirst, CURRENT_KEYS);
        currentChart.data.datasets = ds;
        applyDailyWindow(currentChart);
        currentChart.update('none');
      }

      if (powerChart) {
        powerChart.options.scales.y = {
          beginAtZero: true,
          grace: '10%'
        };
        const ds = buildDatasets(rowsNewestFirst, POWER_KEYS);
        powerChart.data.datasets = ds;
        applyDailyWindow(powerChart);
        powerChart.update('none');
      }

      if (msg) {
        msg.textContent = `Last updated: ${new Date().toLocaleTimeString()} | Table: ${TABLE_MAX_LOGS} latest | Chart span: 24h`;
      }
    })
    .catch(err => {
      console.error('Fetch error:', err);
      const thead = document.getElementById('sensor-head');
      const tbody = document.getElementById('sensor-data-body');
      const msg = document.getElementById('refresh-message');
      
      if (thead) thead.innerHTML = '<tr><th>Time Stamp</th><th>Error</th></tr>';
      if (tbody) tbody.innerHTML = "<tr><td colspan='2' class='error'>Failed to load data from server.</td></tr>";
      if (msg) msg.textContent = `Error loading data. Last attempt: ${new Date().toLocaleTimeString()}`;
    });

}
/** Update battery indicator in the header */
function updateBatteryIndicator(voltage) {
  const batteryText = document.getElementById('battery-text');
  const batteryIcon = document.querySelector('.battery-status #battery-icon');
  const batteryStatus = document.querySelector('.battery-status');

  // Skip update if elements aren't found
  if (!batteryText || !batteryIcon || !batteryStatus) {
    console.warn('Battery indicator elements not found');
    return;
  }

  try {
    // Calculate percentage between 2.7V (empty) and 4.5V (full)
    const percent = ((voltage - 2.7) / (4.5 - 2.7)) * 100;
    const clamped = Math.min(100, Math.max(0, percent));
    
    console.log('Battery voltage:', voltage, 'Percentage:', clamped); // Debug logging

    // Update text: voltage + percentage
    batteryText.textContent = `${voltage.toFixed(2)} V | ${clamped.toFixed(0)}%`;

    // Remove previous color classes
    batteryStatus.classList.remove('battery-full', 'battery-medium', 'battery-low');

    // Set icon and color based on % charge
    if (clamped > 50) {
      batteryIcon.textContent = "🔋"; // Full
      batteryStatus.classList.add('battery-full');
    } else if (clamped > 30) {
      batteryIcon.textContent = "🪫"; // Medium
      batteryStatus.classList.add('battery-medium');
    } else {
      batteryIcon.textContent = "⚠️"; // Low
      batteryStatus.classList.add('battery-low');
    }
  } catch (err) {
    console.warn('Error updating battery indicator:', err);
  }
}

/** Handle chart resizing and zoom */
function setupChartResizeHandling() {
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const canvas = entry.target.querySelector('canvas');
      if (canvas && canvas._chart) {
        // Update chart dimensions
        canvas._chart.options.devicePixelRatio = window.devicePixelRatio || 1;
        canvas._chart.resize();
      }
    }
  });

  // Observe all chart cards
  document.querySelectorAll('.chart-card').forEach(card => {
    resizeObserver.observe(card);
  });

  // Handle zoom events through window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      document.querySelectorAll('canvas').forEach(canvas => {
        if (canvas._chart) {
          canvas._chart.options.devicePixelRatio = window.devicePixelRatio || 1;
          canvas._chart.resize();
        }
      });
    }, 250);
  });
}

/** Start periodic refresh */
function startApp() {
  // Set initial dropdown value from localStorage
  const recordCount = document.getElementById('recordCount');
  if (recordCount) {
    const savedValue = localStorage.getItem('tableMaxLogs');
    if (savedValue) {
      recordCount.value = savedValue;
      TABLE_MAX_LOGS = parseInt(savedValue);
    }
  }

  fetchAndRenderAll();
  setInterval(fetchAndRenderAll, FETCH_EVERY_MS);
  setupChartResizeHandling();
}

// Wait for DOM content to be fully loaded before starting
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
