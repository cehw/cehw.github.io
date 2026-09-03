import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const core = require("../weather-core.js");

test("classify: WMO codes and cloud cover", () => {
  assert.equal(core.classify({ weather_code: 0, cloud_cover: 5, precipitation: 0 }), "clear");
  assert.equal(core.classify({ weather_code: 2, cloud_cover: 55, precipitation: 0 }), "cloudy");
  assert.equal(core.classify({ weather_code: 3, cloud_cover: 95, precipitation: 0 }), "overcast");
  assert.equal(core.classify({ weather_code: 61, cloud_cover: 90, precipitation: 1.2 }), "rain");
  assert.equal(core.classify({ weather_code: 95, cloud_cover: 100, precipitation: 4 }), "storm");
  assert.equal(core.classify({ weather_code: 1, cloud_cover: 70, precipitation: 0 }), "cloudy");
  assert.equal(core.classify({ weather_code: 0, cloud_cover: 90, precipitation: 0 }), "overcast");
  assert.equal(core.classify({ weather_code: 0, cloud_cover: 10, precipitation: 0.5 }), "rain");
});

test("describe: human label", () => {
  assert.equal(core.describe(0), "Clear");
  assert.equal(core.describe(2), "Partly cloudy");
  assert.equal(core.describe(3), "Overcast");
  assert.equal(core.describe(95), "Thunderstorm");
  assert.equal(core.describe(999), "—");
});

test("compass: 16-point", () => {
  assert.equal(core.compass(0), "N");
  assert.equal(core.compass(112.5), "ESE");
  assert.equal(core.compass(359), "N");
  assert.equal(core.compass(225), "SW");
});

test("formatLine", () => {
  const s = core.formatLine(
    { temperature_2m: 27.6, weather_code: 2, wind_speed_10m: 14.4, wind_direction_10m: 110 },
    "21:14"
  );
  assert.equal(s, "Clear Water Bay · 28 °C · Partly cloudy · 4.0 m/s ESE · 21:14 HKT");
});

test("hkClock formats HKT from a UTC date", () => {
  assert.equal(core.hkClock(new Date(Date.UTC(2026, 8, 3, 13, 14))), "21:14");
  assert.equal(core.hkClock(new Date(Date.UTC(2026, 8, 3, 16, 0))), "00:00");
});

test("sunAzimuthDeg: noon HKT -> 180, midnight -> 0", () => {
  assert.equal(core.sunAzimuthDeg(new Date(Date.UTC(2026, 8, 3, 4, 0))), 180);
  assert.equal(core.sunAzimuthDeg(new Date(Date.UTC(2026, 8, 3, 16, 0))), 0);
  assert.equal(core.sunAzimuthDeg(new Date(Date.UTC(2026, 8, 3, 22, 0))), 90);
});

test("synthetic payload per category", () => {
  const s = core.synthetic("storm", 0);
  assert.equal(core.classify(s), "storm");
  assert.equal(s.is_day, 0);
  assert.equal(core.classify(core.synthetic("clear", 1)), "clear");
  assert.equal(core.classify(core.synthetic("overcast", 1)), "overcast");
  assert.equal(core.classify(core.synthetic("rain", 1)), "rain");
  assert.equal(core.classify(core.synthetic("cloudy", 1)), "cloudy");
});
