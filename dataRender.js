// Config
const TABLE_MAX_LOGS = 3;          // table rows (newest-first)
const CHART_MAX_LOGS = 6000;       // ~24h at ~15s/sample
const FETCH_EVERY_MS = 10000;      // fetch cadence (10s)

// Metric groups (display keys; JSON also includes <key>_num for plotting)
const ENV_KEYS = ['Pressure', 'Wind Speed', 'Rain Detector'];
const POWER_KEYS = ['Solar Power', 'System Power'];
const TEMP_KEY = ['Temp'];
const VOLTAGE_KEY = ['System Voltage'];

/** Ensure Chart.js instance for given canvas */
function ensureChartFor(canvasId) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  if (el._chart) return el._chart;

  el._chart = new Chart(el, {
    type: 'line',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 100,
      animation: false,
      parsing: false,
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
          labels: { boxWidth: 16, padding: 10, font: { size: 12 } }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => {
              const value = ctx.parsed.y;
              return Number.isFinite(value) ? `${ctx.dataset.label}: ${value}` : `${ctx.dataset.label}: --`;
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

/** Build {x,y} datasets from newest-first rows for specified keys */
function buildDatasets(rowsNewestFirst, keys, limit = CHART_MAX_LOGS) {
  if (!Array.isArray(rowsNewestFirst) || !rowsNewestFirst.length) return [];
  const rows = [...rowsNewestFirst.slice(0, limit)].reverse(); // oldest→newest

  return keys.map(key => {
    const data = rows.map(r => {
      const d = new Date(r.timestamp.replace(' ', 'T'));
      const raw = (key + '_num') in r ? r[key + '_num'] : r[key];
      const y = Number.isFinite(+raw) ? +raw : parseFloat(String(raw));
      return (!isNaN(d) && Number.isFinite(y)) ? { x: d, y } : { x: d, y: NaN };
    });
    return { label: key, data };
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

  thead.innerHTML = `<tr>${cols.map(c => `<th>${c === 'timestamp' ? 'Time Stamp' : c}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(r =>
    `<tr>${cols.map(c => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`
  ).join('') || `<tr><td colspan="${cols.length}" style="text-align:center; color:#6c757d;">No data</td></tr>`;
}

/** Update compass based on latest wind direction */
function updateCompass(latestRow) {
  const arrow = document.getElementById('compass-arrow');
  const valueEl = document.getElementById('compass-value');
  if (!arrow || !valueEl || !latestRow) return;

  const dirKey = Object.keys(latestRow).find(k => k.toLowerCase().includes('wind direction'));
  if (!dirKey) return;

  const dirRaw = latestRow[dirKey + '_num'] ?? parseFloat(String(latestRow[dirKey]).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(dirRaw)) return;

  // rotate compass
  arrow.style.transform = `translate(-50%, -100%) rotate(${dirRaw}deg)`;
  valueEl.textContent = `Wind Direction: ${dirRaw.toFixed(0)} °`;
}


/** Fetch once, then update table + both charts */
function fetchAndRenderAll() {
  const url = `./sensorData.php?format=json&max=${Math.max(TABLE_MAX_LOGS, CHART_MAX_LOGS)}`;
  const msg = document.getElementById('refresh-message');

  fetch(url, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`); return r.json(); })
    .then(rowsNewestFirst => {
      if (!Array.isArray(rowsNewestFirst)) return;

      // Table
      renderTableFromJson(rowsNewestFirst);

      // Compass: latest wind direction (first element = newest)
      updateCompass(rowsNewestFirst[0]);

      // Battery indicator: update from latest System Voltage
      if (rowsNewestFirst[0]) {
        const latest = rowsNewestFirst[0];
        const voltKey = Object.keys(latest).find(k => k.toLowerCase().includes('system voltage'));
        if (voltKey) {
          const voltage = parseFloat(latest[voltKey]) || 0;
          updateBatteryIndicator(voltage);
        }
      }

      // Charts
      const envChart = ensureChartFor('chartEnv');
      const powerChart = ensureChartFor('chartPower');
      const tempChart = ensureChartFor('chartTemp');
      const voltageChart = ensureChartFor('chartVoltage');

      if (envChart) {
        const ds = buildDatasets(rowsNewestFirst, ENV_KEYS);
        envChart.data.datasets = ds;
        applyDailyWindow(envChart);
        envChart.update('none');
      }
      if (powerChart) {
        const ds = buildDatasets(rowsNewestFirst, POWER_KEYS);
        powerChart.data.datasets = ds;
        applyDailyWindow(powerChart);
        powerChart.update('none');
      }
      if (tempChart) {
        const ds = buildDatasets(rowsNewestFirst, TEMP_KEY);
        tempChart.data.datasets = ds;
        applyDailyWindow(tempChart);
        tempChart.update('none');
      }
      if (voltageChart) {
        voltageChart.options.scales.y = {
          beginAtZero: true,
          min: 0,
          grace: '10%'};

        const ds = buildDatasets(rowsNewestFirst, VOLTAGE_KEY);
        voltageChart.data.datasets = ds;
        applyDailyWindow(voltageChart);
        voltageChart.update('none');
      }

      if (msg) {
        msg.textContent = `Last updated: ${new Date().toLocaleTimeString()} | Table: ${TABLE_MAX_LOGS} latest | Chart span: 24h`;
      }
    })
    .catch(err => {
      console.error('Fetch error:', err);
      const thead = document.getElementById('sensor-head');
      const tbody = document.getElementById('sensor-data-body');
      if (thead) thead.innerHTML = '<tr><th>Time Stamp</th><th>Error</th></tr>';
      if (tbody) tbody.innerHTML = "<tr><td colspan='2' class='error'>Failed to load data from server.</td></tr>";
    });

}
/** Update battery indicator in the header */
function updateBatteryIndicator(voltage) {
  const batteryText = document.getElementById('battery-text');
  const batteryIcon = document.getElementById('battery-icon');
  const batteryStatus = document.querySelector('.battery-status');

  if (!batteryText || !batteryIcon || !batteryStatus) return;

  // Calculate percentage between 2.7V (empty) and 4.5V (full)
  const percent = ((voltage - 2.7) / (4.5 - 2.7)) * 100;
  const clamped = Math.min(100, Math.max(0, percent));

  // Update text: voltage + percentage
  batteryText.textContent = `${voltage.toFixed(2)} V | ${clamped.toFixed(0)}%`;

  // Remove previous color classes
  batteryStatus.classList.remove('battery-full', 'battery-medium', 'battery-low');

  // Set icon and color based on % charge
  if (clamped > 70) {
    batteryIcon.textContent = "🔋"; // Full
    batteryStatus.classList.add('battery-full');
  } else if (clamped > 40) {
    batteryIcon.textContent = "🪫"; // Medium
    batteryStatus.classList.add('battery-medium');
  } else {
    batteryIcon.textContent = "⚠️"; // Low
    batteryStatus.classList.add('battery-low');
  }
}

/** Start periodic refresh */
function startApp() {
  fetchAndRenderAll();
  setInterval(fetchAndRenderAll, FETCH_EVERY_MS);
}

startApp();
