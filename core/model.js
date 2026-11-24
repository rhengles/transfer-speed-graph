class TransferGraphModel {
  now = Date.now
  initialTotalSize = 0
  totalSize = 0
  pixelAverageWindow = 1
  maxSpeedDecay = 0.5
  maxSpeedHeadroom = 1.06
  ignoreTrailingSpeedSample = true
  minSampleIntervalMs = 50

  constructor(options) {
    this.setOptions(options)

    this.series = [[0, 0]]
    this.runningMaxSpeed = 0
    // Latest sample held back because it arrived less than minSampleIntervalMs
    // after the last point of the series. It still counts for the displayed progress.
    this.pendingPoint = null
    // Bytes already transferred when startTransfer was called without a usable
    // start time; resolved into the series once the first real speed is known.
    this.pendingBaseline = null
    // Shift added to the elapsed time of series points (see resolvePendingBaseline).
    this.seriesTimeOffset = 0

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
    if (Number.isFinite(opts.totalSize) && opts.totalSize > 0) {
      this.initialTotalSize = opts.totalSize
      this.totalSize = opts.totalSize
    }

    this.pixelAverageWindow = Number.isFinite(opts.pixelAverageWindow)
      ? Math.max(1, Math.round(opts.pixelAverageWindow))
      : this.pixelAverageWindow
    this.maxSpeedDecay = Number.isFinite(opts.maxSpeedDecay) ? opts.maxSpeedDecay : this.maxSpeedDecay
    this.maxSpeedHeadroom = Number.isFinite(opts.maxSpeedHeadroom) ? opts.maxSpeedHeadroom : this.maxSpeedHeadroom
    this.ignoreTrailingSpeedSample = typeof opts.ignoreTrailingSpeedSample === 'boolean'
      ? opts.ignoreTrailingSpeedSample
      : this.ignoreTrailingSpeedSample
    this.minSampleIntervalMs = Number.isFinite(opts.minSampleIntervalMs)
      ? Math.max(0, opts.minSampleIntervalMs)
      : this.minSampleIntervalMs
  }

  isPauseVisualActive() {
    return this.paused || (this.finished && this.finishedPauseVisual)
  }

  getNow(nowMs) {
    return Number.isFinite(nowMs) ? nowMs : this.now()
  }

  // Elapsed time in the time base of the series (differs from getElapsed only
  // when the start of the transfer had to be estimated, see resolvePendingBaseline).
  getSeriesElapsed(nowMs) {
    return this.getElapsed(nowMs) + this.seriesTimeOffset
  }

  // Bytes shown as progress: includes samples held back by minSampleIntervalMs.
  getTransferredBytes() {
    let bytes = this.series[this.series.length - 1][1]
    if (this.pendingPoint && this.pendingPoint[1] > bytes) bytes = this.pendingPoint[1]
    if (this.pendingBaseline && this.pendingBaseline.bytes > bytes) bytes = this.pendingBaseline.bytes
    return bytes
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
      minSampleIntervalMs: this.minSampleIntervalMs,
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
    this.pendingPoint = null
    this.pendingBaseline = null
    this.seriesTimeOffset = 0
  }

  // Appends a point to the series. Points closer than minSampleIntervalMs to the
  // previous one are held in pendingPoint (they would show up as a speed spike);
  // a later sample replaces them. With `force` (final point) the point is always
  // kept, replacing the previous one when the interval is too short.
  appendSeriesPoint(elapsedMs, transferredBytes, force) {
    let nextElapsed = Math.max(0, Math.round(elapsedMs || 0))
    let nextTransferred = Math.max(0, Math.min(this.totalSize, transferredBytes || 0))
    const prev = this.series[this.series.length - 1]
    if (this.pendingPoint && nextTransferred < this.pendingPoint[1]) nextTransferred = this.pendingPoint[1]
    if (prev && nextElapsed < prev[0]) nextElapsed = prev[0]
    if (prev && nextTransferred < prev[1]) nextTransferred = prev[1]
    if (prev && prev[0] === nextElapsed && prev[1] === nextTransferred) {
      this.pendingPoint = null
      return
    }
    const minInterval = this.minSampleIntervalMs
    const tooClose = prev && minInterval > 0 && nextElapsed - prev[0] < minInterval
    if (tooClose && !force) {
      this.pendingPoint = [nextElapsed, nextTransferred]
      return
    }
    this.pendingPoint = null
    if (tooClose && this.series.length > 1) {
      this.series[this.series.length - 1] = [nextElapsed, nextTransferred]
      return
    }
    this.series.push([nextElapsed, nextTransferred])
  }

  // Called with each new sample while the bytes passed to startTransfer still have
  // no known duration (startTransfer without a start time in the past). The first
  // sample far enough apart gives the current speed; the bytes already done are
  // drawn as if transferred at that speed, so they do not become a spike. Their
  // estimated duration goes into seriesTimeOffset (used by the series and the
  // remaining-time estimate, not by the reported elapsed time).
  resolvePendingBaseline(elapsedMs, transferredBytes) {
    const base = this.pendingBaseline
    if (!base) return true
    const dt = elapsedMs - base.elapsedMs
    const dv = transferredBytes - base.bytes
    if (!(dt >= Math.max(1, this.minSampleIntervalMs) && dv > 0)) return false
    const speed = dv / dt
    const estimatedElapsed = base.bytes / speed
    this.seriesTimeOffset = Math.max(0, estimatedElapsed - base.elapsedMs)
    this.pendingBaseline = null
    this.series.push([Math.max(1, Math.round(base.elapsedMs + this.seriesTimeOffset)), base.bytes])
    return true
  }

  // Shared by pushProgress and finishTransfer.
  appendSample(payload, nowMs, force) {
    const elapsedMs = Number.isFinite(payload.elapsedMs)
      ? payload.elapsedMs
      : this.getElapsed(nowMs)
    const transferredBytes = Number.isFinite(payload.transferredBytes)
      ? payload.transferredBytes
      : (force ? this.totalSize : 0)
    if (!this.resolvePendingBaseline(elapsedMs, transferredBytes) && !force) {
      const bytes = Math.max(this.pendingPoint ? this.pendingPoint[1] : 0, Math.min(this.totalSize, transferredBytes))
      this.pendingPoint = [Math.max(0, Math.round(elapsedMs)), bytes]
      return
    }
    if (this.pendingBaseline) {
      // Finished before any speed could be measured: nothing better to show.
      this.pendingBaseline = null
    }
    this.appendSeriesPoint(elapsedMs + this.seriesTimeOffset, transferredBytes, force)
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

    const initialBytes = Number.isFinite(cfg.transferredBytes)
      ? Math.max(0, Math.min(this.totalSize, cfg.transferredBytes))
      : 0
    // Read the clock once (and only when needed), so a custom `now` sees a single call.
    const needsClock = !Number.isFinite(cfg.nowMs) || initialBytes > 0
    const currentNow = needsClock ? this.now() : 0

    this.started = true
    this.paused = false
    this.finished = false
    this.cancelled = false
    this.finishedPauseVisual = false
    this.startedAt = Number.isFinite(cfg.nowMs) ? cfg.nowMs : currentNow
    this.pausedAt = 0
    this.pausedDuration = 0
    this.resetSeries()

    // Transfer already in progress: start the series from the bytes already done.
    if (initialBytes > 0) {
      const alreadyElapsed = Math.max(0, currentNow - this.startedAt)
      if (initialBytes >= this.totalSize) {
        this.series.push([Math.max(1, Math.round(alreadyElapsed)), initialBytes])
        this.finished = true
      } else if (alreadyElapsed >= Math.max(1, this.minSampleIntervalMs)) {
        // Known start time: the first segment is the average speed since nowMs.
        this.series.push([Math.round(alreadyElapsed), initialBytes])
      } else {
        this.pendingBaseline = { elapsedMs: alreadyElapsed, bytes: initialBytes }
      }
    }
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

    const reachedTotal = Number.isFinite(payload.transferredBytes) && payload.transferredBytes >= this.totalSize
    this.appendSample(payload, nextNow, reachedTotal)

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
    this.pendingPoint = null
    this.pendingBaseline = null
    this.seriesTimeOffset = 0

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
    this.appendSample(payload, this.getNow(payload.nowMs), true)
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
    const transferredBytes = this.getTransferredBytes()
    const pct = this.totalSize > 0 ? transferredBytes / this.totalSize : 0
    const pctInt = Math.round(pct * 100)
    const nowMs = this.now()
    const elapsedMs = this.getElapsed(nowMs)
    const seriesElapsedMs = this.getSeriesElapsed(nowMs)
    const remainingMs = pct > 0 ? seriesElapsedMs / pct * (1 - pct) : 0
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
