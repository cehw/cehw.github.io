import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { usableGnn, gnnExpired } = require('../weather-dashboard-core.js');
const origin = Date.parse('2026-10-27T12:50:00+08:00');
function fixture() {
  return {schemaVersion: 1, status: 'ready', generatedAt: new Date(origin).toISOString(),
    originTime: new Date(origin).toISOString(), model: {usesAurora: false},
    validTimes: Array.from({length: 36}, (_, i) => new Date(origin + (i + 1) * 600000).toISOString()),
    stations: [{name: 'Hong Kong Observatory', lat: 22.3, lon: 114.17,
      forecasts: {temperature: Array(36).fill(26)}}]};
}
test('model data requires actual consecutive ten-minute leads', () => {
  const data = fixture(); assert.ok(usableGnn(data));
  data.validTimes[5] = data.validTimes[4]; assert.equal(usableGnn(data), false);
});
test('historical replay cannot become a live forecast', () => {
  assert.equal(usableGnn({...fixture(), historicalReplay: true}), false);
});
test('missing values and unsupported output variables are rejected', () => {
  const data = fixture(); data.stations[0].forecasts.temperature[2] = null;
  assert.equal(usableGnn(data), false);
  const second = fixture(); second.stations[0].forecasts.rain = Array(36).fill(0);
  assert.equal(usableGnn(second), false);
});
test('warmup cannot be shown as ready, and six-hour forecasts expire', () => {
  const warm = {...fixture(), status: 'warming_up', message: 'Waiting for observations'};
  assert.ok(usableGnn(warm)); assert.ok(gnnExpired(warm, origin));
  assert.equal(gnnExpired(fixture(), origin + 359 * 60000), false);
  assert.equal(gnnExpired(fixture(), origin + 360 * 60000), true);
});
