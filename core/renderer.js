import { bytesSize } from './lib.js'
import { renderTransferGraphFrame } from './frame.js'

function clampPixelAverageWindow(pixelAverageWindow, canvasWidth) {
  const maxAllowed = Math.max(1, Math.floor(canvasWidth || 1))
  const nextWindow = Math.floor(pixelAverageWindow)
  if (!Number.isFinite(nextWindow)) return 1
  return Math.min(Math.max(1, nextWindow), maxAllowed)
}

function isDomCanvas(canvas) {
  return typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement
}

function hasIdentityTransform(canvasCtx) {
  if (typeof canvasCtx.getTransform !== 'function') return true
  const t = canvasCtx.getTransform()
  return !t || (t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0)
}

class TransferGraphRenderer {
  canvasCtx = undefined
  // undefined: automatic (devicePixelRatio for DOM canvases, untouched otherwise);
  // number > 0: always applied; false: never touch canvas size or transform.
  pixelRatio = undefined
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
  drawProgressBar = undefined
  drawGrid = undefined
  drawSpeedOverlay = undefined
  drawSpeedLineLabel = undefined
  drawBorder = undefined
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
    if (opts.pixelRatio !== undefined) {
      const ratio = opts.pixelRatio
      if (ratio === null || ratio === 'auto') this.pixelRatio = undefined
      else if (ratio === false || ratio === 0) this.pixelRatio = false
      else if (Number.isFinite(ratio) && ratio > 0) this.pixelRatio = ratio
    }
    this.formatSpeed = opts.formatSpeed instanceof Function ? opts.formatSpeed : this.formatSpeed
    this.pausedRenderOptions = Object.assign({}, this.pausedRenderOptions, opts.pausedRenderOptions || {})
    this.cancelledRenderOptions = Object.assign({}, this.cancelledRenderOptions, opts.cancelledRenderOptions || {})
    this.drawProgressBar = opts.drawProgressBar instanceof Function ? opts.drawProgressBar : this.drawProgressBar
    this.drawGrid = opts.drawGrid instanceof Function ? opts.drawGrid : this.drawGrid
    this.drawSpeedOverlay = opts.drawSpeedOverlay instanceof Function ? opts.drawSpeedOverlay : this.drawSpeedOverlay
    this.drawSpeedLineLabel = opts.drawSpeedLineLabel instanceof Function ? opts.drawSpeedLineLabel : this.drawSpeedLineLabel
    this.drawBorder = opts.drawBorder instanceof Function ? opts.drawBorder : this.drawBorder
    this.buildGraphOptions = opts.buildGraphOptions instanceof Function ? opts.buildGraphOptions : this.buildGraphOptions
    this.buildRenderOptions = opts.buildRenderOptions instanceof Function ? opts.buildRenderOptions : this.buildRenderOptions
  }

  // Pixel ratio to apply on the next frame, or 0 when the canvas must be left as is.
  resolvePixelRatio() {
    const canvasCtx = this.canvasCtx
    if (!canvasCtx || this.pixelRatio === false) return 0
    if (typeof this.pixelRatio === 'number') return this.pixelRatio
    // Automatic mode only manages DOM canvases, and backs off when the context
    // already has a transform (the caller is scaling it on their own).
    if (!isDomCanvas(canvasCtx.canvas) || !hasIdentityTransform(canvasCtx)) return 0
    const deviceRatio = Number(globalThis.devicePixelRatio)
    return Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1
  }

  applyCanvasSize(pixelRatio) {
    const canvas = this.canvasCtx.canvas
    if (!canvas) return
    const width = Math.max(1, Math.round(this.canvasWidth * pixelRatio))
    const height = Math.max(1, Math.round(this.canvasHeight * pixelRatio))
    // Only assign on change: setting width/height clears the canvas and its state.
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const style = canvas.style
    if (style) {
      const cssWidth = this.canvasWidth + 'px'
      const cssHeight = this.canvasHeight + 'px'
      if (style.width !== cssWidth) style.width = cssWidth
      if (style.height !== cssHeight) style.height = cssHeight
    }
  }

  render(model) {
    const pixelRatio = this.resolvePixelRatio()
    if (!pixelRatio) return this.drawFrame(model)
    this.applyCanvasSize(pixelRatio)
    const canvasCtx = this.canvasCtx
    canvasCtx.save()
    try {
      canvasCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      return this.drawFrame(model)
    } finally {
      canvasCtx.restore()
    }
  }

  drawFrame(model) {
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
      drawProgressBar: this.drawProgressBar,
      drawGrid: this.drawGrid,
      drawSpeedOverlay: this.drawSpeedOverlay,
      drawSpeedLineLabel: this.drawSpeedLineLabel,
      drawBorder: this.drawBorder,
      // Keep canceled transfers frozen at current progress instead of forcing full completion fill.
      // Otherwise follow the displayed progress (it may include a sample not yet in the series).
      backgroundValue: model.finished && !isCancelled
        ? model.totalSize
        : (typeof model.getTransferredBytes === 'function' ? model.getTransferredBytes() : undefined),
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
