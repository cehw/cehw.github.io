/* Live HKUST weather: fetches Open-Meteo, tags <html> with data-weather /
   data-daypart, fills the hero weather line, and dispatches "hk-weather".
   Any failure leaves the page exactly as it would be without this script. */
(() => {
  const core = window.WeatherCore;
  if (!core) return;

  const root = document.documentElement;
  const line = document.getElementById("weather-line");
  const CACHE_KEY = "hk-weather-v1";
  const CACHE_MS = 15 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 6000;
  const CATEGORIES = ["clear", "cloudy", "overcast", "rain", "storm"];
  const API =
    "https://api.open-meteo.com/v1/forecast?latitude=22.336&longitude=114.265" +
    "&current=temperature_2m,cloud_cover,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day" +
    "&timezone=Asia%2FHong_Kong";

  const params = new URLSearchParams(window.location.search);
  const override = params.get("weather");
  const overrideDay = params.get("day");
  const overrideHour = Number(params.get("hour"));
  const hasHourOverride = Number.isFinite(overrideHour) && params.get("hour") !== null;
  const isOverride = CATEGORIES.includes(override);

  let current = null;
  let updatedAt = null;

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.t !== "number" || !parsed.data) return null;
      if (Date.now() - parsed.t > CACHE_MS) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
    } catch (_) {}
  }

  function renderLine() {
    if (!line || !current) return;
    const clock = core.hkClock(new Date());
    line.textContent = core.formatLine(current, clock);
    line.setAttribute(
      "title",
      isOverride
        ? "Preview mode (synthetic data)"
        : `Open-Meteo · updated ${updatedAt ? core.hkClock(updatedAt) : clock} HKT`
    );
    line.hidden = false;
  }

  function apply(data, source) {
    const category = core.classify(data);
    const daypart = Number(data.is_day) ? "day" : "night";
    current = data;
    updatedAt = new Date();
    root.dataset.weather = category;
    root.dataset.daypart = daypart;
    const detail = {
      ...data,
      category,
      daypart,
      windMs: core.windMs(data.wind_speed_10m),
      sunAzimuthDeg: hasHourOverride ? ((overrideHour / 24) * 360) % 360 : core.sunAzimuthDeg(new Date()),
      source,
    };
    window.__HK_WEATHER__ = detail;
    renderLine();
    window.dispatchEvent(new CustomEvent("hk-weather", { detail }));
  }

  async function fetchLive() {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const res = await fetch(API, {
        signal: controller ? controller.signal : undefined,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !json.current) throw new Error("No current block");
      writeCache(json.current);
      apply(json.current, "open-meteo");
    } catch (err) {
      console.debug("[weather] unavailable:", err && err.message ? err.message : err);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function boot() {
    if (isOverride) {
      const h = new Date().getHours();
      const isDay = overrideDay === null ? h >= 6 && h < 18 : overrideDay === "1";
      apply(core.synthetic(override, isDay), "override");
      return;
    }
    const cached = readCache();
    if (cached) {
      apply(cached.data, "cache");
      return;
    }
    fetchLive();
  }

  boot();

  // Keep the clock fresh and refetch periodically while the tab is visible.
  setInterval(() => {
    if (!document.hidden) renderLine();
  }, 60 * 1000);

  if (!isOverride) {
    setInterval(() => {
      if (!document.hidden) fetchLive();
    }, CACHE_MS);
  }
})();
