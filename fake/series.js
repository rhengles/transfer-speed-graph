const TRANSFER_SIMULATION_DEFAULTS = {
  minFrame: 20,
  maxFrame: 3020,
  minFrameRepeat: 1,
  maxFrameRepeat: 1,
  minSizeInc: 8,
  maxSizeInc: 1024 * 1024 + 8,
  deterministicSeed: 0xC0FFEE,
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
      frameRepeatCurrent = getRand(merged.minFrameRepeat, merged.maxFrameRepeat)
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

export {
  TRANSFER_SIMULATION_DEFAULTS,
  clampSeriesIndex,
  createSeededRandom,
  createTransferRng,
  createSeriesCollection,
  createFrameAndSizeGenerator,
  appendTransferStep,
  buildDeterministicTransferSeries,
}