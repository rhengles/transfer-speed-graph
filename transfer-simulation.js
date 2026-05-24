import { TransferControllerRuntime } from './transfer-controller-runtime.js'
import { TransferControllerStepper } from './transfer-controller-stepper.js'
import {
  TRANSFER_SIMULATION_DEFAULTS,
  clampSeriesIndex,
  createTransferRng,
  createSeriesCollection,
  createFrameAndSizeGenerator,
  appendTransferStep,
} from './transfer-fake-series.js'

class TransferController {
  constructor(config) {
    this.merged = Object.assign({}, TRANSFER_SIMULATION_DEFAULTS, config || {})
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

export {
  TransferController,
  createTransferController,
}
