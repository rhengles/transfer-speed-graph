import { TRANSFER_UI_DEFAULTS } from './transfer-simulation.js'
import { bytesSize } from './lib.js'
import { TransferGraphModel } from './transfer-graph-model.js'
import { TransferGraphRenderer } from './transfer-graph-renderer.js'

function asLabel(formatResult) {
  if (Array.isArray(formatResult)) return formatResult.join(' ')
  return String(formatResult)
}

class TransferGraphController {
  constructor(options) {
    this.opts = options || {}
    this.initialTotalSize = Number.isFinite(this.opts.totalSize) && this.opts.totalSize > 0
      ? this.opts.totalSize
      : TRANSFER_UI_DEFAULTS.totalSize
    this.now = typeof this.opts.now === 'function' ? this.opts.now : Date.now
    this.formatSpeed = typeof this.opts.formatSpeed === 'function'
      ? this.opts.formatSpeed
      : function (speedBps) { return asLabel(bytesSize(speedBps)) + '/s' }

    this.onFrame = typeof this.opts.onFrame === 'function' ? this.opts.onFrame : function () {}
    this.onControls = typeof this.opts.onControls === 'function' ? this.opts.onControls : function () {}
    this.onStateChange = typeof this.opts.onStateChange === 'function' ? this.opts.onStateChange : function () {}

    this.model = new TransferGraphModel({
      totalSize: this.initialTotalSize,
      canvasWidth: this.opts.canvasWidth,
      now: this.now,
      pixelAverageWindow: this.opts.pixelAverageWindow,
      maxSpeedDecay: this.opts.maxSpeedDecay,
      maxSpeedHeadroom: this.opts.maxSpeedHeadroom,
      ignoreTrailingSpeedSample: this.opts.ignoreTrailingSpeedSample,
    })

    this.seriesConfig = { maxValue: this.model.totalSize }

    this.renderer = new TransferGraphRenderer({
      ctx: this.opts.ctx,
      canvasWidth: this.opts.canvasWidth,
      canvasHeight: this.opts.canvasHeight,
      formatSpeed: this.formatSpeed,
      pausedColors: this.opts.pausedColors,
      buildGraphOptions: this.opts.buildGraphOptions,
      buildRenderOptions: this.opts.buildRenderOptions,
    })

    this.notifyControls()
    this.notifyState()
  }

  syncSeriesConfig() {
    this.seriesConfig.maxValue = this.model.totalSize
  }

  notifyControls() {
    this.onControls(this.model.getControlsView())
  }

  notifyState() {
    this.onStateChange(this.model.getState())
  }

  renderFrame() {
    const frameResult = this.renderer.render(this.model, this.seriesConfig)
    this.model.runningMaxSpeed = frameResult.runningMaxSpeed
    const view = this.model.buildViewModel(frameResult)
    this.onFrame(view)
    return view
  }

  startTransfer(config) {
    this.model.startTransfer(config)
    this.syncSeriesConfig()
    this.notifyState()
    this.renderFrame()
  }

  reset() {
    this.model.reset()
    this.syncSeriesConfig()
    this.notifyState()
    this.renderFrame()
  }

  pushProgress(update) {
    this.model.pushProgress(update)
    this.syncSeriesConfig()
    this.notifyState()
    this.renderFrame()
  }

  replaceRenderedSeries(update) {
    this.model.replaceRenderedSeries(update)
    this.syncSeriesConfig()
    this.notifyState()
    this.renderFrame()
  }

  finishTransfer(update) {
    this.model.finishTransfer(update)
    this.syncSeriesConfig()
    this.notifyState()
    this.renderFrame()
  }

  cancel() {
    this.model.cancel()
    this.notifyState()
    this.renderFrame()
  }

  pause(nowMs) {
    if (!this.model.pause(nowMs)) return
    this.notifyState()
    this.renderFrame()
  }

  resume(nowMs) {
    if (!this.model.resume(nowMs)) return
    this.notifyState()
    this.renderFrame()
  }

  toggleFinishedPauseVisual() {
    if (!this.model.toggleFinishedPauseVisual()) return
    this.notifyState()
    this.renderFrame()
  }

  refreshGraphScale() {
    if (!this.model.refreshGraphScale()) return
    this.renderFrame()
  }

  setPixelAverageWindow(nextWindow) {
    if (!this.model.setPixelAverageWindow(nextWindow)) return
    this.notifyControls()
    this.refreshGraphScale()
  }

  setMaxSpeedDecay(nextValue) {
    if (!this.model.setMaxSpeedDecay(nextValue)) return
    this.notifyControls()
    this.refreshGraphScale()
  }

  setMaxSpeedHeadroom(nextValue) {
    if (!this.model.setMaxSpeedHeadroom(nextValue)) return
    this.notifyControls()
    this.refreshGraphScale()
  }

  getSeries() {
    return this.model.getSeries()
  }

  getState() {
    return this.model.getState()
  }

  getControlsView() {
    return this.model.getControlsView()
  }
}

function createTransferGraphController(options) {
  return new TransferGraphController(options)
}

export {
  TransferGraphController,
  createTransferGraphController,
}
