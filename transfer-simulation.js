(function (root, factory) {
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = factory(require('./simpler.js'))
	} else {
		root.transferSimulationApi = factory(root)
	}
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
	var calcAverageSpeedsForResolution = deps.calcAverageSpeedsForResolution
	var resolveGraphMaxSpeed = deps.resolveGraphMaxSpeed
	var renderStepToCanvas = deps.renderStepToCanvas

	var TRANSFER_SIMULATION_DEFAULTS = {
		minFrame: 20,
		maxFrame: 3020,
		minRepeat: 1,
		maxRepeat: 6,
		minSizeInc: 8,
		maxSizeInc: 1024 * 1024 + 8,
		deterministicSeed: 0xC0FFEE,
	}

	var TRANSFER_UI_DEFAULTS = {
		totalSize: 256 * 1024 * 1024,
		seriesCount: 16,
	}

	function clampSeriesIndex(index, seriesCount, oneBased) {
		var count = Math.max(1, Math.floor(seriesCount || 1))
		var parsedIndex = Number.isFinite(index) ? Math.floor(index) : 0
		if (oneBased) {
			return Math.min(count, Math.max(1, parsedIndex))
		}
		return Math.min(count - 1, Math.max(0, parsedIndex))
	}

	function createSeededRandom(seed) {
		var state = seed >>> 0
		return function random() {
			state = (state * 1664525 + 1013904223) >>> 0
			return state / 0x100000000
		}
	}

	function createTransferRng(mode, seed) {
		if (mode === 'deterministic') {
			return createSeededRandom(seed >>> 0)
		}
		return Math.random
	}

	function createSeriesCollection(seriesCount) {
		var count = Math.max(1, Math.floor(seriesCount || 1))
		var series = []
		for (var i = 0; i < count; i++) {
			series.push([[0, 0]])
		}
		return series
	}

	function createFrameAndSizeGenerator(config, rngFn) {
		var merged = Object.assign({}, TRANSFER_SIMULATION_DEFAULTS, config || {})
		var rand = typeof rngFn === 'function' ? rngFn : Math.random
		var frameRepeatIdx = 1
		var frameRepeatCurrent = 1
		var frameCurrent = merged.minFrame

		function getRand(min, max) {
			return rand() * (max - min) + min
		}

		function nextFrameMs() {
			if (frameRepeatIdx < frameRepeatCurrent) {
				frameRepeatIdx += 1
			} else {
				frameCurrent = getRand(merged.minFrame, merged.maxFrame)
				frameRepeatIdx = 0
				frameRepeatCurrent = getRand(merged.minRepeat, merged.maxRepeat)
			}
			return frameCurrent
		}

		function nextSizeIncrement() {
			return getRand(merged.minSizeInc, merged.maxSizeInc)
		}

		return {
			nextFrameMs: nextFrameMs,
			nextSizeIncrement: nextSizeIncrement,
			reset: function () {
				frameRepeatIdx = 1
				frameRepeatCurrent = 1
				frameCurrent = merged.minFrame
			},
		}
	}

	function appendTransferStep(args) {
		var seriesSeries = args.seriesSeries
		var generator = args.generator
		var transferredBytes = args.transferredBytes || 0
		var elapsedMs = args.elapsedMs || 0
		var totalSize = args.totalSize || 0
		var minSizeInc = args.minSizeInc
		var maxSizeInc = args.maxSizeInc
		var baseTransferred = transferredBytes
		var lastAverage = 0
		var outOfBoundsIndex = 0

		for (var i = 0, c = seriesSeries.length; i < c; i++) {
			var size = generator.nextSizeIncrement()
			lastAverage = (lastAverage * i + size) / (i + 1)
			if (!outOfBoundsIndex && (size < minSizeInc || size > maxSizeInc)) {
				outOfBoundsIndex = i + 1
			}
			var seriesTransferred = Math.min(totalSize, baseTransferred + lastAverage)
			seriesSeries[i].push([elapsedMs, seriesTransferred])
		}

		transferredBytes = Math.min(totalSize, baseTransferred + lastAverage)

		return {
			transferredBytes: transferredBytes,
			outOfBoundsIndex: outOfBoundsIndex,
		}
	}

	function createTransferController(config) {
		var merged = Object.assign({}, TRANSFER_SIMULATION_DEFAULTS, TRANSFER_UI_DEFAULTS, config || {})
		var totalSize = Number.isFinite(merged.totalSize) && merged.totalSize > 0
			? merged.totalSize
			: 0
		var seriesCount = Math.max(1, Math.floor(merged.seriesCount || 1))
		var mode = merged.mode === 'deterministic' ? 'deterministic' : 'random'
		var seriesCollection = createSeriesCollection(seriesCount)
		var generator = createFrameAndSizeGenerator(
			merged,
			createTransferRng(mode, merged.deterministicSeed)
		)

		var startTime = 0
		var pausedAt = 0
		var pausedDuration = 0
		var logicalElapsedMs = 0
		var transferredBytes = 0
		var started = false
		var paused = false
		var finished = false

		function resetSeries() {
			seriesCollection = createSeriesCollection(seriesCount)
			transferredBytes = 0
		}

		function resetGenerator() {
			generator = createFrameAndSizeGenerator(
				merged,
				createTransferRng(mode, merged.deterministicSeed)
			)
		}

		function reset() {
			started = false
			paused = false
			finished = false
			startTime = 0
			pausedAt = 0
			pausedDuration = 0
			logicalElapsedMs = 0
			resetGenerator()
			resetSeries()
		}

		function setMode(nextMode) {
			mode = nextMode === 'deterministic' ? 'deterministic' : 'random'
			resetGenerator()
		}

		function getElapsed(nowMs) {
			if (!started) return 0
			if (mode === 'deterministic') {
				return logicalElapsedMs
			}
			var now = Number.isFinite(nowMs) ? nowMs : Date.now()
			var base = now - startTime - pausedDuration
			if (paused) base = pausedAt - startTime - pausedDuration
			return Math.max(0, base)
		}

		function start(nowMs) {
			if (started || finished) return false
			started = true
			paused = false
			startTime = Number.isFinite(nowMs) ? nowMs : Date.now()
			logicalElapsedMs = 0
			generator.reset()
			return true
		}

		function pause(nowMs) {
			if (!started || finished || paused) return false
			paused = true
			pausedAt = Number.isFinite(nowMs) ? nowMs : Date.now()
			return true
		}

		function resume(nowMs) {
			if (!started || finished || !paused) return false
			if (mode !== 'deterministic') {
				var now = Number.isFinite(nowMs) ? nowMs : Date.now()
				pausedDuration += now - pausedAt
			}
			paused = false
			return true
		}

		function cancel() {
			if (finished) return false
			finished = true
			paused = false
			return true
		}

		function nextFrameMs() {
			return generator.nextFrameMs()
		}

		function runStep(args) {
			if (paused || finished) {
				return { advanced: false, finished: finished, transferredBytes: transferredBytes }
			}
			var frameMs = Number.isFinite(args && args.frameMs) ? args.frameMs : nextFrameMs()
			if (mode === 'deterministic') {
				logicalElapsedMs += Math.max(0, Math.round(frameMs || 0))
			}
			var elapsedMs = getElapsed(args && args.nowMs)
			var stepResult = appendTransferStep({
				seriesSeries: seriesCollection,
				generator: generator,
				transferredBytes: transferredBytes,
				elapsedMs: elapsedMs,
				totalSize: totalSize,
				minSizeInc: merged.minSizeInc,
				maxSizeInc: merged.maxSizeInc,
			})
			transferredBytes = stepResult.transferredBytes
			if (transferredBytes >= totalSize) {
				finished = true
			}
			return {
				advanced: true,
				frameMs: frameMs,
				elapsedMs: elapsedMs,
				transferredBytes: transferredBytes,
				outOfBoundsIndex: stepResult.outOfBoundsIndex,
				finished: finished,
			}
		}

		function getSeries(index, oneBased) {
			var bounded = clampSeriesIndex(index, seriesCollection.length, oneBased)
			return seriesCollection[oneBased ? bounded - 1 : bounded]
		}

		return {
			reset: reset,
			setMode: setMode,
			start: start,
			pause: pause,
			resume: resume,
			cancel: cancel,
			nextFrameMs: nextFrameMs,
			runStep: runStep,
			getElapsed: getElapsed,
			getSeries: getSeries,
			getSeriesCollection: function () { return seriesCollection },
			isStarted: function () { return started },
			isPaused: function () { return paused },
			isFinished: function () { return finished },
			getMode: function () { return mode },
			getTransferredBytes: function () { return transferredBytes },
			getTotalSize: function () { return totalSize },
		}
	}

	function buildDeterministicTransferSeries(config) {
		var merged = Object.assign({}, TRANSFER_SIMULATION_DEFAULTS, config || {})
		var totalSize = Number.isFinite(merged.totalSize) && merged.totalSize > 0
			? merged.totalSize
			: 0
		var seriesCount = Math.max(1, Math.floor(merged.seriesCount || 1))
		var selectedSeriesIndex = clampSeriesIndex(merged.seriesIndex || 0, seriesCount, false)
		var rng = createTransferRng('deterministic', merged.deterministicSeed)
		var generator = createFrameAndSizeGenerator(merged, rng)
		var seriesCollection = createSeriesCollection(seriesCount)
		var elapsed = 0
		var transferred = 0

		while (transferred < totalSize) {
			var frameMs = Math.max(0, Math.round(generator.nextFrameMs()))
			elapsed += frameMs
			transferred = appendTransferStep({
				seriesSeries: seriesCollection,
				generator: generator,
				transferredBytes: transferred,
				elapsedMs: elapsed,
				totalSize: totalSize,
				minSizeInc: merged.minSizeInc,
				maxSizeInc: merged.maxSizeInc,
			}).transferredBytes
		}

		return {
			series: seriesCollection[selectedSeriesIndex],
			seriesCollection: seriesCollection,
			selectedSeriesIndex: selectedSeriesIndex,
			config: { maxValue: totalSize },
		}
	}

	function renderTransferGraphFrame(args) {
		var seriesConfig = args.seriesConfig
		var series = args.series
		var ctx = args.ctx
		var size = args.size
		var runningMaxSpeed = args.runningMaxSpeed
		var graphOptions = args.graphOptions || {}
		var renderOptions = args.renderOptions || {}
		var manageMaxSpeed = args.manageMaxSpeed !== false
		var recalculateMaxFromZero = args.recalculateMaxFromZero === true
		var nextRunningMax = Number.isFinite(runningMaxSpeed) ? runningMaxSpeed : 0
		var lastRenderedSpeed = undefined

		if (recalculateMaxFromZero) {
			nextRunningMax = 0
		}

		if (manageMaxSpeed && series.length > 1) {
			var avgResult = calcAverageSpeedsForResolution(seriesConfig, series, size, {
				pixelAverageWindow: graphOptions.pixelAverageWindow,
				ignoreTrailingSpeedSample: graphOptions.ignoreTrailingSpeedSample !== false,
			})
				if (avgResult && avgResult.localMaxAvgSpeed > 0) {
				nextRunningMax = resolveGraphMaxSpeed(avgResult.localMaxAvgSpeed, nextRunningMax, {
					maxSpeedDecay: graphOptions.maxSpeedDecay,
					maxSpeedHeadroom: graphOptions.maxSpeedHeadroom,
				})
			}
			if (avgResult && avgResult.renderPointCount > 0) {
				lastRenderedSpeed = avgResult.avgWithSpeeds[avgResult.renderPointCount - 1][2]
			}
		}

		var finalRenderOptions = renderOptions
		if (
			typeof renderOptions.speedLabelFormatter === 'function' &&
			!renderOptions.speedLabel &&
			typeof lastRenderedSpeed === 'number' &&
			Number.isFinite(lastRenderedSpeed)
		) {
			finalRenderOptions = Object.assign({}, renderOptions, {
				speedLabel: renderOptions.speedLabelFormatter(lastRenderedSpeed)
			})
		}

		renderStepToCanvas(
			seriesConfig,
			series,
			ctx,
			size,
			manageMaxSpeed ? (nextRunningMax || undefined) : undefined,
			finalRenderOptions
		)

		return { runningMaxSpeed: nextRunningMax, lastRenderedSpeed: lastRenderedSpeed }
	}

	var transferSimulationApi = {
		TRANSFER_SIMULATION_DEFAULTS: TRANSFER_SIMULATION_DEFAULTS,
		TRANSFER_UI_DEFAULTS: TRANSFER_UI_DEFAULTS,
		createSeededRandom: createSeededRandom,
		createTransferRng: createTransferRng,
		clampSeriesIndex: clampSeriesIndex,
		createSeriesCollection: createSeriesCollection,
		createFrameAndSizeGenerator: createFrameAndSizeGenerator,
		appendTransferStep: appendTransferStep,
		createTransferController: createTransferController,
		buildDeterministicTransferSeries: buildDeterministicTransferSeries,
		renderTransferGraphFrame: renderTransferGraphFrame,
	}

	if (typeof window !== 'undefined') {
		Object.assign(window, transferSimulationApi)
	}

	return transferSimulationApi
})
