import { TransferGraphModel } from './transfer-graph-model.js'
import { TransferGraphRenderer } from './transfer-graph-renderer.js'

class TransferGraphController {
  constructor(options) {
    this.model = new TransferGraphModel
    this.renderer = new TransferGraphRenderer

    this.setRendererOptions(options)
  }

  setModelOptions(options) {
    this.model.setOptions(options)
  }

  setRendererOptions(options) {
    this.renderer.setOptions(options)
  }

  onFrame() {}
  setOnFrame(onFrame) {
    this.onFrame = typeof onFrame === 'function' ? onFrame : this.onFrame
  }

  onControls() {}
  setOnControls(onControls) {
    this.onControls = typeof onControls === 'function' ? onControls : this.onControls
    this.notifyControls()
  }

  notifyControls() {
    this.onControls(this.model.getControlsView())
  }

  onStateChange() {}
  setOnStateChange(onStateChange) {
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : this.onStateChange
    this.notifyState()
  }

  notifyState() {
    this.onStateChange(this.model.getState())
  }

  renderFrame() {
    const frameResult = this.renderer.render(this.model)
    this.model.runningMaxSpeed = frameResult.runningMaxSpeed
    const view = this.model.buildViewModel(frameResult)
    this.onFrame(view)
    return view
  }

  startTransfer(config) {
    const cfg = config || {}
    if (!Number.isFinite(cfg.totalSize) || cfg.totalSize <= 0) {
      throw new Error('TransferGraphController.startTransfer requires a positive numeric totalSize')
    }
    this.model.startTransfer(cfg)
    this.notifyState()
    this.renderFrame()
  }

  reset() {
    this.model.reset()
    this.notifyState()
    this.renderFrame()
  }

  pushProgress(update) {
    this.model.pushProgress(update)
    this.notifyState()
    this.renderFrame()
  }

  replaceRenderedSeries(update) {
    this.model.replaceRenderedSeries(update)
    this.notifyState()
    this.renderFrame()
  }

  finishTransfer(update) {
    this.model.finishTransfer(update)
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
