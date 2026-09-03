/* Pure weather helpers shared by weather.js and the Node tests.
   Works as a browser global (window.WeatherCore) and as a CommonJS module. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.WeatherCore = api;
})(typeof window !== "undefined" ? window : null, function () {
  const PLACE = "Clear Water Bay";
  const HK_TZ = "Asia/Hong_Kong";

  const LABELS = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with hail",
  };

  const COMPASS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function classify(d) {
    const code = num(d && d.weather_code, 0);
    const cover = num(d && d.cloud_cover, 0);
    const precip = num(d && d.precipitation, 0);
    if (code >= 95 && code <= 99) return "storm";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 86) || precip > 0.1) return "rain";
    if (code === 3 || cover >= 85) return "overcast";
    if ((code >= 1 && code <= 2) || code === 45 || code === 48 || cover >= 30) return "cloudy";
    return "clear";
  }

  function describe(code) {
    return LABELS[num(code, -1)] || "—";
  }

  function compass(deg) {
    const d = ((num(deg, 0) % 360) + 360) % 360;
    return COMPASS[Math.round(d / 22.5) % 16];
  }

  function windMs(kmh) {
    return Math.round((num(kmh, 0) / 3.6) * 10) / 10;
  }

  function formatLine(d, clock) {
    const t = Math.round(num(d.temperature_2m, 0));
    const ms = windMs(d.wind_speed_10m).toFixed(1);
    return `${PLACE} · ${t} °C · ${describe(d.weather_code)} · ${ms} m/s ${compass(
      d.wind_direction_10m
    )} · ${clock} HKT`;
  }

  function hkParts(date) {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: HK_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date || new Date());
    let hour = 0;
    let minute = 0;
    parts.forEach((p) => {
      if (p.type === "hour") hour = Number(p.value) % 24;
      if (p.type === "minute") minute = Number(p.value);
    });
    return { hour, minute };
  }

  function hkClock(date) {
    const { hour, minute } = hkParts(date);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // Simple hour-angle azimuth: 0 at local midnight, 180 at local noon.
  function sunAzimuthDeg(date) {
    const { hour, minute } = hkParts(date);
    return (((hour + minute / 60) / 24) * 360 + 180) % 360;
  }

  function synthetic(category, isDay) {
    const base = {
      temperature_2m: 28,
      wind_speed_10m: 14.4,
      wind_direction_10m: 110,
      is_day: isDay ? 1 : 0,
      cloud_cover: 10,
      precipitation: 0,
      weather_code: 0,
    };
    switch (category) {
      case "cloudy":
        return { ...base, cloud_cover: 55, weather_code: 2 };
      case "overcast":
        return { ...base, cloud_cover: 96, weather_code: 3 };
      case "rain":
        return { ...base, cloud_cover: 92, weather_code: 63, precipitation: 2.4, wind_speed_10m: 22 };
      case "storm":
        return { ...base, cloud_cover: 100, weather_code: 95, precipitation: 6.1, wind_speed_10m: 31 };
      default:
        return base;
    }
  }

  return { PLACE, classify, describe, compass, windMs, formatLine, hkClock, sunAzimuthDeg, synthetic };
});
