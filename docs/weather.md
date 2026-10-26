# Hong Kong weather

The homepage's **Weather** section (`index.html#weather`) contains the **Local Weather Prediction Playground**, with Hong Kong Observatory local and daily forecasts alongside an interactive map of station temperature observations. It shares the homepage navigation, animated background, panel width and heading styles. The previously published `weather.html` link redirects to this section. The map shows observations, not a spatial forecast. A GNN six-hour forecast is deferred until a trained model and its inference inputs are available.

## Interface

The map uses temperature labels, clickable station details, a station selector and a reset view. Selecting a date updates the Hong Kong daily forecast below the map; it does not change the observation map into a forecast map. Desktop and mobile layouts follow the homepage's light and dark themes. The interaction references are [Windy](https://www.windy.com/) (map, location selection and date browsing) and the [Observatory's regional forecast map](https://maps.weather.gov.hk/ocf/index_e.html) (numeric station labels and a time control).

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

The workflow also runs when its own file or the updater changes on `main`, and supports manual runs. It needs `contents: write` and publishes one JSON file to the independent `weather-data` branch using the GitHub contents API. On first use it creates that branch from `main`; later updates only replace `data/weather.json`. The homepage reads the [published snapshot](https://raw.githubusercontent.com/cehw/cehw.github.io/weather-data/data/weather.json). No user API token is required.

The existing Pages publishing settings remain in place. Data updates do not need a new Pages build; they are read directly from the data branch. This matters because commits made using `GITHUB_TOKEN` do not trigger a normal Pages build. A copy of the initial snapshot in the main site (`./data/weather.json`) is the fallback when the data endpoint is unreachable; the page identifies this fallback and displays its actual dates.

If any source fails or returns unusable data, the updater fails before replacing the previous snapshot. The workflow therefore leaves the published file intact. The page marks retrieval or observation times more than six hours old as stale. A browser refresh failure retains the already displayed snapshot and its original retrieval time, with a manual retry control. When no snapshot can be loaded, the page links to the Observatory rather than inventing values. An open page refreshes every three hours while visible and checks for an overdue refresh when focus returns. The GitHub schedule runs independently of website visits.

In public repositories, GitHub can disable schedules after 60 days without repository activity. If updates stop, open **Actions → Update Hong Kong weather**, inspect the latest run, use **Enable workflow** if it is disabled, then **Run workflow** on `main`. A manual run tests the same data-fetching and publishing path. [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) explains delay and inactivity behavior.

## Local development

Use Node.js 24 or later. No npm dependencies are required.

```sh
node scripts/update-weather.mjs
node --test tests/update-weather.test.mjs
```

The updater resolves its default output to `data/weather.json` inside this repository, even when launched from another working directory. Use `--output /absolute/path/weather.json` for a scratch snapshot. The tests cover missing observations, invalid dates, upstream HTTP/JSON failures, distinct source times, and preservation of the previous file on failure.
