import { renderTransferGraphFrame } from './transfer-graph-frame.js'

class TransferGraphRenderer {
  constructor(options) {
    const opts = options || {}
    this.ctx = opts.ctx
    this.canvasWidth = Number.isFinite(opts.canvasWidth) ? Math.floor(opts.canvasWidth) : 416
    this.canvasHeight = Number.isFinite(opts.canvasHeight) ? Math.floor(opts.canvasHeight) : 72
    this.formatSpeed = typeof opts.formatSpeed === 'function' ? opts.formatSpeed : function (speedBps) {
      return String(speedBps)
    }
    this.pausedColors = Object.assign({
      background: '#f4e499',
      backgroundStroke: '#d1c06a',
      overlay: '#b19704',
    }, opts.pausedColors || {})
    this.cancelledColors = Object.assign({
      background: '#d6d6d6',
      backgroundStroke: '#b8b8b8',
      overlay: '#8a8a8a',
    }, opts.cancelledColors || {})
    this.buildGraphOptions = typeof opts.buildGraphOptions === 'function' ? opts.buildGraphOptions : null
    this.buildRenderOptions = typeof opts.buildRenderOptions === 'function' ? opts.buildRenderOptions : null
  }

  render(model) {
    const isCancelled = model.cancelled === true
    const usePausedPalette = !isCancelled && model.isPauseVisualActive()

    let graphOptions = {
      pixelAverageWindow: model.pixelAverageWindow,
      maxSpeedDecay: model.maxSpeedDecay,
      maxSpeedHeadroom: model.maxSpeedHeadroom,
      ignoreTrailingSpeedSample: model.ignoreTrailingSpeedSample,
    }

    let renderOptions = {
      speedLabelFormatter: (speed) => this.formatSpeed(speed * 1000),
      pixelAverageWindow: model.pixelAverageWindow,
      ignoreTrailingSpeedSample: model.ignoreTrailingSpeedSample,
      // Keep canceled transfers frozen at current progress instead of forcing full completion fill.
      backgroundValue: model.finished && !isCancelled ? model.totalSize : undefined,
      colorBackground: isCancelled
        ? this.cancelledColors.background
        : usePausedPalette
        ? this.pausedColors.background
        : undefined,
      colorBackgroundStroke: isCancelled
        ? this.cancelledColors.backgroundStroke
        : usePausedPalette
        ? this.pausedColors.backgroundStroke
        : undefined,
      colorOverlay: isCancelled
        ? this.cancelledColors.overlay
        : usePausedPalette
        ? this.pausedColors.overlay
        : undefined,
    }

    if (this.buildGraphOptions) {
      graphOptions = Object.assign(graphOptions, this.buildGraphOptions(model.getState()) || {})
    }
    if (this.buildRenderOptions) {
      renderOptions = Object.assign(renderOptions, this.buildRenderOptions(model.getState()) || {})
    }

    return renderTransferGraphFrame({
      maxValue: model.totalSize,
      series: model.series,
      ctx: this.ctx,
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
