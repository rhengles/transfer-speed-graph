class TransferTimerScheduler {
  constructor(scheduleFn, unscheduleFn) {
    this.schedule = typeof scheduleFn === 'function' ? scheduleFn : setTimeout
    this.unschedule = typeof unscheduleFn === 'function' ? unscheduleFn : clearTimeout
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
