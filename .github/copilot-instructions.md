# Agent Instructions

## Older process

- Load index.html directly in a browser; it wires up the control bar, canvas graph, and metrics table via plain scripts plus the ES module slider demo in module.js.
- index.js holds the transfer simulator: fnSpeedRecorder() collects timestamped byte totals, createRowManager() updates the table, and start/pause/resume drive fake progress—reuse speedRec.start(totalBytes) and speedRec.update(bytesDone) for real data.
- fnSpeedRecorder() now lives in speed-recorder.js so both the browser build and Node utilities can share it; inject a custom now() for deterministic tests.
- graph.js contains the renderer: createRenderGraph() draws the Explorer-style filled history, createRenderGraphAvg() handles rolling averages, and createRenderManager() switches datasets; pass {canvas, speedRec} plus optional dimension/scaling overrides.
- lib.js and graph.js expose CommonJS exports alongside their browser globals, enabling Node-side rendering with the same helpers.
- Graph radio buttons are built in index.js through addGraphSelector(); each radio invokes a closure from renderMgr.addRaw() or renderMgr.addAvg(windowMs) to swap datasets, matching the Windows progress graph behavior.
- lib.js provides helpers such as printTime() and bytesSize() for elapsed labels and axis annotations so units match the Windows dialog; keep using them wherever text output is needed.
- module.js, simpler.js, and the slider markup/CSS are auxiliary experiments sourced from @arijs/frontend—reuse their patterns for future interactive controls or style work if desired.
- snapshot.js is a Node-only smoke test that uses the canvas package to render the graph headlessly; run npm run snapshot to regenerate snapshots/graph.png when tweaking drawing logic.

## New process (code refactored in simpler.js)

- In simpler.js file, `calcSeriesAverage()` operates on `[time, value, speed]` tuples and returns deltas between successive steps (elapsed time/data between each pair), not totals from the beginning; treat its output as per-interval segments when piping into graph/snapshot helpers.
- `randSeries({ minCount, maxCount, minTime, maxTime, minValue, maxValue })` returns `{ config, series }` where `series` is accumulated `[time, value, speed]` samples and `config.maxValue` lets canvases map totals to pixel width; simpler-test reseeds Math.random to keep snapshots reproducible.
- `randSegment(series, offsetMin, offsetMax, lengthMin, lengthMax, getValue?, getTime?, createItem?)` slices a random subsegment either over time or size depending on the accessor trio supplied; `createSeriesItemInverted` swaps axes when you want “time over amount” instead of “amount over time”.
- `calcSeriesSpeedsAtEachInterval(series, SERIES_TIME_UNIT.ACCUMULATED|INTERVAL)` converts raw tuples into per-step deltas with consistent time semantics; pass `convertSeriesAccumulatedToDeltas(series)` plus `SERIES_TIME_UNIT.INTERVAL` when you already have deltas.
- `printSeries(series)` and `printSegment(segment)` stringify tuples for debugging, while `printAverage(calcSeriesAverage(...))` pretty-prints interval stats (sum plus any coverage holes) that get logged into simpler-test snapshots.
- Run `node simpler-test.js` to regenerate the 21-stage gallery in snapshots/simpler.png; each row adds a new datapoint to the bright bar (total progress) while the dark overlay reuses the prior shape and fills the newly completed region using the global max speed for vertical scaling.
- Inspect snapshots/simpler.json alongside the PNG to understand discrepancies: it logs the seeded input series, delta transforms, random segments, and printed averages so you can diff/debug visual glitches without stepping through the renderer.
