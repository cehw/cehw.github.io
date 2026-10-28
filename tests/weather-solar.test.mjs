import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { solarTimeline } from '../weather-solar.mjs';
const require = createRequire(import.meta.url);
const {lat, lon} = require('../weather-stations.js')['Hong Kong Observatory'];
const solar = time => solarTimeline(time, lat, lon);

test('daylight uses the Hong Kong date even across UTC midnight', () => {
  const early = solar('2026-10-27T16:10:00Z');
  const noon = solar('2026-10-28T04:00:00Z');
  assert.equal(early.date, '2026-10-28');
  assert.equal(early.clock, '00:10');
  assert.equal(early.sunrise, noon.sunrise);
  assert.equal(early.sunset, noon.sunset);
  assert.equal(noon.position, 50);
  assert.ok(Math.abs(early.position - 10 / 1440 * 100) < 1e-9);
});

test('day/night changes while the full-day bounds stay fixed', () => {
  const night = solar('2026-10-28T03:00:00+08:00');
  const day = solar('2026-10-28T12:00:00+08:00');
  const evening = solar('2026-10-28T20:00:00+08:00');
  assert.equal(night.daylight, false);
  assert.equal(day.daylight, true);
  assert.equal(evening.daylight, false);
  assert.equal(night.lift, 0);
  assert.ok(day.lift > 35 && day.lift <= 38);
  assert.equal(night.sunrisePosition, evening.sunrisePosition);
  assert.equal(night.sunsetPosition, evening.sunsetPosition);
  assert.ok(day.sunrisePosition > 25 && day.sunrisePosition < 29);
  assert.ok(day.sunsetPosition > 71 && day.sunsetPosition < 76);
});

test('crossing Hong Kong midnight starts a new day on the same 24-hour scale', () => {
  const before = solar('2026-10-28T23:50:00+08:00');
  const after = solar('2026-10-29T00:00:00+08:00');
  assert.equal(before.date, '2026-10-28');
  assert.equal(after.date, '2026-10-29');
  assert.ok(before.position > 99);
  assert.equal(after.position, 0);
  assert.equal(after.daylight, false);
});
