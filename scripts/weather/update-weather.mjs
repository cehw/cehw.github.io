import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";
const DEFAULT_OUTPUT = fileURLToPath(new URL("../../data/weather.json", import.meta.url));

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasTime(value) {
  return hasText(value) && Number.isFinite(Date.parse(value));
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasDate(value) {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return false;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00+08:00`);
  return Number.isFinite(parsed.getTime()) &&
    new Date(parsed.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) === iso;
}

function validate(dataType, data) {
  if (!data || !hasTime(data.updateTime)) {
    throw new Error(`HKO ${dataType}: missing or invalid publication time`);
  }
  if (dataType === "rhrread") {
    const temperatures = data.temperature?.data;
    if (!hasTime(data.temperature?.recordTime) || !Array.isArray(temperatures) ||
        !temperatures.some((entry) => hasText(entry.place) && hasNumber(entry.value))) {
      throw new Error("HKO rhrread: no valid temperature observations");
    }
  } else if (dataType === "flw") {
    if (!hasText(data.forecastPeriod) || !hasText(data.forecastDesc)) {
      throw new Error("HKO flw: empty local forecast");
    }
  } else if (!Array.isArray(data.weatherForecast) || !data.weatherForecast.some((entry) =>
    hasDate(entry.forecastDate) && hasText(entry.forecastWeather) &&
    hasNumber(entry.forecastMintemp?.value) && hasNumber(entry.forecastMaxtemp?.value)
  )) {
    throw new Error("HKO fnd: no valid daily forecasts");
  }
  return data;
}

export async function getSnapshot({ fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const types = ["rhrread", "flw", "fnd"];
  const [current, localForecast, dailyForecast] = await Promise.all(types.map(async (dataType) => {
    const url = `${API}?dataType=${dataType}&lang=en`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HKO ${dataType}: HTTP ${response.status}`);
    return validate(dataType, await response.json());
  }));
  return {
    schemaVersion: 1,
    fetchedAt: now().toISOString(),
    updateIntervalMinutes: 10,
    current,
    localForecast,
    dailyForecast,
  };
}

export async function updateWeather(output = DEFAULT_OUTPUT, options = {}) {
  // Fetch and validate every product before replacing a previously good snapshot.
  const snapshot = await getSnapshot(options);
  if (options.stationObservations) {
    const stations = JSON.parse(await readFile(options.stationObservations, 'utf8'));
    validate('rhrread', {updateTime: stations.temperature?.recordTime, temperature: stations.temperature});
    snapshot.stationObservations = stations;
  }
  const destination = resolve(output);
  if (options.archiveDir) {
    const stamp = snapshot.fetchedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const archive = resolve(options.archiveDir, snapshot.fetchedAt.slice(0, 10), `${stamp}.json`);
    await mkdir(dirname(archive), { recursive: true });
    await writeFile(archive, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(`${destination}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(`${destination}.tmp`, destination);
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length % 2 || args.some((arg, index) => index % 2 === 0 && !['--output', '--archive-dir', '--station-observations'].includes(arg))) {
    console.error("Usage: node scripts/weather/update-weather.mjs [--output PATH] [--archive-dir PATH] [--station-observations PATH]");
    process.exitCode = 1;
  } else {
    try {
      const flags = Object.fromEntries(Array.from({length: args.length / 2}, (_, i) => [args[i * 2], args[i * 2 + 1]]));
      const snapshot = await updateWeather(flags['--output'] || DEFAULT_OUTPUT, {archiveDir: flags['--archive-dir'], stationObservations: flags['--station-observations']});
      console.log(`Weather snapshot saved: ${snapshot.fetchedAt}`);
    } catch (error) {
      console.error(`Weather update failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
