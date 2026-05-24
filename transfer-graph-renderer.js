import { bytesSize } from './lib.js'
import { renderTransferGraphFrame } from './transfer-graph-frame.js'

function clampPixelAverageWindow(pixelAverageWindow, canvasWidth) {
  const maxAllowed = Math.max(1, Math.floor(canvasWidth || 1))
  const nextWindow = Math.floor(pixelAverageWindow)
  if (!Number.isFinite(nextWindow)) return 1
  return Math.min(Math.max(1, nextWindow), maxAllowed)
}

class TransferGraphRenderer {
  canvasCtx = undefined
  canvasWidth = 416
  canvasHeight = 72
  formatSpeed = (speedBps) => bytesSize(speedBps).join(' ') + '/s'
  pausedRenderOptions = {
    colorBackground: '#f4e499',
    colorBackgroundStroke: '#d1c06a',
    colorOverlay: '#b19704',
  }
  cancelledRenderOptions = {
    colorBackground: '#d6d6d6',
    colorBackgroundStroke: '#b8b8b8',
    colorOverlay: '#8a8a8a',
  }
  buildGraphOptions = () => {}
  buildRenderOptions = () => {}

  constructor(options) {
    this.setOptions(options)
  }

  setOptions(options) {
    const opts = options || {}
    this.canvasCtx = opts.canvasCtx ?? this.canvasCtx
    this.canvasWidth = Number.isFinite(opts.canvasWidth) ? Math.floor(opts.canvasWidth) : this.canvasWidth
    this.canvasHeight = Number.isFinite(opts.canvasHeight) ? Math.floor(opts.canvasHeight) : this.canvasHeight
    this.formatSpeed = opts.formatSpeed instanceof Function ? opts.formatSpeed : this.formatSpeed
    this.pausedRenderOptions = Object.assign({}, this.pausedRenderOptions, opts.pausedRenderOptions || {})
    this.cancelledRenderOptions = Object.assign({}, this.cancelledRenderOptions, opts.cancelledRenderOptions || {})
    this.buildGraphOptions = opts.buildGraphOptions instanceof Function ? opts.buildGraphOptions : this.buildGraphOptions
    this.buildRenderOptions = opts.buildRenderOptions instanceof Function ? opts.buildRenderOptions : this.buildRenderOptions
  }

  render(model) {
    const isCancelled = model.cancelled === true
    const isPaused = !isCancelled && model.isPauseVisualActive()

    let graphOptions = {
      pixelAverageWindow: model.pixelAverageWindow,
      maxSpeedDecay: model.maxSpeedDecay,
      maxSpeedHeadroom: model.maxSpeedHeadroom,
      ignoreTrailingSpeedSample: model.ignoreTrailingSpeedSample,
    }

    let renderOptions = {
      ...(isCancelled ? this.cancelledRenderOptions : undefined),
      ...(isPaused ? this.pausedRenderOptions : undefined),
      speedLabelFormatter: (speed) => this.formatSpeed(speed * 1000),
      pixelAverageWindow: model.pixelAverageWindow,
      ignoreTrailingSpeedSample: model.ignoreTrailingSpeedSample,
      // Keep canceled transfers frozen at current progress instead of forcing full completion fill.
      backgroundValue: model.finished && !isCancelled ? model.totalSize : undefined,
    }

    graphOptions = Object.assign(graphOptions, this.buildGraphOptions(model.getState()))
    renderOptions = Object.assign(renderOptions, this.buildRenderOptions(model.getState()))

    const boundedPixelAverageWindow = clampPixelAverageWindow(
      renderOptions.pixelAverageWindow ?? graphOptions.pixelAverageWindow,
      this.canvasWidth
    )
    graphOptions.pixelAverageWindow = boundedPixelAverageWindow
    renderOptions.pixelAverageWindow = boundedPixelAverageWindow

    return renderTransferGraphFrame({
      maxValue: model.totalSize,
      series: model.series,
      canvasCtx: this.canvasCtx,
      size: { w: this.canvasWidth, h: this.canvasHeight },
      runningMaxSpeed: model.runningMaxSpeed,
      recalculateMaxFromZero: true,
      graphOptions,
      renderOptions,
    })
  }
}

export {
  TransferGraphRenderer,
}
