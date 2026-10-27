# Hong Kong weather

The standalone **Weather** page (`weather.html`) contains the **Local weather prediction playground**, with Hong Kong Observatory local and daily forecasts and a map that switches between station observations and experimental six-hour GNN forecasts. Like Gallery, it uses the shared navigation, background, width, fonts and themes. The homepage does not display weather readings. Legacy `index.html#weather` links redirect to the dedicated page, preserving query parameters.

## Observation-only GNN

The user selected **no Aurora**. The server reuses the CLP observation-only pilot `pilot3y_joint4_e10e5_cal20260826/ar_best.pt`, with temporal GRU, two GraphSAGE-style aggregation layers and an autoregressive GRU decoder. This is an existing exploratory model, not the adopted multimodal MMLWP or its reported benchmark. No training or formal held-out evaluation is rerun. Its frozen normalization and model parameters remain unchanged.

Inputs are 72 hours of ten-minute HKO temperature, humidity, pressure, wind speed, compass direction and gusts, with the original missing-value masks. Native output spans 24 hours; this website publishes only the first 36 ten-minute leads (six hours). Wind direction is not published. Humidity is clipped to 0–100% and speed to nonnegative values. Missing or unsupported target variables remain absent.

The map retains 12 distinct physical nodes: ten temperature/humidity sites and eight wind sites. TY1 and SHL are distinct Tsing Yi sites; TU1 and TUN are distinct Tuen Mun sites. The Tai Po temperature/humidity point is YCT. HKO and YCT have no substituted wind forecast. Changing variable changes the displayed point set. The slider selects any ten-minute lead; each selected station also offers six hourly values. HKO official forecasts and GNN outputs are explicitly distinguished, and HKO receives credit for input observations.

Local deployment sources live under `scripts/weather/gnn/`. On climet3, the runtime is `/workspace/wanghan/personal/weather/`, with the existing `han-fdn` Python environment. CLP code, checkpoints and frozen builds are read from their existing authorities and never copied into GitHub. Official past-day archives are cached in `personal/weather/archives`; live observations come from `HKO_API_ingestion`. API observations are already the calibration target domain and must not receive the historical HKO2025 correction a second time.

The existing CLP ten-minute collector is retained. Its missing owner execute permission was repaired on 2026-10-27, and both a manual fetch and a subsequent cron fetch succeeded. A separate cron entry runs `run.sh` at `27 */3 * * *` in server HKT (00:27, 03:27, …, 21:27). It fetches inputs, backfills available archives, predicts on CPU, and publishes `data/gnn.json` to `weather-data` using the server's existing GitHub SSH connection. The isolated sparse checkout preserves the HKO updater's `data/weather.json`; push conflicts rebase and retry. No credentials are copied into the website. Runtime logs are `logs/run.log`; `install_schedule.py` preserves all other cron jobs and saves a prior crontab in `_tmp/`.

The input window must have at least 90% timestamp coverage in each core feed and no network-wide gap longer than 60 minutes. Each published station-variable additionally needs 90% valid history and a reading within the last hour of the input window. These checks prevent the observed twelve-hour collector outage from being silently treated as normal station missingness. Inputs older than 30 minutes produce an unavailable state. Incomplete history produces a warming-up state with actual coverage; it does not publish predictions. Prior output survives unexpected inference errors, and the browser hides predictions after their final valid time. Historical replays are explicitly marked and rejected by the live UI.

Initial deployment status (2026-10-27): the replay at 2026-10-26 23:50 HKT ran successfully with complete 72-hour inputs and produced 10 temperature, 10 humidity and 8 wind series, each 36 leads. Live history had 83% coverage due to today's missing early observations. DATA.GOV.HK only accepts historical archive end dates through yesterday, so current predictions await the missing day's archive or sufficient new history. Scheduled runs automatically retry; the website reports this limitation rather than displaying the historical replay as current.

Manual update: `bash /workspace/wanghan/personal/weather/run.sh`. A validation replay can use `forecast.py --origin 2026-10-26T23:50 --output /workspace/wanghan/personal/weather/_tmp/replay.json`; never publish that file as live. `node --test tests/gnn.test.mjs` covers lead timestamps, malformed output, replay rejection and expiry.

## Interface

The dashboard uses Source Sans 3 throughout, sentence-case headings and four text levels: 32px page title and current reading, 20px section headings, 16px body and primary controls, and 14px supporting text. Map attribution retains a compact 11px size. Shared site navigation keeps its existing styling. Spacing follows an 8px rhythm; dates, temperatures and station controls remain readable on mobile without shrinking their text.

The map uses temperature labels, clickable station details, a station selector and a reset view. Scrolling over the map zooms it; scrolling outside the map moves the page. Selecting a date updates the Hong Kong daily forecast below the map; it does not change the observation map into a forecast map. Desktop and mobile layouts follow the homepage's light and dark themes. The interaction references are [Windy](https://www.windy.com/) (map, location selection and date browsing) and the [Observatory's regional forecast map](https://maps.weather.gov.hk/ocf/index_e.html) (numeric station labels and a time control).

`weather-stations.js` is the single coordinate source for the 27 English observation station names. Coordinates and aliases are taken from the [official station table](https://www.hko.gov.hk/en/cis/stn.htm). Leaflet 1.9.4 displays the standard OpenStreetMap basemap, with visible attribution and ordinary browser caching. The project default Mapbox token was rejected by GitHub push protection and CARTO returned key-required tiles, so this deployment uses OpenStreetMap without a map token. It fetches only the viewport tiles during interactive use, not through the scheduled workflow. A station selector remains usable if the map library is unavailable. See the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Sources and timestamps

The updater reads three official English-language JSON products, without an API key:

- [Regional observations](https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en): station temperatures and observation timestamps.
- [Local forecast](https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=flw&lang=en): the stated forecast period, narrative and outlook.
- [Nine-day forecast](https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=en): forecasts keyed by their actual dates. The first entry may be tomorrow; it must not be relabeled as today.

The published snapshot retains the products unchanged under `current`, `localForecast` and `dailyForecast`. `fetchedAt` is the website retrieval time in UTC; source `updateTime` and observation `recordTime` remain separate. `schemaVersion` is 1 and `updateIntervalHours` is 3. The UI displays times in Hong Kong time (UTC+8).

Missing values remain missing, not zero. Relative humidity in this product belongs to the Observatory station and must not be assigned to every temperature station. Rainfall districts and temperature stations are different location sets. The [official API documentation](https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf) describes these products; the [open-data catalogue](https://www.hko.gov.hk/en/abouthko/opendata_intro.htm) lists their publication frequencies. Source products can update more often than this website retrieves them.

## Three-hour updates

`.github/workflows/update-weather.yml` runs at minute 17 every three hours: 00:17, 03:17, 06:17, 09:17, 12:17, 15:17, 18:17 and 21:17 UTC. In Hong Kong these are 02:17, 05:17, 08:17, 11:17, 14:17, 17:17, 20:17 and 23:17 each day. GitHub may delay or skip scheduled runs under load, so this is a scheduled cadence rather than an exact-time service.

The workflow also runs when its own file or the updater changes on `main`, and supports manual runs. It needs `contents: write` and publishes one JSON file to the independent `weather-data` branch using the GitHub contents API. On first use it creates that branch from `main`; later updates only replace `data/weather.json`. The Weather page reads the [published snapshot](https://raw.githubusercontent.com/cehw/cehw.github.io/weather-data/data/weather.json). No user API token is required.

The existing Pages publishing settings remain in place. Data updates do not need a new Pages build; they are read directly from the data branch. This matters because commits made using `GITHUB_TOKEN` do not trigger a normal Pages build. A copy of the initial snapshot in the main site (`./data/weather.json`) is the fallback when the data endpoint is unreachable; the page identifies this fallback and displays its actual dates.

If any source fails or returns unusable data, the updater fails before replacing the previous snapshot. The workflow therefore leaves the published file intact. The page marks retrieval or observation times more than six hours old as stale. A browser refresh failure retains the already displayed snapshot and its original retrieval time, with a manual retry control. When no snapshot can be loaded, the page links to the Observatory rather than inventing values. An open page refreshes every three hours while visible and checks for an overdue refresh when focus returns. The GitHub schedule runs independently of website visits.

In public repositories, GitHub can disable schedules after 60 days without repository activity. If updates stop, open **Actions → Update Hong Kong weather**, inspect the latest run, use **Enable workflow** if it is disabled, then **Run workflow** on `main`. A manual run tests the same data-fetching and publishing path. [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) explains delay and inactivity behavior.

## Local development

Use Node.js 24 or later. No npm dependencies are required.

```sh
node scripts/weather/update-weather.mjs
node --test tests/update-weather.test.mjs
```

The updater resolves its default output to `data/weather.json` inside this repository, even when launched from another working directory. Use `--output /absolute/path/weather.json` for a scratch snapshot. The tests cover missing observations, invalid dates, upstream HTTP/JSON failures, distinct source times, and preservation of the previous file on failure.
