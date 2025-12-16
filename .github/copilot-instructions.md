# Agent Instructions

- Load index.html directly in a browser; it wires up the control bar, canvas graph, and metrics table via plain scripts plus the ES module slider demo in module.js.
- index.js holds the transfer simulator: fnSpeedRecorder() collects timestamped byte totals, createRowManager() updates the table, and start/pause/resume drive fake progress—reuse speedRec.start(totalBytes) and speedRec.update(bytesDone) for real data.
- fnSpeedRecorder() now lives in speed-recorder.js so both the browser build and Node utilities can share it; inject a custom now() for deterministic tests.
- graph.js contains the renderer: createRenderGraph() draws the Explorer-style filled history, createRenderGraphAvg() handles rolling averages, and createRenderManager() switches datasets; pass {canvas, speedRec} plus optional dimension/scaling overrides.
- lib.js and graph.js expose CommonJS exports alongside their browser globals, enabling Node-side rendering with the same helpers.
- Graph radio buttons are built in index.js through addGraphSelector(); each radio invokes a closure from renderMgr.addRaw() or renderMgr.addAvg(windowMs) to swap datasets, matching the Windows progress graph behavior.
- lib.js provides helpers such as printTime() and bytesSize() for elapsed labels and axis annotations so units match the Windows dialog; keep using them wherever text output is needed.
- module.js, simpler.js, and the slider markup/CSS are auxiliary experiments sourced from @arijs/frontend—reuse their patterns for future interactive controls or style work if desired.
- snapshot.js is a Node-only smoke test that uses the canvas package to render the graph headlessly; run npm run snapshot to regenerate snapshots/graph.png when tweaking drawing logic.
