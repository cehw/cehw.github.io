import { getTimes } from './assets/vendor/suncalc/suncalc-2.1.1.mjs';

const HKT = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const localIso = time => new Date(Number(time) + HKT).toISOString();

// Fixed Hong Kong civil-day scale; the arc is illustrative, not solar elevation.
export function solarTimeline(time, latitude, longitude) {
  const date = new Date(time);
  const local = localIso(date);
  const midnight = Date.parse(`${local.slice(0, 10)}T00:00:00+08:00`);
  const { sunrise, sunset } = getTimes(date, latitude, longitude, 0, 480);
  const percent = value => (Number(value) - midnight) / DAY * 100;
  const daylight = date >= sunrise && date < sunset;
  const progress = (date - sunrise) / (sunset - sunrise);
  return {
    date: local.slice(0, 10),
    clock: local.slice(11, 16),
    position: percent(date),
    sunrise: localIso(sunrise).slice(11, 16),
    sunset: localIso(sunset).slice(11, 16),
    sunrisePosition: percent(sunrise),
    sunsetPosition: percent(sunset),
    daylight,
    lift: daylight ? 4 * progress * (1 - progress) * 38 : 0,
  };
}
