# Repository Guidelines

## Project Structure & Module Organization
- `index.html` is the entry point for the dashboard UI and loads `stylenew.css` plus Chart.js from CDNs.
- `dataRender.js` handles data fetching, table rendering, and chart updates; keep new metrics within the existing ENV/POWER/TEMP/VOLTAGE key arrays.
- `sensorData.php` is the JSON/HTML API backed by `sensor_log.txt`; respect strict types and helper functions when extending parsing.
- `test.php` receives GET payloads from the ESP32 and appends normalized lines into `sensor_log.txt`; sanitize any new input fields before logging.
- `sensors-log.php` and `style.css` maintain the legacy viewer; touch them only if you are supporting the older table UI.

## Build, Test, and Development Commands
- `php -S 127.0.0.1:8000` – serve the project locally; visit `http://127.0.0.1:8000/index.html` for the dashboard or `/sensors-log.php` for the legacy view.
- `php -l sensorData.php test.php` – run the built-in linter before committing any PHP changes.
- `npx prettier --check dataRender.js` – optional styling check for JS edits; install once locally with `npm install --global prettier` if not available.

## Coding Style & Naming Conventions
- Follow the existing 4-space indentation in PHP and 2-space indentation in JavaScript; prefer `camelCase` for variables and descriptive function names.
- Keep PHP `declare(strict_types=1);` at the top and guard early returns for invalid input.
- For HTML/CSS, keep classes lowercase-with-hyphen and group related rules as shown in `stylenew.css`; avoid inline styles unless dynamically required.

## Testing Guidelines
- Smoke-test API responses with `curl 'http://127.0.0.1:8000/sensorData.php?format=json&max=3'` to validate parsing output before wiring to the UI.
- Verify chart updates by simulating new log entries (`php test.php` with a crafted query string or manual edits) and refreshing the dashboard.
- No automated coverage target exists; rely on manual verification across both the modern and legacy views when modifying data shapes.

## Commit & Pull Request Guidelines
- Repository history is not yet standardized; use Conventional Commit prefixes (`feat:`, `fix:`, `chore:`) with an imperative summary, e.g., `fix: normalize wind direction parsing`.
- Reference related issues or hardware tickets in the description, and include before/after screenshots for UI adjustments.
- Confirm that PHP linting and local smoke tests passed; mention any sensor endpoints touched so reviewers can coordinate ESP32 firmware updates.

## Security & Configuration Tips
- Restrict write permissions on `sensor_log.txt` (`chmod 640 sensor_log.txt`) and avoid committing real sensor data.
- Treat incoming query parameters as untrusted; validate numeric ranges and escape output with `htmlspecialchars` to prevent injection.
