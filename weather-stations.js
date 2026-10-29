/*
 * Canonical coordinates for HKO report and ten-minute temperature station names.
 * Source: https://www.hko.gov.hk/en/cis/stn.htm (accessed 2026-10-29).
 * Converted from the source's latitude N / longitude E in degrees, minutes,
 * seconds to decimal degrees. Eight decimal places preserve the conversion;
 * the source positions themselves are specified to the nearest arcsecond.
 *
 * API aliases to the station table:
 *   Chek Lap Kok -> Hong Kong International Airport (HKA)
 *   Tsing Yi -> New Tsing Yi Station (TY1)
 *   Tai Po -> Tai Po (Yuen Chau Tsai Park), current station (YCT)
 *   Tuen Mun -> Tuen Mun Children and Juvenile Home (TU1), not wind station TUN
 *   Tsuen Wan Ho Koon -> Tsuen Wan (TWN)
 *   Tsuen Wan Shing Mun Valley -> Tsuen Wan Shing Mun Valley (TW)
 *   Kai Tak Runway Park -> SE1, not Kai Tak (SE)
 */
(function (root, factory) {
  const STATION_COORDS = factory();
  if (typeof module === "object" && module.exports) module.exports = STATION_COORDS;
  if (root && typeof root === "object") root.WeatherStations = STATION_COORDS;
})(typeof window !== "undefined" ? window : null, function () {
  return {
    "Clear Water Bay": { id: "CWB", lat: 22.26333333, lon: 114.29972222 },
    "Kau Sai Chau": { id: "KSC", lat: 22.37027778, lon: 114.31250000 },
    "Ngong Ping": { id: "NGP", lat: 22.25861111, lon: 113.91277778 },
    "Pak Tam Chung": { id: "TYW", lat: 22.40277778, lon: 114.32305556 },
    "Peng Chau": { id: "PEN", lat: 22.29111111, lon: 114.04333333 },
    "Sheung Shui": { id: "SSH", lat: 22.50194444, lon: 114.11111111 },
    "Tai Lung": { id: "TLS", lat: 22.48472222, lon: 114.11750000 },
    "Tai Mo Shan": { id: "TMS", lat: 22.41055556, lon: 114.12444444 },
    "Tate's Cairn": { id: "TC", lat: 22.35777778, lon: 114.21777778 },
    "The Peak": { id: "VP1", lat: 22.26416667, lon: 114.15500000 },
    "Waglan Island": { id: "WGL", lat: 22.18222222, lon: 114.30333333 },
    "Wetland Park": { id: "WLP", lat: 22.46666667, lon: 114.00888889 },
    "King's Park": { id: "KP", lat: 22.31194444, lon: 114.17277778 },
    "Hong Kong Observatory": { id: "HKO", lat: 22.30194444, lon: 114.17416667 },
    "Wong Chuk Hang": { id: "HKS", lat: 22.24777778, lon: 114.17361111 },
    "Ta Kwu Ling": { id: "TKL", lat: 22.52861111, lon: 114.15666667 },
    "Lau Fau Shan": { id: "LFS", lat: 22.46888889, lon: 113.98361111 },
    "Tai Po": { id: "YCT", lat: 22.44833333, lon: 114.17722222 },
    "Sha Tin": { id: "SHA", lat: 22.40250000, lon: 114.21000000 },
    "Tuen Mun": { id: "TU1", lat: 22.38583333, lon: 113.96416667 },
    "Tseung Kwan O": { id: "JKB", lat: 22.31583333, lon: 114.25555556 },
    "Sai Kung": { id: "SKG", lat: 22.37555556, lon: 114.27444444 },
    "Cheung Chau": { id: "CCH", lat: 22.20111111, lon: 114.02666667 },
    "Chek Lap Kok": { id: "HKA", lat: 22.30944444, lon: 113.92194444 },
    "Tsing Yi": { id: "TY1", lat: 22.34416667, lon: 114.11000000 },
    "Shek Kong": { id: "SEK", lat: 22.43611111, lon: 114.08472222 },
    "Tsuen Wan Ho Koon": { id: "TWN", lat: 22.38361111, lon: 114.10777778 },
    "Tsuen Wan Shing Mun Valley": { id: "TW", lat: 22.37555556, lon: 114.12666667 },
    "Hong Kong Park": { id: "HKP", lat: 22.27833333, lon: 114.16222222 },
    "Shau Kei Wan": { id: "SKW", lat: 22.28166667, lon: 114.23611111 },
    "Kowloon City": { id: "KLT", lat: 22.33500000, lon: 114.18472222 },
    "Happy Valley": { id: "HPV", lat: 22.27055556, lon: 114.18361111 },
    "Wong Tai Sin": { id: "WTS", lat: 22.33944444, lon: 114.20527778 },
    "Stanley": { id: "STY", lat: 22.21416667, lon: 114.21861111 },
    "Kwun Tong": { id: "KTG", lat: 22.31861111, lon: 114.22472222 },
    "Sham Shui Po": { id: "SSP", lat: 22.33583333, lon: 114.13694444 },
    "Kai Tak Runway Park": { id: "SE1", lat: 22.30500000, lon: 114.21694444 },
    "Yuen Long Park": { id: "YLP", lat: 22.44083333, lon: 114.01833333 },
    "Tai Mei Tuk": { id: "PLC", lat: 22.47527778, lon: 114.23750000 }
  };
});
