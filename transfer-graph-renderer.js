import { renderTransferGraphFrame } from './transfer-simulation.js'

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
    this.buildGraphOptions = typeof opts.buildGraphOptions === 'function' ? opts.buildGraphOptions : null
    this.buildRenderOptions = typeof opts.buildRenderOptions === 'function' ? opts.buildRenderOptions : null
  }

  render(model, seriesConfig) {
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
      backgroundValue: model.finished ? model.totalSize : undefined,
      colorBackground: model.isPauseVisualActive() ? this.pausedColors.background : undefined,
      colorBackgroundStroke: model.isPauseVisualActive() ? this.pausedColors.backgroundStroke : undefined,
      colorOverlay: model.isPauseVisualActive() ? this.pausedColors.overlay : undefined,
    }

    if (this.buildGraphOptions) {
      graphOptions = Object.assign(graphOptions, this.buildGraphOptions(model.getState()) || {})
    }
    if (this.buildRenderOptions) {
      renderOptions = Object.assign(renderOptions, this.buildRenderOptions(model.getState()) || {})
    }

    return renderTransferGraphFrame({
      seriesConfig,
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
