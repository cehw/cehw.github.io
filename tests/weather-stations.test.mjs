import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const stations = require("../weather-stations.js");

// Names read from the live HKO rhrread lang=en response on 2026-10-26.
// https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en
const observedPlaces = [
  "King's Park",
  "Hong Kong Observatory",
  "Wong Chuk Hang",
  "Ta Kwu Ling",
  "Lau Fau Shan",
  "Tai Po",
  "Sha Tin",
  "Tuen Mun",
  "Tseung Kwan O",
  "Sai Kung",
  "Cheung Chau",
  "Chek Lap Kok",
  "Tsing Yi",
  "Shek Kong",
  "Tsuen Wan Ho Koon",
  "Tsuen Wan Shing Mun Valley",
  "Hong Kong Park",
  "Shau Kei Wan",
  "Kowloon City",
  "Happy Valley",
  "Wong Tai Sin",
  "Stanley",
  "Kwun Tong",
  "Sham Shui Po",
  "Kai Tak Runway Park",
  "Yuen Long Park",
  "Tai Mei Tuk",
  // Additional stations in latest_1min_temperature.csv (2026-10-29).
  "Clear Water Bay", "Kau Sai Chau", "Ngong Ping", "Pak Tam Chung", "Peng Chau",
  "Sheung Shui", "Tai Lung", "Tai Mo Shan", "Tate's Cairn", "The Peak", "Waglan Island", "Wetland Park"
];

test("every temperature station returned by HKO has a map location", () => {
  for (const place of observedPlaces) {
    assert.ok(stations[place], `No coordinates for HKO station: ${place}`);
    assert.ok(Number.isFinite(stations[place].lat), place);
    assert.ok(Number.isFinite(stations[place].lon), place);
  }
});

test("station aliases use the correct temperature station, not a nearby wind or former station", () => {
  // DMS positions from https://www.hko.gov.hk/en/cis/stn.htm.
  const anchors = [
    ["Hong Kong Observatory", "HKO", [22, 18, 7], [114, 10, 27]],
    ["Chek Lap Kok", "HKA", [22, 18, 34], [113, 55, 19]],
    ["Tsing Yi", "TY1", [22, 20, 39], [114, 6, 36]],
    ["Tai Po", "YCT", [22, 26, 54], [114, 10, 38]],
    ["Tuen Mun", "TU1", [22, 23, 9], [113, 57, 51]],
    ["Tsuen Wan Ho Koon", "TWN", [22, 23, 1], [114, 6, 28]],
    ["Tsuen Wan Shing Mun Valley", "TW", [22, 22, 32], [114, 7, 36]],
    ["Kai Tak Runway Park", "SE1", [22, 18, 18], [114, 13, 1]]
  ];
  const decimal = ([degrees, minutes, seconds]) => degrees + minutes / 60 + seconds / 3600;
  for (const [place, id, latitude, longitude] of anchors) {
    assert.equal(stations[place].id, id, place);
    assert.ok(Math.abs(stations[place].lat - decimal(latitude)) < 0.00000001, `${place} latitude`);
    assert.ok(Math.abs(stations[place].lon - decimal(longitude)) < 0.00000001, `${place} longitude`);
  }
});

test("the same coordinate mapping is exposed to the browser and CommonJS", () => {
  const context = { window: {}, module: { exports: {} } };
  vm.runInNewContext(readFileSync(new URL("../weather-stations.js", import.meta.url), "utf8"), context);
  assert.equal(context.window.WeatherStations, context.module.exports);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.WeatherStations)), stations);
});
