import {
  TransferController,
} from './simulation.js'
import {
  clampSeriesIndex,
} from './series.js'
import { TransferTimerScheduler } from './timer-scheduler.js'
import { TransferSeriesSelection } from './series-selection.js'

const TRANSFER_UI_DEFAULTS = {
  totalSize: 256 * 1024 * 1024,
  seriesCount: 16,
}

class FakeProgressSource {
  constructor(options) {
    const opts = options || {}
    const {
      controller,
      now,
      schedule,
      unschedule,
      onStart,
      onProgress,
      onSeriesReplace,
      onFinish,
      onCancel,
      onPauseState,
      onControls,
      onOutOfBounds,
      seriesCount,
      seriesAverageActiveIndex,
      totalSize,
    } = opts

    this.totalSize = totalSize || TRANSFER_UI_DEFAULTS.totalSize
    this.now = typeof now === 'function' ? now : Date.now
    this.schedule = typeof schedule === 'function' ? schedule : setTimeout
    this.unschedule = typeof unschedule === 'function' ? unschedule : clearTimeout
    this.transferGraphController = controller || null

    this.onStart = typeof onStart === 'function' ? onStart : function () {}
    this.onProgress = typeof onProgress === 'function' ? onProgress : function () {}
    this.onSeriesReplace = typeof onSeriesReplace === 'function' ? onSeriesReplace : function () {}
    this.onFinish = typeof onFinish === 'function' ? onFinish : function () {}
    this.onCancel = typeof onCancel === 'function' ? onCancel : function () {}
    this.onPauseState = typeof onPauseState === 'function' ? onPauseState : function () {}
    this.onControls = typeof onControls === 'function' ? onControls : function () {}
    this.onOutOfBounds = typeof onOutOfBounds === 'function' ? onOutOfBounds : function (seriesIndex) {
      console.warn('Generated size out of bounds at index ' + seriesIndex)
    }

    this.seriesSelection = new TransferSeriesSelection({
      clampSeriesIndex,
      seriesCount: seriesCount || TRANSFER_UI_DEFAULTS.seriesCount || 1,
      seriesActiveIndex: seriesAverageActiveIndex || 1,
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

  syncStart(event) {
    if (this.transferGraphController) {
      this.transferGraphController.startTransfer({ totalSize: event.totalSize, nowMs: event.nowMs })
    }
    this.onStart(event)
  }

  syncProgress(event) {
    if (this.transferGraphController) {
      this.transferGraphController.pushProgress(event)
    }
    this.onProgress(event)
  }

  syncSeriesReplace(event) {
    if (this.transferGraphController) {
      this.transferGraphController.replaceRenderedSeries(event)
    }
    this.onSeriesReplace(event)
  }

  syncFinish(event) {
    if (this.transferGraphController) {
      this.transferGraphController.finishTransfer(event)
    }
    this.onFinish(event)
  }

  syncCancel(event) {
    if (this.transferGraphController) {
      this.transferGraphController.cancel()
    }
    this.onCancel(event)
  }

  syncPauseState(isPaused) {
    if (this.transferGraphController) {
      if (isPaused) this.transferGraphController.pause()
      else this.transferGraphController.resume()
    }
    this.onPauseState(isPaused)
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

    this.syncProgress({
      transferredBytes: this.getActiveTransferredBytes(),
      totalSize: this.controller.getTotalSize(),
      elapsedMs: result.elapsedMs,
      nowMs: this.now(),
    })

    if (result.finished) {
      this.syncFinish({
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
      totalSize: this.totalSize,
      seriesCount: this.seriesCount,
      mode: mode || 'random',
    })
    this.controller.start(this.now())
    this.syncStart({
      mode: mode || 'random',
      totalSize: this.controller.getTotalSize(),
      nowMs: this.now(),
    })
    this.syncPauseState(false)
    this.scheduleTick()
  }

  setSeriesAverageActiveIndex(nextIndex) {
    if (!this.seriesSelection.setActiveIndex(nextIndex)) return
    this.notifyControls()

    // If fake transfer is active, immediately re-render from selected series.
    if (this.controller && this.controller.isStarted()) {
      this.syncSeriesReplace({
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
    this.syncCancel({ nowMs: this.now() })
  }

  pause() {
    if (!this.controller || this.controller.isFinished() || this.controller.isPaused()) return
    this.controller.pause(this.now())
    this.clearTimer()
    this.syncPauseState(true)
  }

  resume() {
    if (!this.controller || this.controller.isFinished() || !this.controller.isPaused()) return
    this.controller.resume(this.now())
    this.syncPauseState(false)
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
  TRANSFER_UI_DEFAULTS,
  FakeProgressSource,
  createFakeProgressSource,
}
