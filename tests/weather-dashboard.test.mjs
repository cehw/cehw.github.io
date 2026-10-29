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
  assert.deepEqual(items[0], { name: "Hong Kong Observatory", temperature: 27, observedAt: undefined, id: "HKO", lat: 22.3, lon: 114.17 });
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

test('ten-minute observations override hourly report and retain per-station times', () => {
  const data = {fetchedAt: '2026-10-29T04:23:00Z', current: {temperature: {recordTime: '2026-10-28T22:00:00Z', data: [{place: 'Hong Kong Observatory', value: 20}]}},
    stationObservations: {temperature: {recordTime: '2026-10-29T12:10:00+08:00', data: [{place: 'Hong Kong Observatory', value: 28.3, recordTime: '2026-10-29T12:10:00+08:00'}]}}};
  const items = core.stations(data, {});
  assert.equal(items[0].temperature, 28.3);
  assert.equal(items[0].observedAt, '2026-10-29T12:10:00+08:00');
  assert.equal(core.isStale(data, Date.parse('2026-10-29T04:24:00Z')), false);
});

test("constant-temperature observations still have a usable legend", () => {
  assert.deepEqual(core.temperatureRange([{ temperature: 24 }, { temperature: 24 }]), [24, 25]);
  assert.equal(core.temperatureColor(24, [24, 25]), "rgb(33, 102, 172)");
  assert.equal(core.temperatureColor(25, [24, 25]), "rgb(178, 24, 43)");
});

test('overlapping labels prioritize the selected station without dropping point data', () => {
  const points = [
    { name: 'A', x: 30, y: 30, width: 38, height: 28 },
    { name: 'B', x: 40, y: 35, width: 38, height: 28 },
    { name: 'C', x: 130, y: 40, width: 38, height: 28 },
  ];
  assert.deepEqual([...core.visibleLabelNames(points, 'B')], ['B', 'C']);
  assert.equal(points.length, 3);
  const zoomed = points.map(point => ({ ...point, x: point.x * 6, y: point.y * 6 }));
  assert.equal(core.visibleLabelNames(zoomed, 'B').size, 3);
});

test('blue-red map palette keeps readable numeric labels', () => {
  for (let value = 0; value <= 100; value++) {
    const rgb = core.temperatureColor(value, [0, 100]).match(/\d+/g).map(Number);
    const linear = rgb.map(c => c / 255 <= .04045 ? c / 255 / 12.92 : ((c / 255 + .055) / 1.055) ** 2.4);
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    const foreground = core.temperatureTextColor(value, [0, 100]);
    const contrast = foreground === '#fff' ? 1.05 / (luminance + .05) : (luminance + .05) / .05;
    assert.ok(contrast >= 4.5);
  }
});
