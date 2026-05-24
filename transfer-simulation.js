import {
  calcAverageSpeedsForResolution,
  resolveGraphMaxSpeed,
  renderStepToCanvas,
} from './simpler.js'

const TRANSFER_SIMULATION_DEFAULTS = {
  minFrame: 20,
  maxFrame: 3020,
  minRepeat: 1,
  maxRepeat: 6,
  minSizeInc: 8,
  maxSizeInc: 1024 * 1024 + 8,
  deterministicSeed: 0xC0FFEE,
}

const TRANSFER_UI_DEFAULTS = {
  totalSize: 256 * 1024 * 1024,
  seriesCount: 16,
}

function clampSeriesIndex(index, seriesCount, oneBased) {
  const count = Math.max(1, Math.floor(seriesCount || 1))
  const parsedIndex = Number.isFinite(index) ? Math.floor(index) : 0
  if (oneBased) {
    return Math.min(count, Math.max(1, parsedIndex))
  }
  return Math.min(count - 1, Math.max(0, parsedIndex))
}

function createSeededRandom(seed) {
  let state = seed >>> 0
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
  const count = Math.max(1, Math.floor(seriesCount || 1))
  const series = []
  for (let i = 0; i < count; i++) {
    series.push([[0, 0]])
  }
  return series
}

function createFrameAndSizeGenerator(config, rngFn) {
  const merged = Object.assign({}, TRANSFER_SIMULATION_DEFAULTS, config || {})
  const rand = typeof rngFn === 'function' ? rngFn : Math.random
  let frameRepeatIdx = 1
  let frameRepeatCurrent = 1
  let frameCurrent = merged.minFrame

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
    nextFrameMs,
    nextSizeIncrement,
    reset() {
      frameRepeatIdx = 1
      frameRepeatCurrent = 1
      frameCurrent = merged.minFrame
    },
  }
}

function appendTransferStep(args) {
  const seriesSeries = args.seriesSeries
  const generator = args.generator
  let transferredBytes = args.transferredBytes || 0
  const elapsedMs = args.elapsedMs || 0
  const totalSize = args.totalSize || 0
  const minSizeInc = args.minSizeInc
  const maxSizeInc = args.maxSizeInc
  const baseTransferred = transferredBytes
  let lastAverage = 0
  let outOfBoundsIndex = 0

  for (let i = 0, c = seriesSeries.length; i < c; i++) {
    const size = generator.nextSizeIncrement()
    lastAverage = (lastAverage * i + size) / (i + 1)
    if (!outOfBoundsIndex && (size < minSizeInc || size > maxSizeInc)) {
      outOfBoundsIndex = i + 1
    }
    const seriesTransferred = Math.min(totalSize, baseTransferred + lastAverage)
    seriesSeries[i].push([elapsedMs, seriesTransferred])
  }

  transferredBytes = Math.min(totalSize, baseTransferred + lastAverage)

  return {
    transferredBytes,
    outOfBoundsIndex,
  }
}

function createTransferController(config) {
  const merged = Object.assign({}, TRANSFER_SIMULATION_DEFAULTS, TRANSFER_UI_DEFAULTS, config || {})
  const totalSize = Number.isFinite(merged.totalSize) && merged.totalSize > 0
    ? merged.totalSize
    : 0
  const seriesCount = Math.max(1, Math.floor(merged.seriesCount || 1))
  let mode = merged.mode === 'deterministic' ? 'deterministic' : 'random'
  let seriesCollection = createSeriesCollection(seriesCount)
  let generator = createFrameAndSizeGenerator(
    merged,
    createTransferRng(mode, merged.deterministicSeed)
  )

  let startTime = 0
  let pausedAt = 0
  let pausedDuration = 0
  let logicalElapsedMs = 0
  let transferredBytes = 0
  let started = false
  let paused = false
  let finished = false

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
    let now = Number.isFinite(nowMs) ? nowMs : Date.now()
    let base = now - startTime - pausedDuration
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
      const now = Number.isFinite(nowMs) ? nowMs : Date.now()
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
      return { advanced: false, finished, transferredBytes }
    }
    const frameMs = Number.isFinite(args && args.frameMs) ? args.frameMs : nextFrameMs()
    if (mode === 'deterministic') {
      logicalElapsedMs += Math.max(0, Math.round(frameMs || 0))
    }
    const elapsedMs = getElapsed(args && args.nowMs)
    const stepResult = appendTransferStep({
      seriesSeries: seriesCollection,
      generator,
      transferredBytes,
      elapsedMs,
      totalSize,
      minSizeInc: merged.minSizeInc,
      maxSizeInc: merged.maxSizeInc,
    })
    transferredBytes = stepResult.transferredBytes
    if (transferredBytes >= totalSize) {
      finished = true
    }
    return {
      advanced: true,
      frameMs,
      elapsedMs,
      transferredBytes,
      outOfBoundsIndex: stepResult.outOfBoundsIndex,
      finished,
    }
  }

  function getSeries(index, oneBased) {
    const bounded = clampSeriesIndex(index, seriesCollection.length, oneBased)
    return seriesCollection[oneBased ? bounded - 1 : bounded]
  }

  return {
    reset,
    setMode,
    start,
    pause,
    resume,
    cancel,
    nextFrameMs,
    runStep,
    getElapsed,
    getSeries,
    getSeriesCollection() { return seriesCollection },
    isStarted() { return started },
    isPaused() { return paused },
    isFinished() { return finished },
    getMode() { return mode },
    getTransferredBytes() { return transferredBytes },
    getTotalSize() { return totalSize },
  }
}

function buildDeterministicTransferSeries(config) {
  const merged = Object.assign({}, TRANSFER_SIMULATION_DEFAULTS, config || {})
  const totalSize = Number.isFinite(merged.totalSize) && merged.totalSize > 0
    ? merged.totalSize
    : 0
  const seriesCount = Math.max(1, Math.floor(merged.seriesCount || 1))
  const selectedSeriesIndex = clampSeriesIndex(merged.seriesIndex || 0, seriesCount, false)
  const rng = createTransferRng('deterministic', merged.deterministicSeed)
  const generator = createFrameAndSizeGenerator(merged, rng)
  const seriesCollection = createSeriesCollection(seriesCount)
  let elapsed = 0
  let transferred = 0

  while (transferred < totalSize) {
    const frameMs = Math.max(0, Math.round(generator.nextFrameMs()))
    elapsed += frameMs
    transferred = appendTransferStep({
      seriesSeries: seriesCollection,
      generator,
      transferredBytes: transferred,
      elapsedMs: elapsed,
      totalSize,
      minSizeInc: merged.minSizeInc,
      maxSizeInc: merged.maxSizeInc,
    }).transferredBytes
  }

  return {
    series: seriesCollection[selectedSeriesIndex],
    seriesCollection,
    selectedSeriesIndex,
    config: { maxValue: totalSize },
  }
}

function renderTransferGraphFrame(args) {
  const seriesConfig = args.seriesConfig
  const series = args.series
  const ctx = args.ctx
  const size = args.size
  const runningMaxSpeed = args.runningMaxSpeed
  const graphOptions = args.graphOptions || {}
  const renderOptions = args.renderOptions || {}
  const manageMaxSpeed = args.manageMaxSpeed !== false
  const recalculateMaxFromZero = args.recalculateMaxFromZero === true
  let nextRunningMax = Number.isFinite(runningMaxSpeed) ? runningMaxSpeed : 0
  let lastRenderedSpeed

  if (recalculateMaxFromZero) {
    nextRunningMax = 0
  }

  if (manageMaxSpeed && series.length > 1) {
    const avgResult = calcAverageSpeedsForResolution(seriesConfig, series, size, {
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

  let finalRenderOptions = renderOptions
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

  return { runningMaxSpeed: nextRunningMax, lastRenderedSpeed }
}

export {
  TRANSFER_SIMULATION_DEFAULTS,
  TRANSFER_UI_DEFAULTS,
  createSeededRandom,
  createTransferRng,
  clampSeriesIndex,
  createSeriesCollection,
  createFrameAndSizeGenerator,
  appendTransferStep,
  createTransferController,
  buildDeterministicTransferSeries,
  renderTransferGraphFrame,
}
