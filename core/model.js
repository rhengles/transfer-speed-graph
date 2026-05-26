class TransferGraphModel {
  now = Date.now
  initialTotalSize = 0
  totalSize = 0
  pixelAverageWindow = 1
  maxSpeedDecay = 0.5
  maxSpeedHeadroom = 1.06
  ignoreTrailingSpeedSample = true

  constructor(options) {
    this.setOptions(options)

    this.series = [[0, 0]]
    this.runningMaxSpeed = 0

    this.started = false
    this.paused = false
    this.finished = false
    this.cancelled = false
    this.finishedPauseVisual = false
    this.startedAt = 0
    this.pausedAt = 0
    this.pausedDuration = 0
  }

  setOptions(options) {
    const opts = options || {}
    this.now = typeof opts.now === 'function' ? opts.now : this.now
    this.initialTotalSize = Number.isFinite(opts.totalSize) && opts.totalSize > 0 ? opts.totalSize : this.initialTotalSize
    this.totalSize = this.initialTotalSize

    this.pixelAverageWindow = Number.isFinite(opts.pixelAverageWindow)
      ? Math.max(1, Math.round(opts.pixelAverageWindow))
      : this.pixelAverageWindow
    this.maxSpeedDecay = Number.isFinite(opts.maxSpeedDecay) ? opts.maxSpeedDecay : this.maxSpeedDecay
    this.maxSpeedHeadroom = Number.isFinite(opts.maxSpeedHeadroom) ? opts.maxSpeedHeadroom : this.maxSpeedHeadroom
    this.ignoreTrailingSpeedSample = typeof opts.ignoreTrailingSpeedSample === 'boolean'
      ? opts.ignoreTrailingSpeedSample
      : this.ignoreTrailingSpeedSample
  }

  isPauseVisualActive() {
    return this.paused || (this.finished && this.finishedPauseVisual)
  }

  getNow(nowMs) {
    return Number.isFinite(nowMs) ? nowMs : this.now()
  }

  getElapsed(nowMs) {
    if (!this.started) return 0
    let currentNow = this.getNow(nowMs)
    if (this.paused) currentNow = this.pausedAt
    return Math.max(0, currentNow - this.startedAt - this.pausedDuration)
  }

  getState() {
    return {
      started: this.started,
      paused: this.paused,
      finished: this.finished,
      cancelled: this.cancelled,
      pauseVisualActive: this.isPauseVisualActive(),
      pauseButtonLabel: this.isPauseVisualActive() ? '▶' : '⏸',
      pauseButtonEnabled: this.started && !this.cancelled,
      runningMaxSpeed: this.runningMaxSpeed,
      pixelAverageWindow: this.pixelAverageWindow,
      maxSpeedDecay: this.maxSpeedDecay,
      maxSpeedHeadroom: this.maxSpeedHeadroom,
      ignoreTrailingSpeedSample: this.ignoreTrailingSpeedSample,
    }
  }

  getControlsView() {
    return {
      pixelAverageWindow: this.pixelAverageWindow,
      maxSpeedDecay: this.maxSpeedDecay,
      maxSpeedHeadroom: this.maxSpeedHeadroom,
    }
  }

  getSeries() {
    return this.series.slice()
  }

  resetSeries() {
    this.series = [[0, 0]]
    this.runningMaxSpeed = 0
  }

  appendSeriesPoint(elapsedMs, transferredBytes) {
    let nextElapsed = Math.max(0, Math.round(elapsedMs || 0))
    let nextTransferred = Math.max(0, Math.min(this.totalSize, transferredBytes || 0))
    const prev = this.series[this.series.length - 1]
    if (prev && prev[0] === nextElapsed && prev[1] === nextTransferred) return
    if (prev && nextElapsed < prev[0]) nextElapsed = prev[0]
    if (prev && nextTransferred < prev[1]) nextTransferred = prev[1]
    this.series.push([nextElapsed, nextTransferred])
  }

  normalizeSeriesPoints(inputSeries) {
    if (!Array.isArray(inputSeries) || !inputSeries.length) return [[0, 0]]

    const normalized = []
    for (let i = 0; i < inputSeries.length; i += 1) {
      const point = inputSeries[i]
      if (!Array.isArray(point) || point.length < 2) continue

      const rawElapsed = Number(point[0])
      const rawTransferred = Number(point[1])
      if (!Number.isFinite(rawElapsed) || !Number.isFinite(rawTransferred)) continue

      let elapsed = Math.max(0, Math.round(rawElapsed))
      let transferred = Math.max(0, Math.min(this.totalSize, rawTransferred))

      const prev = normalized.length ? normalized[normalized.length - 1] : null
      if (prev) {
        if (elapsed < prev[0]) elapsed = prev[0]
        if (transferred < prev[1]) transferred = prev[1]
        if (elapsed === prev[0] && transferred === prev[1]) continue
      }

      normalized.push([elapsed, transferred])
    }

    if (!normalized.length) return [[0, 0]]
    if (normalized[0][0] > 0 || normalized[0][1] > 0) normalized.unshift([0, 0])
    return normalized
  }

  updateTotalSize(nextTotalSize) {
    if (!(Number.isFinite(nextTotalSize) && nextTotalSize > 0)) return false
    if (nextTotalSize === this.totalSize) return false
    this.totalSize = nextTotalSize
    return true
  }

  startTransfer(config) {
    const cfg = config || {}
    this.updateTotalSize(cfg.totalSize)

    this.started = true
    this.paused = false
    this.finished = false
    this.cancelled = false
    this.finishedPauseVisual = false
    this.startedAt = this.getNow(cfg.nowMs)
    this.pausedAt = 0
    this.pausedDuration = 0
    this.resetSeries()
  }

  reset() {
    this.totalSize = this.initialTotalSize
    this.started = false
    this.paused = false
    this.finished = false
    this.cancelled = false
    this.finishedPauseVisual = false
    this.startedAt = 0
    this.pausedAt = 0
    this.pausedDuration = 0
    this.resetSeries()
  }

  pushProgress(update) {
    const payload = update || {}
    const nextNow = this.getNow(payload.nowMs)
    if (!this.started) {
      this.startTransfer({ totalSize: payload.totalSize, nowMs: nextNow })
    }

    this.updateTotalSize(payload.totalSize)

    const elapsedMs = Number.isFinite(payload.elapsedMs)
      ? payload.elapsedMs
      : this.getElapsed(nextNow)
    this.appendSeriesPoint(elapsedMs, payload.transferredBytes)

    if (this.series[this.series.length - 1][1] >= this.totalSize) {
      this.finished = true
      this.paused = false
    }
  }

  replaceRenderedSeries(update) {
    const payload = update || {}
    const nextNow = this.getNow(payload.nowMs)

    if (!this.started) {
      this.startTransfer({ totalSize: payload.totalSize, nowMs: nextNow })
    }

    this.updateTotalSize(payload.totalSize)

    if (Number.isFinite(payload.elapsedMs)) {
      this.startedAt = nextNow - Math.max(0, Math.round(payload.elapsedMs)) - this.pausedDuration
      if (this.paused) this.pausedAt = nextNow
    }

    this.series = this.normalizeSeriesPoints(payload.series)

    if (typeof payload.finished === 'boolean') {
      this.finished = payload.finished
    } else {
      this.finished = this.series[this.series.length - 1][1] >= this.totalSize
    }

    if (this.finished) this.paused = false
    this.cancelled = false
  }

  finishTransfer(update) {
    const payload = update || {}
    this.updateTotalSize(payload.totalSize)
    if (!this.started) {
      this.startTransfer({ totalSize: this.totalSize, nowMs: payload.nowMs })
    }
    this.appendSeriesPoint(
      Number.isFinite(payload.elapsedMs) ? payload.elapsedMs : this.getElapsed(payload.nowMs),
      Number.isFinite(payload.transferredBytes) ? payload.transferredBytes : this.totalSize
    )
    this.finished = true
    this.paused = false
  }

  cancel() {
    this.cancelled = true
    this.finished = true
    this.paused = false
  }

  pause(nowMs) {
    if (!this.started || this.finished || this.paused) return false
    this.paused = true
    this.pausedAt = this.getNow(nowMs)
    return true
  }

  resume(nowMs) {
    if (!this.started || this.finished || !this.paused) return false
    const resumeAt = this.getNow(nowMs)
    this.pausedDuration += Math.max(0, resumeAt - this.pausedAt)
    this.paused = false
    this.pausedAt = 0
    return true
  }

  toggleFinishedPauseVisual() {
    if (!this.finished) return false
    this.finishedPauseVisual = !this.finishedPauseVisual
    return true
  }

  refreshGraphScale() {
    if (this.series.length <= 1) return false
    this.runningMaxSpeed = 0
    return true
  }

  setPixelAverageWindow(nextWindow) {
    const bounded = Math.max(1, Math.round(nextWindow))
    if (bounded === this.pixelAverageWindow) return false
    this.pixelAverageWindow = bounded
    return true
  }

  setMaxSpeedDecay(nextValue) {
    const bounded = Math.max(0.5, Math.min(0.999, Math.round(nextValue * 1000) / 1000))
    if (bounded === this.maxSpeedDecay) return false
    this.maxSpeedDecay = bounded
    return true
  }

  setMaxSpeedHeadroom(nextValue) {
    const bounded = Math.max(1, Math.min(2, Math.round(nextValue * 100) / 100))
    if (bounded === this.maxSpeedHeadroom) return false
    this.maxSpeedHeadroom = bounded
    return true
  }

  buildViewModel(frameResult) {
    const transferredBytes = this.series[this.series.length - 1][1]
    const pct = this.totalSize > 0 ? transferredBytes / this.totalSize : 0
    const pctInt = Math.round(pct * 100)
    const elapsedMs = this.getElapsed(this.now())
    const remainingMs = pct > 0 ? elapsedMs / pct * (1 - pct) : 0
    const remBytes = Math.max(0, this.totalSize - transferredBytes)
    const speedBps = (typeof frameResult.lastRenderedSpeed === 'number' && Number.isFinite(frameResult.lastRenderedSpeed))
      ? frameResult.lastRenderedSpeed * 1000
      : undefined

    return {
      progress: pct,
      progressInt: pctInt,
      transferredBytes,
      totalSize: this.totalSize,
      remainingBytes: remBytes,
      elapsedMs,
      remainingMs,
      speedBps,
      cancelled: this.cancelled,
      finished: this.finished,
      state: this.getState(),
    }
  }
}

export {
  TransferGraphModel,
}
