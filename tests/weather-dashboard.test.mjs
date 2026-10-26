import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const core = require("../weather-dashboard-core.js");

test("missing observations remain missing instead of becoming zero", () => {
  for (const value of [null, undefined, "", " ", "M"]) assert.equal(core.number(value), null);
  assert.equal(core.number(0), 0);
  assert.equal(core.number("24.5"), 24.5);
});

test("daily forecast uses actual dates across Hong Kong midnight", () => {
  const data = { dailyForecast: { weatherForecast: [
    { forecastDate: "20261026" }, { forecastDate: "20261027" }, { forecastDate: "20261028" }, { forecastDate: "20260231" },
  ] } };
  assert.equal(core.hkDate(new Date("2026-10-26T16:00:00Z")), "20261027");
  assert.deepEqual(core.forecasts(data, new Date("2026-10-26T16:00:00Z")).map((day) => day.forecastDate), ["20261027", "20261028"]);
  assert.match(core.dateLabel("20261027"), /27 Oct/);
});

test("station matching preserves valid unlocated observations and skips missing ones", () => {
  const data = { current: { temperature: { data: [
    { place: "Hong Kong Observatory", value: 27 }, { place: "Unknown station", value: 26 }, { place: "Sha Tin", value: "M" },
  ] } } };
  const items = core.stations(data, { "Hong Kong Observatory": { id: "HKO", lat: 22.3, lon: 114.17 } });
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { name: "Hong Kong Observatory", temperature: 27, id: "HKO", lat: 22.3, lon: 114.17 });
  assert.equal(items[1].lat, undefined);
});

test("staleness considers both website fetch and source observation times", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const data = { fetchedAt: "2026-10-26T11:00:00Z", current: { temperature: { recordTime: "2026-10-26T10:30:00Z" } } };
  assert.equal(core.isStale(data, now), false);
  data.current.temperature.recordTime = "2026-10-26T05:59:00Z";
  assert.equal(core.isStale(data, now), true);
  data.current.temperature.recordTime = "2026-10-26T11:00:00Z";
  data.fetchedAt = "2026-10-26T05:00:00Z";
  assert.equal(core.isStale(data, now), true);
});

test("constant-temperature observations still have a usable legend", () => {
  assert.deepEqual(core.temperatureRange([{ temperature: 24 }, { temperature: 24 }]), [24, 25]);
  assert.equal(core.temperatureColor(24, [24, 25]), "rgb(255, 247, 188)");
  assert.equal(core.temperatureColor(25, [24, 25]), "rgb(153, 52, 4)");
});
