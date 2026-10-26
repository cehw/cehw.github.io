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

  host.innerHTML = `
    <div class="wx-heading">
      <div><p class="wx-kicker">HONG KONG · 香港天氣</p><h1>Local Weather Prediction Playground</h1></div>
      <button class="wx-button" id="wx-refresh" type="button">Refresh weather</button>
    </div>
    <p class="wx-intro">Explore station observations and daily forecasts. Forecasts provided by the Hong Kong Observatory; refreshed every three hours.</p>
    <p class="wx-status" id="wx-status" role="status">Loading the latest available weather…</p>
    <div id="wx-content" hidden>
      <div class="wx-overview">
        <div class="wx-map-panel">
          <div class="wx-map-heading"><h3>Temperature around Hong Kong</h3><span class="wx-badge">OBSERVATIONS</span></div>
          <div id="wx-map" class="wx-map" aria-label="Map of observed station temperatures in Hong Kong"></div>
          <p class="wx-map-notice" id="wx-map-notice" hidden></p>
          <div class="wx-map-footer"><div class="wx-legend" aria-label="Temperature colour scale"><span id="wx-legend-min"></span><span class="wx-gradient"></span><span id="wx-legend-max"></span></div><button type="button" class="wx-text-button" id="wx-reset-map">Show all stations</button></div>
          <div class="wx-station-row"><div class="wx-station-picker"><label for="wx-station">Explore a station</label><select id="wx-station"></select></div><div class="wx-station-reading"><span class="wx-temperature" id="wx-station-value"></span><span>observed temperature</span></div></div>
          <p class="wx-note" id="wx-observed-at"></p>
          <p class="wx-note">Click a temperature marker or choose a station. Drag to pan; use + / − to zoom.</p>
        </div>
        <article class="wx-today">
          <p class="wx-kicker">LOCAL WEATHER FORECAST</p><h3 id="wx-period">Today in Hong Kong</h3>
          <p id="wx-local-forecast"></p>
          <details class="wx-outlook"><summary>Outlook</summary><p id="wx-outlook"></p></details>
          <p class="wx-note" id="wx-local-issued"></p>
          <a class="wx-source-link" href="https://www.hko.gov.hk/en/wxinfo/currwx/flw.htm" target="_blank" rel="noreferrer">Full Observatory forecast ↗</a>
        </article>
      </div>
      <div class="wx-daily-heading"><h3>Hong Kong outlook</h3><p class="wx-note" id="wx-daily-issued"></p></div>
      <div class="wx-days" id="wx-days" aria-label="Choose a forecast date"></div>
      <article class="wx-day-detail" id="wx-day-detail" aria-live="polite"></article>
      <div class="wx-attribution"><p class="wx-note" id="wx-fetched-at"></p><p class="wx-note">Source: <a href="https://www.hko.gov.hk/en/abouthko/opendata_intro.htm" target="_blank" rel="noreferrer">Hong Kong Observatory open data</a> · All times HKT (UTC+8).</p></div>
    </div>
    <p class="wx-note" id="wx-error-link" hidden>Weather is temporarily unavailable. <a href="https://www.hko.gov.hk/en/index.html" target="_blank" rel="noreferrer">Visit the Hong Kong Observatory ↗</a></p>`;

  const el = (id) => document.getElementById(id);
  const set = (id, text) => { el(id).textContent = text; };
  const observationTime = () => snapshot.current.temperature.recordTime || snapshot.current.updateTime;
  const temperature = (value) => core.number(value) === null ? "—" : `${core.number(value)}°C`;

  function renderStatus() {
    if (!snapshot) return;
    const stale = core.isStale(snapshot);
    const oldData = stale ? " This snapshot or its observations are over six hours old." : " Check the timestamps below.";
    el("wx-status").classList.toggle("wx-status--warning", stale || fallback || refreshError);
    if (refreshError) set("wx-status", `Refresh unavailable — showing the last successful snapshot.${oldData}`);
    else if (fallback) set("wx-status", `Scheduled feed unavailable — showing the saved site snapshot.${oldData}`);
    else if (stale) set("wx-status", "Update delayed — this snapshot or its observations are more than six hours old.");
    else set("wx-status", "Updated every three hours · Select a station to explore local conditions.");
  }

  function selectStation(name, focusMap = false) {
    const station = stationData.find((item) => item.name === name);
    if (!station) return;
    selectedStation = name;
    el("wx-station").value = name;
    set("wx-station-value", temperature(station.temperature));
    set("wx-observed-at", `${name} · Observed ${core.timestamp(observationTime())}`);
    for (const [markerName, marker] of markers) {
      marker.getElement()?.classList.toggle("wx-marker--selected", markerName === name);
      marker.setZIndexOffset(markerName === name ? 1000 : 0);
    }
    if (focusMap && map && Number.isFinite(station.lat) && Number.isFinite(station.lon)) {
      map.panTo([station.lat, station.lon], { animate: !reducedMotion });
      markers.get(name)?.openPopup();
    }
  }

  function showAllStations() {
    const points = stationData.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
    if (map && points.length) map.fitBounds(points.map((item) => [item.lat, item.lon]), { padding: [28, 28], maxZoom: 11, animate: false });
  }

  function renderMap() {
    const L = window.L;
    const firstMap = !map;
    const range = core.temperatureRange(stationData);
    set("wx-legend-min", temperature(range[0]));
    set("wx-legend-max", temperature(range[1]));
    if (!L) {
      set("wx-map-notice", "The map could not load. All station readings remain available in the selector below.");
      el("wx-map-notice").hidden = false;
      el("wx-map").hidden = true;
      el("wx-reset-map").hidden = true;
      return;
    }
    if (!map) {
      map = L.map("wx-map", { scrollWheelZoom: false, zoomControl: true, minZoom: 9, maxZoom: 15, attributionControl: true });
      const tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 15,
      });
      tiles.on("tileerror", () => {
        set("wx-map-notice", "The basemap is unavailable. Station markers and the station selector still show the observations.");
        el("wx-map-notice").hidden = false;
      });
      tiles.addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el("wx-map"));
    }
    markerLayer.clearLayers();
    markers = new Map();
    stationData.forEach((station) => {
      if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) return;
      const position = (station.temperature - range[0]) / (range[1] - range[0]);
      const icon = L.divIcon({ className: "wx-marker", html: `<span style="background:${core.temperatureColor(station.temperature, range)};color:${position > 0.58 ? "#fff" : "#392f14"}">${station.temperature}°</span>`, iconSize: [38, 28], iconAnchor: [19, 14] });
      const popup = document.createElement("div");
      popup.className = "wx-popup";
      const name = document.createElement("strong"); name.textContent = station.name;
      const reading = document.createElement("p"); reading.textContent = `${temperature(station.temperature)} · Observed temperature`;
      const time = document.createElement("small"); time.textContent = core.timestamp(observationTime());
      popup.append(name, reading, time);
      const marker = L.marker([station.lat, station.lon], { icon, title: `${station.name}: ${temperature(station.temperature)}`, alt: `${station.name}: ${temperature(station.temperature)}`, keyboard: true })
        .bindPopup(popup).on("click", () => selectStation(station.name)).addTo(markerLayer);
      markers.set(station.name, marker);
    });
    if (firstMap) showAllStations();
  }

  function renderDayDetail(day) {
    const detail = el("wx-day-detail");
    detail.replaceChildren();
    if (!day) {
      detail.textContent = "No upcoming daily forecast is available in this snapshot. Please refresh for an update.";
      return;
    }
    const heading = document.createElement("h4"); heading.textContent = core.dateLabel(day.forecastDate, { weekday: "long", month: "long", day: "numeric" });
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
    set("wx-fetched-at", `Website snapshot: ${core.timestamp(snapshot.fetchedAt)} · Scheduled every 3 hours`);
    stationData = core.stations(snapshot, coordinates);
    const select = el("wx-station"); select.replaceChildren();
    stationData.forEach((station) => {
      const option = document.createElement("option"); option.value = station.name; option.textContent = `${station.name} · ${temperature(station.temperature)}`; select.append(option);
    });
    renderMap();
    if (!stationData.some((station) => station.name === selectedStation)) selectedStation = stationData[0]?.name;
    selectStation(selectedStation);
    renderDays();
    renderStatus();
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
  el("wx-station").addEventListener("change", (event) => selectStation(event.target.value, true));
  el("wx-reset-map").addEventListener("click", showAllStations);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastAttempt >= THREE_HOURS) refresh();
    else if (!document.hidden && snapshot) { renderStatus(); renderDays(); }
  });
  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - lastAttempt >= THREE_HOURS) refresh();
    else if (snapshot) {
      renderStatus();
      if (renderedDate !== core.hkDate()) renderDays();
    }
  }, 60 * 1000);
  refresh();
})();
