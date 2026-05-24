import { renderTransferGraphFrame } from './transfer-graph-frame.js'

class TransferGraphRenderer {
  constructor(options) {
    const opts = options || {}
    this.canvasCtx = opts.canvasCtx
    this.canvasWidth = Number.isFinite(opts.canvasWidth) ? Math.floor(opts.canvasWidth) : 416
    this.canvasHeight = Number.isFinite(opts.canvasHeight) ? Math.floor(opts.canvasHeight) : 72
    this.formatSpeed = typeof opts.formatSpeed === 'function' ? opts.formatSpeed : function (speedBps) {
      return String(speedBps)
    }
    this.pausedRenderOptions = Object.assign({
      colorBackground: '#f4e499',
      colorBackgroundStroke: '#d1c06a',
      colorOverlay: '#b19704',
    }, opts.pausedRenderOptions || {})
    this.cancelledRenderOptions = Object.assign({
      colorBackground: '#d6d6d6',
      colorBackgroundStroke: '#b8b8b8',
      colorOverlay: '#8a8a8a',
    }, opts.cancelledRenderOptions || {})
    this.buildGraphOptions = typeof opts.buildGraphOptions === 'function' ? opts.buildGraphOptions : null
    this.buildRenderOptions = typeof opts.buildRenderOptions === 'function' ? opts.buildRenderOptions : null
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

    if (this.buildGraphOptions) {
      graphOptions = Object.assign(graphOptions, this.buildGraphOptions(model.getState()) || {})
    }
    if (this.buildRenderOptions) {
      renderOptions = Object.assign(renderOptions, this.buildRenderOptions(model.getState()) || {})
    }

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
