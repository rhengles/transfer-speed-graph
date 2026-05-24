class TransferControllerRuntime {
  constructor(mode) {
    this.mode = mode === 'deterministic' ? 'deterministic' : 'random'
    this.started = false
    this.paused = false
    this.finished = false
    this.startTime = 0
    this.pausedAt = 0
    this.pausedDuration = 0
    this.logicalElapsedMs = 0
  }

  reset() {
    this.started = false
    this.paused = false
    this.finished = false
    this.startTime = 0
    this.pausedAt = 0
    this.pausedDuration = 0
    this.logicalElapsedMs = 0
  }

  setMode(nextMode) {
    this.mode = nextMode === 'deterministic' ? 'deterministic' : 'random'
  }

  getElapsed(nowMs) {
    if (!this.started) return 0
    if (this.mode === 'deterministic') {
      return this.logicalElapsedMs
    }
    const now = Number.isFinite(nowMs) ? nowMs : Date.now()
    let base = now - this.startTime - this.pausedDuration
    if (this.paused) base = this.pausedAt - this.startTime - this.pausedDuration
    return Math.max(0, base)
  }

  start(nowMs) {
    if (this.started || this.finished) return false
    this.started = true
    this.paused = false
    this.startTime = Number.isFinite(nowMs) ? nowMs : Date.now()
    this.logicalElapsedMs = 0
    return true
  }

  pause(nowMs) {
    if (!this.started || this.finished || this.paused) return false
    this.paused = true
    this.pausedAt = Number.isFinite(nowMs) ? nowMs : Date.now()
    return true
  }

  resume(nowMs) {
    if (!this.started || this.finished || !this.paused) return false
    if (this.mode !== 'deterministic') {
      const now = Number.isFinite(nowMs) ? nowMs : Date.now()
      this.pausedDuration += now - this.pausedAt
    }
    this.paused = false
    return true
  }

  cancel() {
    if (this.finished) return false
    this.finished = true
    this.paused = false
    return true
  }

  advanceDeterministic(frameMs) {
    if (this.mode !== 'deterministic') return
    this.logicalElapsedMs += Math.max(0, Math.round(frameMs || 0))
  }
}

export {
  TransferControllerRuntime,
}
