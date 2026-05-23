(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./transfer-simulation.js'), require('./lib.js'))
  } else {
    root.transferGraphControllerApi = factory(root, root)
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (simulationDeps, formatDeps) {
  var createTransferController = simulationDeps.createTransferController
  var renderTransferGraphFrame = simulationDeps.renderTransferGraphFrame
  var clampSeriesIndex = simulationDeps.clampSeriesIndex
  var TRANSFER_UI_DEFAULTS = simulationDeps.TRANSFER_UI_DEFAULTS || { totalSize: 256 * 1024 * 1024, seriesCount: 16 }

  var bytesSize = formatDeps.bytesSize

  function asLabel(formatResult) {
    if (Array.isArray(formatResult)) return formatResult.join(' ')
    return String(formatResult)
  }

  function createTransferGraphController(options) {
    var opts = options || {}
    var totalSize = Number.isFinite(opts.totalSize) && opts.totalSize > 0
      ? opts.totalSize
      : TRANSFER_UI_DEFAULTS.totalSize
    var seriesCount = Math.max(1, Math.floor(opts.seriesCount || TRANSFER_UI_DEFAULTS.seriesCount || 1))
    var canvasWidth = Number.isFinite(opts.canvasWidth) ? Math.floor(opts.canvasWidth) : 416
    var canvasHeight = Number.isFinite(opts.canvasHeight) ? Math.floor(opts.canvasHeight) : 72
    var now = typeof opts.now === 'function' ? opts.now : Date.now
    var schedule = typeof opts.schedule === 'function' ? opts.schedule : setTimeout
    var unschedule = typeof opts.unschedule === 'function' ? opts.unschedule : clearTimeout

    var formatSpeed = typeof opts.formatSpeed === 'function'
      ? opts.formatSpeed
      : function (speedBps) { return asLabel(bytesSize(speedBps)) + '/s' }

    var onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : function () {}
    var onControls = typeof opts.onControls === 'function' ? opts.onControls : function () {}
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function () {}
    var onOutOfBounds = typeof opts.onOutOfBounds === 'function' ? opts.onOutOfBounds : function (seriesIndex) {
      console.warn('Generated size out of bounds at index ' + seriesIndex)
    }

    var pausedColors = Object.assign({
      background: '#f4e499',
      backgroundStroke: '#d1c06a',
      overlay: '#b19704',
    }, opts.pausedColors || {})

    var controller = createTransferController({
      totalSize: totalSize,
      seriesCount: seriesCount,
      mode: opts.mode || 'random',
    })

    var seriesConfig = { maxValue: totalSize }
    var seriesActiveIndex = clampSeriesIndex(opts.seriesActiveIndex || 1, seriesCount, true)
    var pixelAverageWindow = Math.max(1, Math.min(canvasWidth, Math.round(opts.pixelAverageWindow || 1)))
    var maxSpeedDecay = Number.isFinite(opts.maxSpeedDecay) ? opts.maxSpeedDecay : 0.5
    var maxSpeedHeadroom = Number.isFinite(opts.maxSpeedHeadroom) ? opts.maxSpeedHeadroom : 1.06
    var ignoreTrailingSpeedSample = opts.ignoreTrailingSpeedSample !== false
    var runningMaxSpeed = 0
    var finishedPauseVisual = false
    var cancelled = false
    var tickTimer = null

    function getSeries() {
      return controller.getSeries(seriesActiveIndex, true)
    }

    function isPauseVisualActive() {
      return controller.isPaused() || (controller.isFinished() && finishedPauseVisual)
    }

    function getState() {
      return {
        started: controller.isStarted(),
        paused: controller.isPaused(),
        finished: controller.isFinished(),
        cancelled: cancelled,
        mode: controller.getMode(),
        pauseVisualActive: isPauseVisualActive(),
        pauseButtonLabel: isPauseVisualActive() ? '▶' : '⏸',
        pauseButtonEnabled: controller.isStarted() && !cancelled,
        runningMaxSpeed: runningMaxSpeed,
        seriesActiveIndex: seriesActiveIndex,
        pixelAverageWindow: pixelAverageWindow,
        maxSpeedDecay: maxSpeedDecay,
        maxSpeedHeadroom: maxSpeedHeadroom,
        ignoreTrailingSpeedSample: ignoreTrailingSpeedSample,
      }
    }

    function getControlsView() {
      return {
        seriesActiveIndex: seriesActiveIndex,
        seriesCount: seriesCount,
        pixelAverageWindow: pixelAverageWindow,
        canvasWidth: canvasWidth,
        maxSpeedDecay: maxSpeedDecay,
        maxSpeedHeadroom: maxSpeedHeadroom,
      }
    }

    function notifyControls() {
      onControls(getControlsView())
    }

    function notifyState() {
      onStateChange(getState())
    }

    function scheduleTick() {
      var nextFrame = controller.nextFrameMs()
      tickTimer = schedule(function () {
        tick(nextFrame)
      }, nextFrame)
    }

    function buildViewModel(frameResult) {
      var transferredBytes = controller.getTransferredBytes()
      var pct = totalSize > 0 ? transferredBytes / totalSize : 0
      var pctInt = Math.round(pct * 100)
      var elapsedMs = controller.getElapsed(now())
      var remainingMs = pct > 0 ? elapsedMs / pct * (1 - pct) : 0
      var remBytes = Math.max(0, totalSize - transferredBytes)
      var speedBps = (typeof frameResult.lastRenderedSpeed === 'number' && Number.isFinite(frameResult.lastRenderedSpeed))
        ? frameResult.lastRenderedSpeed * 1000
        : undefined

      return {
        progress: pct,
        progressInt: pctInt,
        transferredBytes: transferredBytes,
        totalSize: totalSize,
        remainingBytes: remBytes,
        elapsedMs: elapsedMs,
        remainingMs: remainingMs,
        speedBps: speedBps,
        cancelled: cancelled,
        finished: controller.isFinished(),
        state: getState(),
      }
    }

    function renderFrame() {
      var graphOptions = {
        pixelAverageWindow: pixelAverageWindow,
        maxSpeedDecay: maxSpeedDecay,
        maxSpeedHeadroom: maxSpeedHeadroom,
        ignoreTrailingSpeedSample: ignoreTrailingSpeedSample,
      }

      var renderOptions = {
        speedLabelFormatter: function (speed) { return formatSpeed(speed * 1000) },
        pixelAverageWindow: pixelAverageWindow,
        ignoreTrailingSpeedSample: ignoreTrailingSpeedSample,
        backgroundValue: controller.isFinished() ? totalSize : undefined,
        colorBackground: isPauseVisualActive() ? pausedColors.background : undefined,
        colorBackgroundStroke: isPauseVisualActive() ? pausedColors.backgroundStroke : undefined,
        colorOverlay: isPauseVisualActive() ? pausedColors.overlay : undefined,
      }

      if (typeof opts.buildGraphOptions === 'function') {
        graphOptions = Object.assign(graphOptions, opts.buildGraphOptions(getState()) || {})
      }
      if (typeof opts.buildRenderOptions === 'function') {
        renderOptions = Object.assign(renderOptions, opts.buildRenderOptions(getState()) || {})
      }

      var frameResult = renderTransferGraphFrame({
        seriesConfig: seriesConfig,
        series: getSeries(),
        ctx: opts.ctx,
        size: { w: canvasWidth, h: canvasHeight },
        runningMaxSpeed: runningMaxSpeed,
        recalculateMaxFromZero: true,
        graphOptions: graphOptions,
        renderOptions: renderOptions,
      })

      runningMaxSpeed = frameResult.runningMaxSpeed
      var view = buildViewModel(frameResult)
      onFrame(view)
      return view
    }

    function tick(frameMs) {
      var stepResult = controller.runStep({
        frameMs: frameMs,
        nowMs: now(),
      })
      if (!stepResult.advanced) return

      if (stepResult.outOfBoundsIndex) {
        onOutOfBounds(stepResult.outOfBoundsIndex - 1)
      }

      renderFrame()

      if (stepResult.finished) {
        notifyState()
        return
      }

      scheduleTick()
    }

    function setSimulationMode(mode) {
      controller.setMode(mode)
      notifyState()
    }

    function refreshGraphScale() {
      if (getSeries().length > 1) {
        runningMaxSpeed = 0
        renderFrame()
      }
    }

    function setSeriesAverageActiveIndex(nextWindow) {
      var bounded = clampSeriesIndex(nextWindow, seriesCount, true)
      if (bounded === seriesActiveIndex) return
      seriesActiveIndex = bounded
      notifyControls()
      refreshGraphScale()
    }

    function setPixelAverageWindow(nextWindow) {
      var bounded = Math.max(1, Math.min(canvasWidth, Math.round(nextWindow)))
      if (bounded === pixelAverageWindow) return
      pixelAverageWindow = bounded
      notifyControls()
      refreshGraphScale()
    }

    function setMaxSpeedDecay(nextValue) {
      var bounded = Math.max(0.5, Math.min(0.999, Math.round(nextValue * 1000) / 1000))
      if (bounded === maxSpeedDecay) return
      maxSpeedDecay = bounded
      notifyControls()
      refreshGraphScale()
    }

    function setMaxSpeedHeadroom(nextValue) {
      var bounded = Math.max(1, Math.min(2, Math.round(nextValue * 100) / 100))
      if (bounded === maxSpeedHeadroom) return
      maxSpeedHeadroom = bounded
      notifyControls()
      refreshGraphScale()
    }

    function start(mode) {
      if (mode) {
        setSimulationMode(mode)
      }
      if (controller.isStarted() || controller.isFinished()) return false
      cancelled = false
      finishedPauseVisual = false
      controller.start(now())
      notifyState()
      scheduleTick()
      return true
    }

    function togglePause() {
      if (!controller.isStarted()) return
      if (controller.isFinished()) {
        finishedPauseVisual = !finishedPauseVisual
        notifyState()
        renderFrame()
        return
      }

      finishedPauseVisual = false
      if (controller.isPaused()) {
        controller.resume(now())
        notifyState()
        renderFrame()
        if (!controller.isFinished()) {
          scheduleTick()
        }
      } else {
        controller.pause(now())
        unschedule(tickTimer)
        notifyState()
        renderFrame()
      }
    }

    function cancel() {
      cancelled = true
      controller.cancel()
      unschedule(tickTimer)
      notifyState()
      renderFrame()
    }

    function destroy() {
      unschedule(tickTimer)
    }

    notifyControls()
    notifyState()

    return {
      renderFrame: renderFrame,
      start: start,
      togglePause: togglePause,
      cancel: cancel,
      destroy: destroy,
      setSimulationMode: setSimulationMode,
      refreshGraphScale: refreshGraphScale,
      setSeriesAverageActiveIndex: setSeriesAverageActiveIndex,
      setPixelAverageWindow: setPixelAverageWindow,
      setMaxSpeedDecay: setMaxSpeedDecay,
      setMaxSpeedHeadroom: setMaxSpeedHeadroom,
      getSeries: getSeries,
      getState: getState,
      getControlsView: getControlsView,
    }
  }

  return {
    createTransferGraphController: createTransferGraphController,
  }
})
