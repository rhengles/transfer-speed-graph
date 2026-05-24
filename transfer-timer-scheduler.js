class TransferTimerScheduler {
  constructor(scheduleFn, unscheduleFn) {
    this.schedule = typeof scheduleFn === 'function'
      ? function (callback, delayMs) { return scheduleFn.call(globalThis, callback, delayMs) }
      : function (callback, delayMs) { return globalThis.setTimeout(callback, delayMs) }
    this.unschedule = typeof unscheduleFn === 'function'
      ? function (timerId) { return unscheduleFn.call(globalThis, timerId) }
      : function (timerId) { return globalThis.clearTimeout(timerId) }
    this.timerId = null
  }

  clear() {
    if (this.timerId !== null) {
      this.unschedule(this.timerId)
      this.timerId = null
    }
  }

  scheduleOnce(delayMs, callback) {
    this.clear()
    this.timerId = this.schedule(callback, delayMs)
  }
}

export {
  TransferTimerScheduler,
}
