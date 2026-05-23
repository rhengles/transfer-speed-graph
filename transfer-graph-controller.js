(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./transfer-simulation.js'), require('./lib.js'))
  } else {
    root.transferGraphControllerApi = factory(root, root)
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (simulationDeps, formatDeps) {
  var renderTransferGraphFrame = simulationDeps.renderTransferGraphFrame
  var TRANSFER_UI_DEFAULTS = simulationDeps.TRANSFER_UI_DEFAULTS || { totalSize: 256 * 1024 * 1024, seriesCount: 16 }

  var bytesSize = formatDeps.bytesSize

  function asLabel(formatResult) {
    if (Array.isArray(formatResult)) return formatResult.join(' ')
    return String(formatResult)
  }

  function createTransferGraphController(options) {
    var opts = options || {}
    var initialTotalSize = Number.isFinite(opts.totalSize) && opts.totalSize > 0
      ? opts.totalSize
      : TRANSFER_UI_DEFAULTS.totalSize
    var totalSize = initialTotalSize
    var canvasWidth = Number.isFinite(opts.canvasWidth) ? Math.floor(opts.canvasWidth) : 416
    var canvasHeight = Number.isFinite(opts.canvasHeight) ? Math.floor(opts.canvasHeight) : 72
    var now = typeof opts.now === 'function' ? opts.now : Date.now
    var formatSpeed = typeof opts.formatSpeed === 'function'
      ? opts.formatSpeed
      : function (speedBps) { return asLabel(bytesSize(speedBps)) + '/s' }

    var onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : function () {}
    var onControls = typeof opts.onControls === 'function' ? opts.onControls : function () {}
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function () {}

    var pausedColors = Object.assign({
      background: '#f4e499',
      backgroundStroke: '#d1c06a',
      overlay: '#b19704',
    }, opts.pausedColors || {})

    var seriesConfig = { maxValue: totalSize }
    var series = [[0, 0]]
    var runningMaxSpeed = 0
    var pixelAverageWindow = Math.max(1, Math.min(canvasWidth, Math.round(opts.pixelAverageWindow || 1)))
    var maxSpeedDecay = Number.isFinite(opts.maxSpeedDecay) ? opts.maxSpeedDecay : 0.5
    var maxSpeedHeadroom = Number.isFinite(opts.maxSpeedHeadroom) ? opts.maxSpeedHeadroom : 1.06
    var ignoreTrailingSpeedSample = opts.ignoreTrailingSpeedSample !== false
    var started = false
    var paused = false
    var finished = false
    var cancelled = false
    var finishedPauseVisual = false
    var startedAt = 0
    var pausedAt = 0
    var pausedDuration = 0

    function isPauseVisualActive() {
      return paused || (finished && finishedPauseVisual)
    }

    function getElapsed(nowMs) {
      if (!started) return 0
      var currentNow = Number.isFinite(nowMs) ? nowMs : now()
      if (paused) currentNow = pausedAt
      return Math.max(0, currentNow - startedAt - pausedDuration)
    }

    function getState() {
      return {
        started: started,
        paused: paused,
        finished: finished,
        cancelled: cancelled,
        pauseVisualActive: isPauseVisualActive(),
        pauseButtonLabel: isPauseVisualActive() ? '▶' : '⏸',
        pauseButtonEnabled: started && !cancelled,
        runningMaxSpeed: runningMaxSpeed,
        pixelAverageWindow: pixelAverageWindow,
        maxSpeedDecay: maxSpeedDecay,
        maxSpeedHeadroom: maxSpeedHeadroom,
        ignoreTrailingSpeedSample: ignoreTrailingSpeedSample,
      }
    }

    function getControlsView() {
      return {
        pixelAverageWindow: pixelAverageWindow,
        canvasWidth: canvasWidth,
        maxSpeedDecay: maxSpeedDecay,
        maxSpeedHeadroom: maxSpeedHeadroom,
      }
    }

    function notifyState() {
      onStateChange(getState())
    }

    function notifyControls() {
      onControls(getControlsView())
    }

    function resetSeries() {
      series = [[0, 0]]
      runningMaxSpeed = 0
    }

    function appendSeriesPoint(elapsedMs, transferredBytes) {
      var nextElapsed = Math.max(0, Math.round(elapsedMs || 0))
      var nextTransferred = Math.max(0, Math.min(totalSize, transferredBytes || 0))
      var prev = series[series.length - 1]
      if (prev && prev[0] === nextElapsed && prev[1] === nextTransferred) return
      if (prev && nextElapsed < prev[0]) {
        nextElapsed = prev[0]
      }
      if (prev && nextTransferred < prev[1]) {
        nextTransferred = prev[1]
      }
      series.push([nextElapsed, nextTransferred])
    }

    function normalizeSeriesPoints(inputSeries) {
      if (!Array.isArray(inputSeries) || !inputSeries.length) {
        return [[0, 0]]
      }

      var normalized = []
      for (var i = 0; i < inputSeries.length; i += 1) {
        var point = inputSeries[i]
        if (!Array.isArray(point) || point.length < 2) continue

        var rawElapsed = Number(point[0])
        var rawTransferred = Number(point[1])
        if (!Number.isFinite(rawElapsed) || !Number.isFinite(rawTransferred)) continue

        var elapsed = Math.max(0, Math.round(rawElapsed))
        var transferred = Math.max(0, Math.min(totalSize, rawTransferred))

        var prev = normalized.length ? normalized[normalized.length - 1] : null
        if (prev) {
          if (elapsed < prev[0]) elapsed = prev[0]
          if (transferred < prev[1]) transferred = prev[1]
          if (elapsed === prev[0] && transferred === prev[1]) continue
        }

        normalized.push([elapsed, transferred])
      }

      if (!normalized.length) return [[0, 0]]
      if (normalized[0][0] > 0 || normalized[0][1] > 0) {
        normalized.unshift([0, 0])
      }
      return normalized
    }

    function buildViewModel(frameResult) {
      var transferredBytes = series[series.length - 1][1]
      var pct = totalSize > 0 ? transferredBytes / totalSize : 0
      var pctInt = Math.round(pct * 100)
      var elapsedMs = getElapsed(now())
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
        finished: finished,
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
        backgroundValue: finished ? totalSize : undefined,
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
        series: series,
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

    function startTransfer(config) {
      var cfg = config || {}
      if (Number.isFinite(cfg.totalSize) && cfg.totalSize > 0) {
        totalSize = cfg.totalSize
        seriesConfig.maxValue = totalSize
      }

      started = true
      paused = false
      finished = false
      cancelled = false
      finishedPauseVisual = false
      startedAt = Number.isFinite(cfg.nowMs) ? cfg.nowMs : now()
      pausedAt = 0
      pausedDuration = 0
      resetSeries()
      notifyState()
      renderFrame()
    }

    function reset() {
      totalSize = initialTotalSize
      seriesConfig.maxValue = totalSize
      started = false
      paused = false
      finished = false
      cancelled = false
      finishedPauseVisual = false
      startedAt = 0
      pausedAt = 0
      pausedDuration = 0
      resetSeries()
      notifyState()
      renderFrame()
    }

    function pushProgress(update) {
      var payload = update || {}
      var nextNow = Number.isFinite(payload.nowMs) ? payload.nowMs : now()
      if (!started) {
        startTransfer({ totalSize: payload.totalSize, nowMs: nextNow })
      }

      if (Number.isFinite(payload.totalSize) && payload.totalSize > 0 && payload.totalSize !== totalSize) {
        totalSize = payload.totalSize
        seriesConfig.maxValue = totalSize
      }

      var elapsedMs = Number.isFinite(payload.elapsedMs)
        ? payload.elapsedMs
        : getElapsed(nextNow)
      appendSeriesPoint(elapsedMs, payload.transferredBytes)

      if (series[series.length - 1][1] >= totalSize) {
        finished = true
        paused = false
      }

      notifyState()
      renderFrame()
    }

    function replaceRenderedSeries(update) {
      var payload = update || {}
      var nextNow = Number.isFinite(payload.nowMs) ? payload.nowMs : now()

      if (!started) {
        startTransfer({ totalSize: payload.totalSize, nowMs: nextNow })
      }

      if (Number.isFinite(payload.totalSize) && payload.totalSize > 0 && payload.totalSize !== totalSize) {
        totalSize = payload.totalSize
        seriesConfig.maxValue = totalSize
      }

      if (Number.isFinite(payload.elapsedMs)) {
        startedAt = nextNow - Math.max(0, Math.round(payload.elapsedMs)) - pausedDuration
        if (paused) pausedAt = nextNow
      }

      series = normalizeSeriesPoints(payload.series)

      if (typeof payload.finished === 'boolean') {
        finished = payload.finished
      } else {
        finished = series[series.length - 1][1] >= totalSize
      }

      if (finished) paused = false
      cancelled = false

      notifyState()
      renderFrame()
    }

    function finishTransfer(update) {
      var payload = update || {}
      if (Number.isFinite(payload.totalSize) && payload.totalSize > 0) {
        totalSize = payload.totalSize
        seriesConfig.maxValue = totalSize
      }
      if (!started) {
        startTransfer({ totalSize: totalSize, nowMs: payload.nowMs })
      }
      appendSeriesPoint(
        Number.isFinite(payload.elapsedMs) ? payload.elapsedMs : getElapsed(payload.nowMs),
        Number.isFinite(payload.transferredBytes) ? payload.transferredBytes : totalSize
      )
      finished = true
      paused = false
      notifyState()
      renderFrame()
    }

    function cancel() {
      cancelled = true
      finished = true
      paused = false
      notifyState()
      renderFrame()
    }

    function pause(nowMs) {
      if (!started || finished || paused) return
      paused = true
      pausedAt = Number.isFinite(nowMs) ? nowMs : now()
      notifyState()
      renderFrame()
    }

    function resume(nowMs) {
      if (!started || finished || !paused) return
      var resumeAt = Number.isFinite(nowMs) ? nowMs : now()
      pausedDuration += Math.max(0, resumeAt - pausedAt)
      paused = false
      pausedAt = 0
      notifyState()
      renderFrame()
    }

    function toggleFinishedPauseVisual() {
      if (!finished) return
      finishedPauseVisual = !finishedPauseVisual
      notifyState()
      renderFrame()
    }

    function refreshGraphScale() {
      if (series.length > 1) {
        runningMaxSpeed = 0
        renderFrame()
      }
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

    function getSeries() {
      return series.slice()
    }

    notifyControls()
    notifyState()

    return {
      renderFrame: renderFrame,
      reset: reset,
      startTransfer: startTransfer,
      pushProgress: pushProgress,
      replaceRenderedSeries: replaceRenderedSeries,
      finishTransfer: finishTransfer,
      cancel: cancel,
      pause: pause,
      resume: resume,
      toggleFinishedPauseVisual: toggleFinishedPauseVisual,
      refreshGraphScale: refreshGraphScale,
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
