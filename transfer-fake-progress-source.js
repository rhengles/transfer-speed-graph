import {
  TransferController,
  clampSeriesIndex,
  TRANSFER_UI_DEFAULTS,
} from './transfer-simulation.js'
import { TransferTimerScheduler } from './transfer-timer-scheduler.js'
import { TransferSeriesSelection } from './transfer-series-selection.js'

class FakeProgressSource {
  constructor(options) {
    this.opts = options || {}
    this.now = typeof this.opts.now === 'function' ? this.opts.now : Date.now
    this.schedule = typeof this.opts.schedule === 'function' ? this.opts.schedule : setTimeout
    this.unschedule = typeof this.opts.unschedule === 'function' ? this.opts.unschedule : clearTimeout

    this.onStart = typeof this.opts.onStart === 'function' ? this.opts.onStart : function () {}
    this.onProgress = typeof this.opts.onProgress === 'function' ? this.opts.onProgress : function () {}
    this.onSeriesReplace = typeof this.opts.onSeriesReplace === 'function' ? this.opts.onSeriesReplace : function () {}
    this.onFinish = typeof this.opts.onFinish === 'function' ? this.opts.onFinish : function () {}
    this.onCancel = typeof this.opts.onCancel === 'function' ? this.opts.onCancel : function () {}
    this.onPauseState = typeof this.opts.onPauseState === 'function' ? this.opts.onPauseState : function () {}
    this.onControls = typeof this.opts.onControls === 'function' ? this.opts.onControls : function () {}
    this.onOutOfBounds = typeof this.opts.onOutOfBounds === 'function' ? this.opts.onOutOfBounds : function (seriesIndex) {
      console.warn('Generated size out of bounds at index ' + seriesIndex)
    }

    this.seriesSelection = new TransferSeriesSelection({
      clampSeriesIndex,
      seriesCount: this.opts.seriesCount || TRANSFER_UI_DEFAULTS.seriesCount || 1,
      seriesActiveIndex: this.opts.seriesAverageActiveIndex || 1,
    })
    this.seriesCount = this.seriesSelection.seriesCount
    this.controller = null
    this.scheduler = new TransferTimerScheduler(this.schedule, this.unschedule)

    this.notifyControls()
  }

  getControlsView() {
    return this.seriesSelection.getControlsView()
  }

  notifyControls() {
    this.onControls(this.getControlsView())
  }

  getActiveTransferredBytes() {
    return this.seriesSelection.getActiveTransferredBytes(this.controller)
  }

  getActiveSeriesPoints() {
    return this.seriesSelection.getActiveSeriesPoints(this.controller)
  }

  clearTimer() {
    this.scheduler.clear()
  }

  scheduleTick() {
    if (!this.controller || this.controller.isPaused() || this.controller.isFinished()) return
    const frameMs = this.controller.nextFrameMs()
    this.scheduler.scheduleOnce(frameMs, () => {
      this.tick(frameMs)
    })
  }

  tick(frameMs) {
    if (!this.controller) return
    const result = this.controller.runStep({ frameMs, nowMs: this.now() })
    if (!result.advanced) return

    if (result.outOfBoundsIndex) {
      this.onOutOfBounds(result.outOfBoundsIndex - 1)
    }

    this.onProgress({
      transferredBytes: this.getActiveTransferredBytes(),
      totalSize: this.controller.getTotalSize(),
      elapsedMs: result.elapsedMs,
      nowMs: this.now(),
    })

    if (result.finished) {
      this.onFinish({
        transferredBytes: this.getActiveTransferredBytes(),
        totalSize: this.controller.getTotalSize(),
        elapsedMs: result.elapsedMs,
        nowMs: this.now(),
      })
      return
    }

    this.scheduleTick()
  }

  start(mode) {
    this.clearTimer()
    this.controller = new TransferController({
      totalSize: this.opts.totalSize || TRANSFER_UI_DEFAULTS.totalSize,
      seriesCount: this.seriesCount,
      mode: mode || 'random',
    })
    this.controller.start(this.now())
    this.onStart({
      mode: mode || 'random',
      totalSize: this.controller.getTotalSize(),
      nowMs: this.now(),
    })
    this.onPauseState(false)
    this.scheduleTick()
  }

  setSeriesAverageActiveIndex(nextIndex) {
    if (!this.seriesSelection.setActiveIndex(nextIndex)) return
    this.notifyControls()

    // If fake transfer is active, immediately re-render from selected series.
    if (this.controller && this.controller.isStarted()) {
      this.onSeriesReplace({
        series: this.getActiveSeriesPoints(),
        totalSize: this.controller.getTotalSize(),
        elapsedMs: this.controller.getElapsed(this.now()),
        finished: this.controller.isFinished(),
        nowMs: this.now(),
      })
    }
  }

  cancel() {
    if (!this.controller) return
    this.clearTimer()
    this.controller.cancel()
    this.onCancel({ nowMs: this.now() })
  }

  pause() {
    if (!this.controller || this.controller.isFinished() || this.controller.isPaused()) return
    this.controller.pause(this.now())
    this.clearTimer()
    this.onPauseState(true)
  }

  resume() {
    if (!this.controller || this.controller.isFinished() || !this.controller.isPaused()) return
    this.controller.resume(this.now())
    this.onPauseState(false)
    this.scheduleTick()
  }

  togglePause() {
    if (!this.controller || this.controller.isFinished()) return false
    if (this.controller.isPaused()) {
      this.resume()
    } else {
      this.pause()
    }
    return this.controller.isPaused()
  }

  isPaused() {
    return this.controller ? this.controller.isPaused() : false
  }

  isActive() {
    return !!this.controller && this.controller.isStarted() && !this.controller.isFinished()
  }
}

function createFakeProgressSource(options) {
  return new FakeProgressSource(options)
}

export {
  FakeProgressSource,
  createFakeProgressSource,
}
