/* HKO daily forecasts and station observations, refreshed from a scheduled snapshot. */
(() => {
  const host = document.getElementById("weather-dashboard");
  const core = window.WeatherDashboardCore;
  if (!host || !core) return;
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  const REMOTE = "https://raw.githubusercontent.com/cehw/cehw.github.io/weather-data/data/weather.json";
  const LOCAL = "./data/weather.json";
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  const coordinates = window.WeatherStations || {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let snapshot = null;
  let stationData = [];
  let selectedStation = "Hong Kong Observatory";
  let selectedDate = null;
  let map = null;
  let markerLayer = null;
  let markers = new Map();
  let lastAttempt = 0;
  let busy = false;
  let fallback = false;
  let refreshError = false;
  let renderedDate = null;
  let gnn = null;
  let layer = 'observations';
  let variable = 'temperature';
  let lead = 5;
  let playbackRequested = false;
  let playbackTimer = null;
  const variables = { temperature: ['Temperature', '°C'], humidity: ['Humidity', '%'], wind: ['Wind speed', 'm/s'] };

  host.innerHTML = `
    <div class="wx-heading">
      <div><p class="wx-location">Hong Kong</p><h1>Local weather prediction playground <span aria-hidden="true">🌤️</span></h1></div>
    </div>
    <p class="wx-intro">Hong Kong Observatory observations and daily forecasts, alongside experimental six-hour GNN predictions.</p>
    <p class="wx-note wx-research-reference">Our related GNN research: <a href="https://doi.org/10.5194/acp-26-947-2026" target="_blank" rel="noreferrer">Intra-city scale graph neural networks enhance short-term air temperature forecasting</a> · Wang et al., <em>Atmospheric Chemistry and Physics</em>, 26, 947–961 (2026).</p>
    <div class="wx-update-row"><p class="wx-status" id="wx-status" role="status">Loading the latest available weather…</p><button class="wx-button" id="wx-refresh" type="button">Refresh weather</button></div>
    <div id="wx-content" hidden>
      <div class="wx-overview">
        <div class="wx-map-panel">
          <div class="wx-map-heading"><h2 id="wx-map-title">Station observations</h2></div>
          <div class="wx-layers" role="group" aria-label="Map data"><button class="wx-button" id="wx-layer-observed" aria-pressed="true">Observations</button><button class="wx-button" id="wx-layer-gnn" aria-pressed="false">GNN · next six hours</button></div>
          <div id="wx-model-state" class="wx-model-state" role="status" hidden><strong id="wx-model-state-title"></strong><p id="wx-gnn-status"></p><div id="wx-coverage" hidden><label for="wx-coverage-meter" id="wx-coverage-label"></label><meter id="wx-coverage-meter" min="0" max="100"></meter></div></div>
          <div id="wx-gnn-controls" hidden>
            <div class="wx-station-picker"><label for="wx-variable">Forecast variable</label><select id="wx-variable"><option value="temperature">Temperature · °C</option><option value="humidity">Humidity · %</option><option value="wind">Wind speed · m/s</option></select></div>
            <div class="wx-playback"><button type="button" class="wx-button" id="wx-play" aria-pressed="false">▶ Play</button><span class="wx-note">Watch the next six hours unfold.</span></div>
            <label class="wx-time-label" for="wx-lead">Forecast time <output id="wx-valid-time"></output></label>
            <input id="wx-lead" type="range" min="0" max="35" step="1" value="5" aria-label="Forecast time in ten-minute steps">
          </div>
          <div id="wx-map" class="wx-map" aria-label="Map of observed station temperatures in Hong Kong"></div>
          <p class="wx-map-notice" id="wx-map-notice" hidden></p>
          <div class="wx-map-footer"><div class="wx-legend" aria-label="Temperature colour scale"><span id="wx-legend-min"></span><span class="wx-gradient"></span><span id="wx-legend-max"></span></div><button type="button" class="wx-text-button" id="wx-reset-map">Show all stations</button></div>
          <div class="wx-station-row"><div class="wx-station-picker"><label for="wx-station">Station</label><select id="wx-station"></select></div><div class="wx-station-reading"><span class="wx-temperature" id="wx-station-value"></span><span id="wx-value-label">Temperature</span></div></div>
          <div id="wx-station-hours" class="wx-hours" hidden></div>
          <p class="wx-note" id="wx-observed-at"></p>
          <p class="wx-note" id="wx-map-help">Select any point for details. Zoom in for more labels; scroll over the map to zoom.</p>
          <p class="wx-note" id="wx-model-credit" hidden>Input observations: Hong Kong Observatory. This is not an official HKO forecast. Only model-supported physical stations are shown; temperature and wind sites can differ.</p>
        </div>
        <article class="wx-today">
          <h2>HKO local forecast</h2><p class="wx-note wx-period" id="wx-period"></p>
          <p id="wx-local-forecast"></p>
          <details class="wx-outlook"><summary>Outlook</summary><p id="wx-outlook"></p></details>
          <p class="wx-note" id="wx-local-issued"></p>
          <a class="wx-source-link" href="https://www.hko.gov.hk/en/wxinfo/currwx/flw.htm" target="_blank" rel="noreferrer">Full Observatory forecast ↗</a>
        </article>
      </div>
      <div class="wx-daily-heading"><h2>HKO daily forecast</h2><p class="wx-note" id="wx-daily-issued"></p></div>
      <div class="wx-days" id="wx-days" aria-label="Choose a forecast date"></div>
      <article class="wx-day-detail" id="wx-day-detail" aria-live="polite"></article>
      <div class="wx-attribution"><p class="wx-note" id="wx-fetched-at"></p><p class="wx-note">Observations and official forecasts: <a href="https://www.hko.gov.hk/en/abouthko/opendata_intro.htm" target="_blank" rel="noreferrer">Hong Kong Observatory open data</a>. Experimental GNN forecasts are generated independently using HKO observations. All times HKT (UTC+8).</p></div>
    </div>
    <p class="wx-note" id="wx-error-link" hidden>Weather is temporarily unavailable. <a href="https://www.hko.gov.hk/en/index.html" target="_blank" rel="noreferrer">Visit the Hong Kong Observatory ↗</a></p>`;

  const el = (id) => document.getElementById(id);
  const set = (id, text) => { el(id).textContent = text; };
  const observationTime = () => snapshot.current.temperature.recordTime || snapshot.current.updateTime;
  const temperature = (value) => core.number(value) === null ? "—" : `${core.number(value)}°C`;
  const mapReading = (value) => core.number(value) === null ? '—' : `${core.number(value)}${layer === 'observations' ? '°C' : variables[variable][1]}`;
  const mapTime = () => layer === 'observations' ? observationTime() : gnn?.validTimes?.[lead];
  const mapKind = () => layer === 'observations' ? 'Observed temperature' : `GNN ${variables[variable][0].toLowerCase()}`;

  function renderStatus() {
    if (!snapshot) return;
    const stale = core.isStale(snapshot);
    const oldData = stale ? " This snapshot or its observations are over six hours old." : " Check the timestamps below.";
    el("wx-status").classList.toggle("wx-status--warning", stale || fallback || refreshError);
    if (refreshError) set("wx-status", `Refresh unavailable — showing the last successful snapshot.${oldData}`);
    else if (fallback) set("wx-status", `Scheduled feed unavailable — showing the saved site snapshot.${oldData}`);
    else if (stale) set("wx-status", "Update delayed — this snapshot or its observations are more than six hours old.");
    else set("wx-status", "Updates every three hours.");
  }

  function selectStation(name, focusMap = false) {
    const station = stationData.find((item) => item.name === name);
    if (!station) return;
    selectedStation = name;
    el("wx-station").value = name;
    set("wx-station-value", mapReading(station.temperature));
    set("wx-observed-at", `${name} · ${layer === 'observations' ? 'Observed' : 'Valid'} ${core.timestamp(mapTime())}`);
    const hours = el('wx-station-hours'); hours.replaceChildren();
    hours.hidden = layer !== 'gnn';
    if (layer === 'gnn') {
      for (let hour = 1; hour <= 6; hour++) {
        const index = hour * 6 - 1;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'wx-day';
        button.setAttribute('aria-pressed', String(index === lead));
        const label = document.createElement('span'); label.textContent = `+${hour} h`;
        const value = document.createElement('strong'); value.textContent = mapReading(station.series[index]);
        button.title = core.timestamp(gnn.validTimes[index]); button.append(label, value);
        button.addEventListener('click', () => { playbackRequested = false; lead = index; renderStations(); }); hours.append(button);
      }
    }
    for (const [markerName, marker] of markers) {
      marker.getElement()?.classList.toggle("wx-marker--selected", markerName === name);
      marker.setZIndexOffset(markerName === name ? 1000 : 0);
    }
    updateMarkerLabels();
    if (focusMap && map && Number.isFinite(station.lat) && Number.isFinite(station.lon)) {
      map.panTo([station.lat, station.lon], { animate: !reducedMotion });
      markers.get(name)?.openPopup();
    }
  }

  function updateMarkerLabels() {
    if (!map) return;
    const size = map.getSize();
    const points = [];
    for (const [name, marker] of markers) {
      const point = map.latLngToContainerPoint(marker.getLatLng());
      if (point.x < 0 || point.y < 0 || point.x > size.x || point.y > size.y) continue;
      const label = marker.getElement()?.querySelector('.wx-marker-value');
      points.push({ name, x: point.x, y: point.y, width: label?.offsetWidth || 38, height: 28 });
    }
    const visible = core.visibleLabelNames(points, selectedStation);
    for (const [name, marker] of markers) marker.getElement()?.classList.toggle('wx-marker--label', visible.has(name));
  }

  function showAllStations() {
    const points = stationData.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
    if (map && points.length) map.fitBounds(points.map((item) => [item.lat, item.lon]), { padding: [28, 28], maxZoom: 11, animate: false });
  }

  function renderMap() {
    const L = window.L;
    const firstMap = !map;
    const range = layer === 'gnn' && stationData.length ? core.forecastRange(gnn.stations, variable) : core.temperatureRange(stationData);
    set("wx-legend-min", mapReading(range[0]));
    set("wx-legend-max", mapReading(range[1]));
    if (!L) {
      set("wx-map-notice", "The map could not load. All station readings remain available in the selector below.");
      el("wx-map-notice").hidden = false;
      el("wx-map").hidden = true;
      el("wx-reset-map").hidden = true;
      return;
    }
    if (!map) {
      map = L.map("wx-map", { scrollWheelZoom: true, zoomControl: true, minZoom: 9, maxZoom: 15, attributionControl: true });
      map.attributionControl.setPrefix(false);
      const tiles = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        attribution: 'Tiles © <a href="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer">Esri & contributors</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 15,
      });
      tiles.on("tileerror", () => {
        set("wx-map-notice", "The basemap is unavailable. Station markers and the station selector still show the observations.");
        el("wx-map-notice").hidden = false;
      });
      tiles.addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      map.on('zoomend moveend resize', updateMarkerLabels);
      if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el("wx-map"));
    }
    map.closePopup();
    markerLayer.clearLayers();
    markers = new Map();
    stationData.forEach((station) => {
      if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) return;
      const suffix = layer === 'observations' || variable === 'temperature' ? '°' : variable === 'humidity' ? '%' : '';
      const color = core.temperatureColor(station.temperature, range);
      const icon = L.divIcon({ className: "wx-marker", html: `<i class="wx-marker-dot" style="background:${color}"></i><span class="wx-marker-value" style="background:${color};color:${core.temperatureTextColor(station.temperature, range)}">${station.temperature}${suffix}</span>`, iconSize: [38, 36], iconAnchor: [19, 18] });
      const popup = document.createElement("div");
      popup.className = "wx-popup";
      const name = document.createElement("strong"); name.textContent = station.name;
      const reading = document.createElement("p"); reading.textContent = `${mapReading(station.temperature)} · ${mapKind()}`;
      const time = document.createElement("small"); time.textContent = core.timestamp(mapTime());
      popup.append(name, reading, time);
      const marker = L.marker([station.lat, station.lon], { icon, title: `${station.name}: ${mapReading(station.temperature)}`, alt: `${station.name}: ${mapReading(station.temperature)}`, keyboard: true, riseOnHover: true })
        .bindPopup(popup).on("click", () => { playbackRequested = false; syncPlayback(); selectStation(station.name); }).addTo(markerLayer);
      markers.set(station.name, marker);
    });
    if (firstMap) showAllStations();
    updateMarkerLabels();
  }

  function renderDayDetail(day) {
    const detail = el("wx-day-detail");
    detail.replaceChildren();
    if (!day) {
      detail.textContent = "No upcoming daily forecast is available in this snapshot. Please refresh for an update.";
      return;
    }
    const heading = document.createElement("h3"); heading.textContent = core.dateLabel(day.forecastDate, { weekday: "long", month: "long", day: "numeric" });
    const weather = document.createElement("p"); weather.textContent = day.forecastWeather || "Forecast description unavailable.";
    const facts = document.createElement("div"); facts.className = "wx-day-facts";
    [
      ["Temperature", `${temperature(day.forecastMintemp?.value)} – ${temperature(day.forecastMaxtemp?.value)}`],
      ["Wind", day.forecastWind || "Not available"],
      ["Rain chance", day.PSR || "Not available"],
    ].forEach(([label, value]) => {
      const item = document.createElement("p");
      const title = document.createElement("span"); title.textContent = label;
      const text = document.createElement("strong"); text.textContent = value;
      item.append(title, text); facts.append(item);
    });
    detail.append(heading, weather, facts);
  }

  function renderDays() {
    renderedDate = core.hkDate();
    const days = core.forecasts(snapshot);
    if (!days.some((day) => day.forecastDate === selectedDate)) selectedDate = days[0]?.forecastDate;
    const strip = el("wx-days"); strip.replaceChildren();
    days.forEach((day) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "wx-day";
      button.setAttribute("aria-pressed", String(day.forecastDate === selectedDate));
      const date = document.createElement("span"); date.className = "wx-day-date"; date.textContent = core.dateLabel(day.forecastDate, { day: "numeric", month: "short" });
      const weekday = document.createElement("span"); weekday.className = "wx-day-weekday"; weekday.textContent = core.dateLabel(day.forecastDate, { weekday: "short" });
      button.append(weekday, date);
      if (/^\d{2}$/.test(String(day.ForecastIcon))) {
        const icon = document.createElement("img"); icon.src = `https://www.hko.gov.hk/images/HKOWxIconOutline/pic${day.ForecastIcon}.png`; icon.alt = ""; icon.width = 44; icon.height = 44; icon.loading = "lazy"; button.append(icon);
      }
      const temp = document.createElement("strong"); temp.textContent = `${core.number(day.forecastMintemp?.value) ?? "—"}–${core.number(day.forecastMaxtemp?.value) ?? "—"}°`; button.append(temp);
      button.setAttribute("aria-label", `${core.dateLabel(day.forecastDate)}: ${day.forecastWeather || "Forecast"}, ${temp.textContent}C`);
      button.addEventListener("click", () => {
        selectedDate = day.forecastDate;
        strip.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        renderDayDetail(day);
      });
      strip.append(button);
    });
    renderDayDetail(days.find((day) => day.forecastDate === selectedDate));
  }

  function render() {
    el("wx-content").hidden = false;
    el("wx-error-link").hidden = true;
    const forecast = snapshot.localForecast;
    set("wx-period", forecast.forecastPeriod || "Local weather forecast");
    set("wx-local-forecast", forecast.forecastDesc);
    set("wx-outlook", forecast.outlook || "No outlook available.");
    set("wx-local-issued", `Issued ${core.timestamp(forecast.updateTime)}`);
    set("wx-daily-issued", `Issued ${core.timestamp(snapshot.dailyForecast.updateTime)}`);
    set("wx-fetched-at", `Last retrieved ${core.timestamp(snapshot.fetchedAt)}`);
    renderStations();
    renderDays();
    renderStatus();
  }

  function syncPlayback() {
    const available = layer === 'gnn' && gnn?.status === 'ready' && !core.gnnExpired(gnn);
    const running = available && playbackRequested && !document.hidden;
    el('wx-play').disabled = !available;
    el('wx-play').setAttribute('aria-pressed', String(running));
    set('wx-play', running ? 'Ⅱ Pause' : '▶ Play');
    if (!running && playbackTimer !== null) {
      clearInterval(playbackTimer); playbackTimer = null;
    }
    if (running && playbackTimer === null) {
      playbackTimer = setInterval(() => {
        const next = core.nextForecastLead(gnn.validTimes, lead);
        if (next < 0) { renderStations(); return; }
        lead = next;
        renderStations();
      }, 1200);
    }
  }

  function renderStations() {
    if (!snapshot) return;
    const predicted = layer === 'gnn';
    const ready = gnn?.status === 'ready' && !core.gnnExpired(gnn);
    set('wx-map-title', predicted ? 'Six-hour GNN forecast' : 'Station observations');
    set('wx-value-label', predicted ? variables[variable][0] : 'Temperature');
    el('wx-layer-observed').setAttribute('aria-pressed', String(!predicted));
    el('wx-layer-gnn').setAttribute('aria-pressed', String(predicted));
    el('wx-gnn-controls').hidden = !predicted || !ready;
    el('wx-model-state').hidden = !predicted;
    set('wx-model-state-title', ready ? 'Six-hour forecast available' : gnn?.status === 'warming_up' ? 'Collecting observations · no forecast yet' : 'Forecast currently unavailable');
    el('wx-map').classList.toggle('wx-map--empty', predicted && !ready);
    host.querySelector('.wx-station-row').hidden = predicted && !ready;
    host.querySelector('.wx-map-footer').hidden = predicted && !ready;
    set('wx-map-help', predicted && !ready ? 'Choose Observations to explore the latest available station readings.' : 'Select any point for details. Zoom in for more labels; scroll over the map to zoom.');
    el('wx-model-credit').hidden = !predicted;
    el('wx-variable').disabled = !ready;
    el('wx-lead').disabled = !ready;
    el('wx-lead').value = String(lead);
    set('wx-valid-time', ready ? `${core.timestamp(gnn.validTimes[lead])} · +${(lead + 1) * 10} min` : 'Awaiting forecast');
    set('wx-gnn-status', !gnn ? 'The model feed is temporarily unavailable. HKO observations remain available.'
      : gnn.status !== 'ready' ? gnn.message
      : !ready ? 'This forecast has expired. Waiting for a new model run.'
      : `Issued ${core.timestamp(gnn.generatedAt)} · Forecast origin ${core.timestamp(gnn.originTime)} · 10-minute steps.`);
    const coverage = Object.values(gnn?.inputCoverage || {}).filter(Number.isFinite);
    el('wx-coverage').hidden = ready || !coverage.length;
    if (coverage.length && !ready) {
      const percent = Math.round(Math.max(0, Math.min(1, Math.min(...coverage))) * 100);
      set('wx-coverage-label', `${gnn.model?.historyHours || 72}-hour observation coverage · ${percent}%`);
      el('wx-coverage-meter').value = percent;
      el('wx-gnn-status').append(` Last checked ${core.timestamp(gnn.generatedAt)}. Forecasts become available when the required observation checks pass.`);
    }
    stationData = predicted ? (ready ? gnn.stations.filter(s => s.forecasts[variable]).map(s => ({...s, temperature: s.forecasts[variable][lead], series: s.forecasts[variable]})) : [])
      : core.stations(snapshot, coordinates);
    host.querySelector('.wx-legend').hidden = !stationData.length;
    host.querySelector('.wx-legend').setAttribute('aria-label', `${predicted ? variables[variable][0] : 'Temperature'} colour scale`);
    el('wx-map').setAttribute('aria-label', predicted ? `Map of GNN ${variables[variable][0].toLowerCase()} forecasts in Hong Kong` : 'Map of observed station temperatures in Hong Kong');
    el('wx-station').disabled = !stationData.length;
    set('wx-station-value', '—'); set('wx-observed-at', '');
    el('wx-station-hours').hidden = !predicted || !ready;
    if (!stationData.length) el('wx-station-hours').replaceChildren();
    const select = el("wx-station"); select.replaceChildren();
    stationData.forEach((station) => {
      const option = document.createElement("option"); option.value = station.name; option.textContent = `${station.name} · ${mapReading(station.temperature)}`; select.append(option);
    });
    renderMap();
    if (!stationData.some((station) => station.name === selectedStation)) selectedStation = stationData[0]?.name;
    selectStation(selectedStation);
    syncPlayback();
  }

  async function refreshGnn() {
    try {
      const url = isLocal ? './data/gnn.json' : 'https://raw.githubusercontent.com/cehw/cehw.github.io/weather-data/data/gnn.json';
      const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!core.usableGnn(data)) throw new Error('Invalid GNN snapshot');
      gnn = data;
      if (gnn.status === 'ready') lead = Math.max(0, gnn.validTimes.findIndex(t => Date.parse(t) > Date.now()));
    } catch (e) { console.debug('[weather-gnn]', e.message); }
    renderStations();
  }

  async function getSnapshot(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!core.usable(data)) throw new Error("Weather snapshot is incomplete");
      return data;
    } finally { clearTimeout(timer); }
  }

  async function refresh() {
    if (busy) return;
    busy = true; lastAttempt = Date.now();
    refreshGnn();
    el("wx-refresh").disabled = true; set("wx-refresh", "Refreshing…");
    try {
      let data;
      fallback = false;
      try { data = await getSnapshot(isLocal ? LOCAL : REMOTE); }
      catch (error) {
        if (snapshot) throw error;
        data = await getSnapshot(isLocal ? REMOTE : LOCAL);
        fallback = !isLocal;
      }
      snapshot = data; refreshError = false; render();
    } catch (error) {
      refreshError = true;
      if (snapshot) renderStatus();
      else {
        set("wx-status", "Weather data could not be loaded. Please try refreshing.");
        el("wx-status").classList.add("wx-status--warning");
        el("wx-error-link").hidden = false;
      }
      console.debug("[weather-dashboard]", error.message);
    } finally {
      busy = false; el("wx-refresh").disabled = false; set("wx-refresh", "Refresh weather");
    }
  }

  el("wx-refresh").addEventListener("click", refresh);
  el("wx-station").addEventListener("focus", () => { playbackRequested = false; syncPlayback(); });
  el("wx-station").addEventListener("change", (event) => { playbackRequested = false; syncPlayback(); selectStation(event.target.value, true); });
  el("wx-reset-map").addEventListener("click", showAllStations);
  el('wx-layer-observed').addEventListener('click', () => { layer = 'observations'; playbackRequested = false; renderStations(); });
  el('wx-layer-gnn').addEventListener('click', () => { layer = 'gnn'; playbackRequested = true; renderStations(); });
  el('wx-play').addEventListener('click', () => { playbackRequested = !playbackRequested; syncPlayback(); });
  el('wx-variable').addEventListener('change', (event) => { variable = event.target.value; renderStations(); });
  el('wx-lead').addEventListener('input', (event) => { playbackRequested = false; lead = Number(event.target.value); renderStations(); });
  document.addEventListener("visibilitychange", () => {
    syncPlayback();
    if (!document.hidden && Date.now() - lastAttempt >= THREE_HOURS) refresh();
    else if (!document.hidden && snapshot) { renderStatus(); renderDays(); }
  });
  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - lastAttempt >= THREE_HOURS) refresh();
    else if (snapshot) {
      renderStatus();
      if (layer === 'gnn' && core.gnnExpired(gnn)) renderStations();
      if (renderedDate !== core.hkDate()) renderDays();
    }
  }, 60 * 1000);
  refresh();
})();
