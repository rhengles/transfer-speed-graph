import { renderTransferGraphFrame, TRANSFER_UI_DEFAULTS } from './transfer-simulation.js'
import { bytesSize } from './lib.js'

function asLabel(formatResult) {
  if (Array.isArray(formatResult)) return formatResult.join(' ')
  return String(formatResult)
}

function createTransferGraphController(options) {
  const opts = options || {}
  const initialTotalSize = Number.isFinite(opts.totalSize) && opts.totalSize > 0
    ? opts.totalSize
    : TRANSFER_UI_DEFAULTS.totalSize
  let totalSize = initialTotalSize
  const canvasWidth = Number.isFinite(opts.canvasWidth) ? Math.floor(opts.canvasWidth) : 416
  const canvasHeight = Number.isFinite(opts.canvasHeight) ? Math.floor(opts.canvasHeight) : 72
  const now = typeof opts.now === 'function' ? opts.now : Date.now
  const formatSpeed = typeof opts.formatSpeed === 'function'
    ? opts.formatSpeed
    : function (speedBps) { return asLabel(bytesSize(speedBps)) + '/s' }

  const onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : function () {}
  const onControls = typeof opts.onControls === 'function' ? opts.onControls : function () {}
  const onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function () {}

  const pausedColors = Object.assign({
    background: '#f4e499',
    backgroundStroke: '#d1c06a',
    overlay: '#b19704',
  }, opts.pausedColors || {})

  const seriesConfig = { maxValue: totalSize }
  let series = [[0, 0]]
  let runningMaxSpeed = 0
  let pixelAverageWindow = Math.max(1, Math.min(canvasWidth, Math.round(opts.pixelAverageWindow || 1)))
  let maxSpeedDecay = Number.isFinite(opts.maxSpeedDecay) ? opts.maxSpeedDecay : 0.5
  let maxSpeedHeadroom = Number.isFinite(opts.maxSpeedHeadroom) ? opts.maxSpeedHeadroom : 1.06
  let ignoreTrailingSpeedSample = opts.ignoreTrailingSpeedSample !== false
  let started = false
  let paused = false
  let finished = false
  let cancelled = false
  let finishedPauseVisual = false
  let startedAt = 0
  let pausedAt = 0
  let pausedDuration = 0

  function isPauseVisualActive() {
    return paused || (finished && finishedPauseVisual)
  }

  function getElapsed(nowMs) {
    if (!started) return 0
    let currentNow = Number.isFinite(nowMs) ? nowMs : now()
    if (paused) currentNow = pausedAt
    return Math.max(0, currentNow - startedAt - pausedDuration)
  }

  function getState() {
    return {
      started,
      paused,
      finished,
      cancelled,
      pauseVisualActive: isPauseVisualActive(),
      pauseButtonLabel: isPauseVisualActive() ? '▶' : '⏸',
      pauseButtonEnabled: started && !cancelled,
      runningMaxSpeed,
      pixelAverageWindow,
      maxSpeedDecay,
      maxSpeedHeadroom,
      ignoreTrailingSpeedSample,
    }
  }

  function getControlsView() {
    return {
      pixelAverageWindow,
      canvasWidth,
      maxSpeedDecay,
      maxSpeedHeadroom,
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
    let nextElapsed = Math.max(0, Math.round(elapsedMs || 0))
    let nextTransferred = Math.max(0, Math.min(totalSize, transferredBytes || 0))
    const prev = series[series.length - 1]
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

    const normalized = []
    for (let i = 0; i < inputSeries.length; i += 1) {
      const point = inputSeries[i]
      if (!Array.isArray(point) || point.length < 2) continue

      const rawElapsed = Number(point[0])
      const rawTransferred = Number(point[1])
      if (!Number.isFinite(rawElapsed) || !Number.isFinite(rawTransferred)) continue

      let elapsed = Math.max(0, Math.round(rawElapsed))
      let transferred = Math.max(0, Math.min(totalSize, rawTransferred))

      const prev = normalized.length ? normalized[normalized.length - 1] : null
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
    const transferredBytes = series[series.length - 1][1]
    const pct = totalSize > 0 ? transferredBytes / totalSize : 0
    const pctInt = Math.round(pct * 100)
    const elapsedMs = getElapsed(now())
    const remainingMs = pct > 0 ? elapsedMs / pct * (1 - pct) : 0
    const remBytes = Math.max(0, totalSize - transferredBytes)
    const speedBps = (typeof frameResult.lastRenderedSpeed === 'number' && Number.isFinite(frameResult.lastRenderedSpeed))
      ? frameResult.lastRenderedSpeed * 1000
      : undefined

    return {
      progress: pct,
      progressInt: pctInt,
      transferredBytes,
      totalSize,
      remainingBytes: remBytes,
      elapsedMs,
      remainingMs,
      speedBps,
      cancelled,
      finished,
      state: getState(),
    }
  }

  function renderFrame() {
    let graphOptions = {
      pixelAverageWindow,
      maxSpeedDecay,
      maxSpeedHeadroom,
      ignoreTrailingSpeedSample,
    }

    let renderOptions = {
      speedLabelFormatter(speed) { return formatSpeed(speed * 1000) },
      pixelAverageWindow,
      ignoreTrailingSpeedSample,
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

    const frameResult = renderTransferGraphFrame({
      seriesConfig,
      series,
      ctx: opts.ctx,
      size: { w: canvasWidth, h: canvasHeight },
      runningMaxSpeed,
      recalculateMaxFromZero: true,
      graphOptions,
      renderOptions,
    })

    runningMaxSpeed = frameResult.runningMaxSpeed
    const view = buildViewModel(frameResult)
    onFrame(view)
    return view
  }

  function startTransfer(config) {
    const cfg = config || {}
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
    const payload = update || {}
    const nextNow = Number.isFinite(payload.nowMs) ? payload.nowMs : now()
    if (!started) {
      startTransfer({ totalSize: payload.totalSize, nowMs: nextNow })
    }

    if (Number.isFinite(payload.totalSize) && payload.totalSize > 0 && payload.totalSize !== totalSize) {
      totalSize = payload.totalSize
      seriesConfig.maxValue = totalSize
    }

    const elapsedMs = Number.isFinite(payload.elapsedMs)
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
    const payload = update || {}
    const nextNow = Number.isFinite(payload.nowMs) ? payload.nowMs : now()

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
    const payload = update || {}
    if (Number.isFinite(payload.totalSize) && payload.totalSize > 0) {
      totalSize = payload.totalSize
      seriesConfig.maxValue = totalSize
    }
    if (!started) {
      startTransfer({ totalSize, nowMs: payload.nowMs })
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
    const resumeAt = Number.isFinite(nowMs) ? nowMs : now()
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
    const bounded = Math.max(1, Math.min(canvasWidth, Math.round(nextWindow)))
    if (bounded === pixelAverageWindow) return
    pixelAverageWindow = bounded
    notifyControls()
    refreshGraphScale()
  }

  function setMaxSpeedDecay(nextValue) {
    const bounded = Math.max(0.5, Math.min(0.999, Math.round(nextValue * 1000) / 1000))
    if (bounded === maxSpeedDecay) return
    maxSpeedDecay = bounded
    notifyControls()
    refreshGraphScale()
  }

  function setMaxSpeedHeadroom(nextValue) {
    const bounded = Math.max(1, Math.min(2, Math.round(nextValue * 100) / 100))
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
    renderFrame,
    reset,
    startTransfer,
    pushProgress,
    replaceRenderedSeries,
    finishTransfer,
    cancel,
    pause,
    resume,
    toggleFinishedPauseVisual,
    refreshGraphScale,
    setPixelAverageWindow,
    setMaxSpeedDecay,
    setMaxSpeedHeadroom,
    getSeries,
    getState,
    getControlsView,
  }
}

export {
  createTransferGraphController,
}
