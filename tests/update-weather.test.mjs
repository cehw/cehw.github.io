import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSnapshot, updateWeather } from "../scripts/update-weather.mjs";

function fixtures() {
  return {
    rhrread: {
      updateTime: "2026-10-26T11:02:00+08:00",
      temperature: {
        recordTime: "2026-10-26T11:00:00+08:00",
        data: [{ place: "Hong Kong Observatory", value: 29, unit: "C" }],
      },
      humidity: { data: [{ place: "Hong Kong Observatory", value: 60, unit: "percent" }] },
      warningMessage: "",
    },
    flw: {
      updateTime: "2026-10-26T11:45:00+08:00",
      forecastPeriod: "Weather forecast for this afternoon and tonight",
      forecastDesc: "Mainly fine and dry.",
    },
    fnd: {
      updateTime: "2026-10-26T11:30:00+08:00",
      weatherForecast: [{
        forecastDate: "20261027", forecastWeather: "Sunny periods.",
        forecastMintemp: { value: 25, unit: "C" },
        forecastMaxtemp: { value: 30, unit: "C" },
      }],
    },
  };
}

function fetchFixture(data) {
  return async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://data.weather.gov.hk");
    assert.equal(parsed.searchParams.get("lang"), "en");
    return { ok: true, json: async () => data[parsed.searchParams.get("dataType")] };
  };
}

test("snapshot preserves source times and actual daily dates", async () => {
  const data = fixtures();
  const result = await getSnapshot({
    fetchImpl: fetchFixture(data), now: () => new Date("2026-10-26T04:17:00Z"),
  });
  assert.equal(result.fetchedAt, "2026-10-26T04:17:00.000Z");
  assert.equal(result.updateIntervalHours, 3);
  assert.equal(result.current.temperature.recordTime, "2026-10-26T11:00:00+08:00");
  assert.equal(result.localForecast.updateTime, "2026-10-26T11:45:00+08:00");
  assert.equal(result.dailyForecast.weatherForecast[0].forecastDate, "20261027");
  assert.deepEqual(result.current, data.rhrread);
});

test("missing station values remain missing while other stations are available", async () => {
  const data = fixtures();
  data.rhrread.temperature.data.push({ place: "Sha Tin", value: null, unit: "C" });
  const result = await getSnapshot({ fetchImpl: fetchFixture(data) });
  assert.equal(result.current.temperature.data[1].value, null);
});

test("all-missing observations and empty forecasts are rejected", async () => {
  for (const value of [null, "", "M"]) {
    const data = fixtures();
    data.rhrread.temperature.data[0].value = value;
    await assert.rejects(getSnapshot({ fetchImpl: fetchFixture(data) }), /no valid temperature/);
  }
  const local = fixtures();
  local.flw.forecastDesc = " ";
  await assert.rejects(getSnapshot({ fetchImpl: fetchFixture(local) }), /empty local forecast/);
  const daily = fixtures();
  daily.fnd.weatherForecast = [];
  await assert.rejects(getSnapshot({ fetchImpl: fetchFixture(daily) }), /no valid daily/);
});

test("invalid source dates and missing forecast temperatures are rejected", async () => {
  const timestamp = fixtures();
  timestamp.rhrread.temperature.recordTime = "";
  await assert.rejects(getSnapshot({ fetchImpl: fetchFixture(timestamp) }), /no valid temperature/);
  const missingTime = fixtures();
  missingTime.flw.updateTime = null;
  await assert.rejects(getSnapshot({ fetchImpl: fetchFixture(missingTime) }), /publication time/);
  const badDate = fixtures();
  badDate.fnd.weatherForecast[0].forecastDate = "20260230";
  await assert.rejects(getSnapshot({ fetchImpl: fetchFixture(badDate) }), /no valid daily/);
  const missingTemp = fixtures();
  missingTemp.fnd.weatherForecast[0].forecastMintemp.value = null;
  await assert.rejects(getSnapshot({ fetchImpl: fetchFixture(missingTemp) }), /no valid daily/);
});

test("HTTP and malformed JSON failures retain the previous file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "homepage-weather-test-"));
  const output = join(directory, "weather.json");
  const previous = '{"fetchedAt":"previous-valid-snapshot"}\n';
  await writeFile(output, previous);
  for (const fetchImpl of [
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError("invalid JSON"); } }),
    fetchFixture({ ...fixtures(), flw: {} }),
  ]) {
    await assert.rejects(updateWeather(output, { fetchImpl }));
    assert.equal(await readFile(output, "utf8"), previous);
  }
  const snapshot = await updateWeather(output, { fetchImpl: fetchFixture(fixtures()) });
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), snapshot);
});
