# Agent Instructions

## Older process (ignore for now, see simpler.js for refactored code)

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
- Dynamic Y-scale pitfall and fix: very short speed spikes can flatten the whole graph when the previous max is carried forward too aggressively. In this repo, the "R" recalc proved that recalculating with current parameters restored visibility. The applied solution is to recalculate the graph max every frame in `simpler-ui.html` (same behavior as pressing R continuously) and to prevent headroom compounding in `resolveGraphMaxSpeed()` by removing prior headroom before applying decay.

### Configurable graph parameters (simpler-ui)

The simulator exposes three runtime controls that affect how the dark-green curve is drawn and scaled:

- `pixelAverageWindow` ("Média rolante")
	- Purpose: smooths the speed series over the last N resolved graph columns (pixel-like steps).
	- Where applied: smoothing happens before both rendering and peak detection (`applyRollingAverageToSpeedSeries` in `simpler.js`).
	- Range in UI: `1` to canvas width (`CANVAS_W`, currently `416`).
	- Behavior:
		- Low values (`1-4`): more reactive graph, more jitter.
		- Medium values (`8-32`): good balance between readability and responsiveness.
		- High values (`64+`): very stable curve, but short spikes are heavily diluted.

- `maxSpeedDecay`
	- Purpose: controls how fast the dynamic Y-axis "forgets" older high peaks.
	- Where applied: `resolveGraphMaxSpeed()` in `simpler.js`.
	- Range in UI: `0.500` to `0.999`.
	- Behavior:
		- Lower (`0.80-0.93`): axis shrinks faster; graph regains height quickly after spikes.
		- Higher (`0.96-0.995`): axis keeps historical highs longer; steadier scale, but can flatten curve after brief peaks.

- `maxSpeedHeadroom`
	- Purpose: adds vertical margin above the current dynamic max to avoid clipping at the top.
	- Where applied: `resolveGraphMaxSpeed()` in `simpler.js`.
	- Range in UI: `1.00` to `2.00`.
	- Behavior:
		- Near `1.00`: curve uses almost full height, visually stronger peaks.
		- Higher (`1.10-1.30`): more top padding, safer against clipping, but visually flatter.

Important interaction notes:

- `pixelAverageWindow` affects both the curve and the local max used by dynamic scaling; it is not just cosmetic.
- Effective axis responsiveness is mostly a combination of `maxSpeedDecay` and `maxSpeedHeadroom`:
	- Higher decay + higher headroom -> more conservative axis (flatter graph).
	- Lower decay + lower headroom -> more aggressive axis (taller graph).
- The UI now recalculates dynamic max every frame (equivalent to pressing "R" continuously), so the graph does not depend on manual parameter nudges to recover visibility.

Suggested presets:

- "Raw/diagnostic" (show turbulence):
	- `pixelAverageWindow = 1`
	- `maxSpeedDecay = 0.985`
	- `maxSpeedHeadroom = 1.08`

- "Balanced Windows-like":
	- `pixelAverageWindow = 12`
	- `maxSpeedDecay = 0.965`
	- `maxSpeedHeadroom = 1.06`

- "Smooth and readable under noisy I/O":
	- `pixelAverageWindow = 28`
	- `maxSpeedDecay = 0.93`
	- `maxSpeedHeadroom = 1.03`

Troubleshooting by symptom:

- Symptom: graph looks too tiny after a short huge spike.
	- Try: lower `maxSpeedDecay` first (faster recovery), then lower `maxSpeedHeadroom`.
- Symptom: graph oscillates too much and is hard to read.
	- Try: increase `pixelAverageWindow`.
- Symptom: graph touches top edge too often.
	- Try: increase `maxSpeedHeadroom` slightly (`+0.01` to `+0.03`).

### New snapshot test (simpler-test.js)

- Run `node simpler-test.js` to regenerate the 21-stage gallery in snapshots/simpler.png; each row adds a new datapoint to the bright bar (total progress) while the dark overlay reuses the prior shape and fills the newly completed region using the max speed of all the datapoints available at each stage for vertical scaling.
- Inspect snapshots/simpler.json alongside the PNG to understand discrepancies: it logs the seeded input series, delta transforms, random segments, and printed averages so you can diff/debug visual glitches without stepping through the renderer.

## Inspiration: Windows 10 file transfer speed graph

Windows 10 provides a built-in file transfer speed graph that visually tracks your copy and move operations. To see this graph in File Explorer, simply click the "More details" arrow at the bottom of the transfer window.

See the images in the /inspiration folder for examples of the graph in action.

### Reading the Transfer Graph

- *Dark Green Graph:* Represents your live, real-time transfer speed and will fluctuate depending on what is happening in the background.
- *Light Green Background:* Indicates the general progress and speed capacity of the overall operation.
- *No Graph at Start:* It is normal for the graph to remain blank for a few moments as Windows goes through a "discovery phase" to count, calculate, and prepare the files.

### Why the Graph Fluctuates (Seesaw Effect)
- *File Size:* Many small files cause your speed to drop because Windows has to process the start/stop overhead for each individual file, whereas one large file yields a steadier graph.
- *Drive Caching:* The transfer might start out incredibly fast (writing to your computer's RAM), then suddenly plummet when the OS begins writing the data from RAM to the physical destination disk.
