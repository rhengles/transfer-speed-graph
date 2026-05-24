import {
  calcAverageSpeedsForResolution,
  resolveGraphMaxSpeed,
  renderStepToCanvas,
} from './simpler.js'
import { TransferControllerRuntime } from './transfer-controller-runtime.js'
import { TransferControllerStepper } from './transfer-controller-stepper.js'

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

class TransferController {
  constructor(config) {
    this.merged = Object.assign({}, TRANSFER_SIMULATION_DEFAULTS, TRANSFER_UI_DEFAULTS, config || {})
    this.totalSize = Number.isFinite(this.merged.totalSize) && this.merged.totalSize > 0
      ? this.merged.totalSize
      : 0
    this.seriesCount = Math.max(1, Math.floor(this.merged.seriesCount || 1))
    const mode = this.merged.mode === 'deterministic' ? 'deterministic' : 'random'
    this.runtime = new TransferControllerRuntime(mode)
    this.stepper = new TransferControllerStepper({
      merged: this.merged,
      totalSize: this.totalSize,
      seriesCount: this.seriesCount,
      mode,
      createSeriesCollection,
      createFrameAndSizeGenerator,
      createTransferRng,
      appendTransferStep,
    })
  }

  resetSeries() {
    this.stepper.resetSeries()
  }

  resetGenerator() {
    this.stepper.resetGenerator(this.runtime.mode)
  }

  reset() {
    this.runtime.reset()
    this.resetGenerator()
    this.resetSeries()
  }

  setMode(nextMode) {
    this.runtime.setMode(nextMode)
    this.resetGenerator()
  }

  getElapsed(nowMs) {
    return this.runtime.getElapsed(nowMs)
  }

  start(nowMs) {
    const started = this.runtime.start(nowMs)
    if (started) {
      this.stepper.generator.reset()
    }
    return started
  }

  pause(nowMs) {
    return this.runtime.pause(nowMs)
  }

  resume(nowMs) {
    return this.runtime.resume(nowMs)
  }

  cancel() {
    return this.runtime.cancel()
  }

  nextFrameMs() {
    return this.stepper.nextFrameMs()
  }

  runStep(args) {
    if (this.runtime.paused || this.runtime.finished) {
      return { advanced: false, finished: this.runtime.finished, transferredBytes: this.stepper.transferredBytes }
    }
    const frameMs = Number.isFinite(args && args.frameMs) ? args.frameMs : this.nextFrameMs()
    this.runtime.advanceDeterministic(frameMs)
    const elapsedMs = this.getElapsed(args && args.nowMs)
    const stepResult = this.stepper.applyStep(elapsedMs)
    if (this.stepper.transferredBytes >= this.totalSize) {
      this.runtime.finished = true
    }
    return {
      advanced: true,
      frameMs,
      elapsedMs,
      transferredBytes: this.stepper.transferredBytes,
      outOfBoundsIndex: stepResult.outOfBoundsIndex,
      finished: this.runtime.finished,
    }
  }

  getSeries(index, oneBased) {
    const bounded = clampSeriesIndex(index, this.stepper.seriesCollection.length, oneBased)
    return this.stepper.seriesCollection[oneBased ? bounded - 1 : bounded]
  }

  getSeriesCollection() { return this.stepper.seriesCollection }
  isStarted() { return this.runtime.started }
  isPaused() { return this.runtime.paused }
  isFinished() { return this.runtime.finished }
  getMode() { return this.runtime.mode }
  getTransferredBytes() { return this.stepper.transferredBytes }
  getTotalSize() { return this.totalSize }
}

function createTransferController(config) {
  return new TransferController(config)
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
  TransferControllerRuntime,
  TransferControllerStepper,
  TransferController,
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
