/* Data helpers for the Hong Kong Observatory dashboard. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WeatherDashboardCore = api;
})(typeof window !== "undefined" ? window : null, function () {
  const TIME_ZONE = "Asia/Hong_Kong";

  function number(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function hkDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get("year")}${get("month")}${get("day")}`;
  }

  function dateFromKey(key) {
    if (!/^\d{8}$/.test(String(key))) return null;
    const date = new Date(`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T12:00:00+08:00`);
    return Number.isFinite(date.getTime()) && hkDate(date) === key ? date : null;
  }

  function dateLabel(key, options = { weekday: "short", month: "short", day: "numeric" }) {
    const date = dateFromKey(key);
    return date ? new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, ...options }).format(date) : "Date unavailable";
  }

  function timestamp(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime())
      ? `${new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)} HKT`
      : "Time unavailable";
  }

  function forecasts(data, now = new Date()) {
    const today = hkDate(now);
    return (data?.dailyForecast?.weatherForecast || [])
      .filter((item) => dateFromKey(item.forecastDate) && item.forecastDate >= today)
      .sort((a, b) => a.forecastDate.localeCompare(b.forecastDate));
  }

  function stations(data, coordinates) {
    return (data?.current?.temperature?.data || [])
      .filter((item) => item.place && number(item.value) !== null)
      .map((item) => ({ name: item.place, temperature: number(item.value), ...(coordinates[item.place] || {}) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function isStale(data, now = Date.now()) {
    return [data?.fetchedAt, data?.current?.temperature?.recordTime || data?.current?.updateTime]
      .some((time) => !time || !Number.isFinite(Date.parse(time)) || now - Date.parse(time) > 6 * 60 * 60 * 1000);
  }

  function usable(data) {
    return Boolean(data?.schemaVersion === 1 && Number.isFinite(Date.parse(data.fetchedAt))
      && Array.isArray(data?.current?.temperature?.data)
      && typeof data?.localForecast?.forecastDesc === "string"
      && Array.isArray(data?.dailyForecast?.weatherForecast));
  }

  function temperatureRange(items) {
    const values = items.map((item) => item.temperature).filter(Number.isFinite);
    if (!values.length) return [0, 1];
    const lo = Math.floor(Math.min(...values));
    const hi = Math.ceil(Math.max(...values));
    return [lo, hi === lo ? lo + 1 : hi];
  }

  function temperatureColor(value, range) {
    const colors = [[255, 247, 188], [254, 196, 79], [217, 95, 14], [153, 52, 4]];
    const position = Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0]))) * 3;
    const index = Math.min(2, Math.floor(position));
    const amount = position - index;
    return `rgb(${colors[index].map((part, channel) => Math.round(part + (colors[index + 1][channel] - part) * amount)).join(", ")})`;
  }

  return { number, hkDate, dateFromKey, dateLabel, timestamp, forecasts, stations, isStale, usable, temperatureRange, temperatureColor };
});
