# Weather playground model

## Station coverage and implementation

The all-station version supports **39 temperature, 26 humidity and 30 wind stations**. These are **53 physical locations**, not 50: temperature/humidity and wind sites in Tsing Yi, Tuen Mun and Stanley are distinct. Wind direction remains an auxiliary model output, not a displayed forecast. Stations with insufficient recent observations are omitted per variable; no nearby site's readings are substituted. At deployment, Stanley / Bluff Head lacked enough valid wind history, giving 39 / 26 / 29 live forecasts. It returns automatically when its history passes the existing checks.

`scripts/weather/gnn/expanded.py` creates a symmetric, row-normalized four-nearest-neighbour graph from actual coordinates and reuses the CLP temporal encoder, GraphSAGE-style layers and autoregressive GRU decoder. The new graph has 53 nodes. Its initial weights come from `pilot3y_joint4_e10e5_cal20260826/ar_best.pt`, without changing that checkpoint or the original CLP source. The original 12-node implementation and the expanded implementation gave exactly equal predictions when using the same original graph and weights (first 36 leads).

The final service retains the **original model at its original 12 nodes**, because replacing those forecasts with the expanded model slightly increased errors. The expanded model supplies the additional physical stations. New temperature stations use their latest observed temperature as the starting point and the GNN's subsequent predicted changes. This corrects initial site offsets, but does not guarantee skill over persistence. This is a two-model extension, not a claim that one newly trained graph improves every station.

The runtime is `forecast-expanded.py`; `run.sh` calls it hourly on climet3. It keeps 72 hours of ten-minute inputs, missing-value masks, hourly :50 origins, and 36 ten-minute outputs. The existing history checks and stale-input behavior remain in force. The original `forecast.py` remains available for explicit rollback; there is no automatic fallback that silently changes model identity.

## Observations and geography

The existing all-station derived observations cover 2025-11-01 00:10 through 2026-08-25 23:50 HKT, 42,911 time slots. Derived wind speeds and gusts are already in m/s; native API/archive CSVs are km/h and converted once. No historical HKO2025 calibration is applied to API observations.

The old derived tables excluded Hong Kong Sea School because it has no HKO2025 station counterpart. Its own original rows were recovered from the cached wind archives, assigned the actual HSS identity and retained as a wind-only node. Overall historical speed coverage was about 91.8%; missing values stay missing.

Coordinates follow the [HKO station catalogue](https://www.hko.gov.hk/en/cis/stn.htm) and the project's existing station table. HSS uses the [official HKO regional map configuration](https://www.hko.gov.hk/en/wxinfo/awsgis/files/station-config-aws.js): 22.218300°N, 114.214290°E. It is a Co-WIN station; HKO and Hong Kong Sea School / Co-WIN are credited in model details.

## Training and exploratory backtest

The pretrained normalization and temporal encoder are frozen. Graph layers and the decoder were fine-tuned on all available station-variable targets, using three-hour origin spacing and six-hour target windows. Target periods are separated chronologically:

- Training: November 2025–March 2026, after the first full 72-hour history.
- Validation: April 2026, used to select epoch 10 of 12.
- Development backtest: May–August 2026, 455 origins spaced 370 minutes apart, retaining only valid observations with adequate input history.

Training used CPU on climet3, seed 42, AdamW at 0.0001, and the original masked multi-target loss (including circular wind-direction loss and exclusion of direction labels below 0.5 m/s). The latest-observation temperature correction was checked on April. Several variants and the original-core comparison were inspected during development; **May–August is an exploratory retrospective comparison, not an untouched blind operational test**. It does not establish extreme-event reliability or accuracy at every station.

Mean absolute error over all valid station/lead pairs in the final combined service:

| Variable | GNN service | Persistence | Unit |
| --- | ---: | ---: | --- |
| Temperature | 1.138 | 1.079 | °C |
| Relative humidity | 4.409 | 4.968 | percentage points |
| Wind speed | 1.106 | 1.211 | m/s |

Persistence holds the most recent available observation within the last hour constant over the six-hour horizon. Humidity and wind improved on this aggregate baseline; temperature **did not**. Coverage expansion must not be presented as a blanket accuracy improvement. The website exposes these limits under **Model & backtest** and remains a research playground, not an official HKO forecast.

## Files and reproduction

Server authority: `/workspace/wanghan/personal/weather/expanded/`. It contains `stations.json`, `raw.npy`, `times.npy`, `coverage.json`, `training-features.pt`, `best.pt`, `training.json`, evaluation JSON/error arrays and logs. It is separate from CLP experiment artifacts. A local private copy of observations, checkpoint, metrics and logs is in `data/weather-model/allstations53-v1/` (gitignored); the cached encoder features are not duplicated. The meteorological raw/archive collection continues separately under `data/weather-archive/`.

From the weather runtime on climet3, using the `han-fdn` environment:

```sh
python expanded.py prepare
python expanded.py finetune
python expanded.py evaluate --stride 37 --checkpoint expanded/best.pt --start 2026-05-01T00:00 --anchor-temperature --retain-core
python forecast-expanded.py --output output/gnn-candidate.json
```

Source code is maintained in this repository and deployed by scp. The frozen CLP baseline is read from its original authority. Unit checks in `tests/test_expanded_gnn.py` cover node identity and variable availability, temperature anchoring with missing observations, numerical checkpoint equivalence, and exact retention of original-node predictions. Frontend tests and actual desktop interaction confirm variable switching and station availability.
