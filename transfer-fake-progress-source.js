(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./transfer-simulation.js'))
  } else {
    root.transferFakeProgressSourceApi = factory(root)
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  var createTransferController = deps.createTransferController
  var TRANSFER_UI_DEFAULTS = deps.TRANSFER_UI_DEFAULTS || { totalSize: 256 * 1024 * 1024, seriesCount: 16 }

  function createFakeProgressSource(options) {
    var opts = options || {}
    var now = typeof opts.now === 'function' ? opts.now : Date.now
    var schedule = typeof opts.schedule === 'function' ? opts.schedule : setTimeout
    var unschedule = typeof opts.unschedule === 'function' ? opts.unschedule : clearTimeout

    var onStart = typeof opts.onStart === 'function' ? opts.onStart : function () {}
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {}
    var onFinish = typeof opts.onFinish === 'function' ? opts.onFinish : function () {}
    var onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : function () {}
    var onPauseState = typeof opts.onPauseState === 'function' ? opts.onPauseState : function () {}
    var onOutOfBounds = typeof opts.onOutOfBounds === 'function' ? opts.onOutOfBounds : function (seriesIndex) {
      console.warn('Generated size out of bounds at index ' + seriesIndex)
    }

    var controller = null
    var timerId = null

    function clearTimer() {
      if (timerId !== null) {
        unschedule(timerId)
        timerId = null
      }
    }

    function scheduleTick() {
      if (!controller || controller.isPaused() || controller.isFinished()) return
      var frameMs = controller.nextFrameMs()
      timerId = schedule(function () {
        tick(frameMs)
      }, frameMs)
    }

    function tick(frameMs) {
      if (!controller) return
      var result = controller.runStep({ frameMs: frameMs, nowMs: now() })
      if (!result.advanced) return

      if (result.outOfBoundsIndex) {
        onOutOfBounds(result.outOfBoundsIndex - 1)
      }

      onProgress({
        transferredBytes: result.transferredBytes,
        totalSize: controller.getTotalSize(),
        elapsedMs: result.elapsedMs,
        nowMs: now(),
      })

      if (result.finished) {
        onFinish({
          transferredBytes: result.transferredBytes,
          totalSize: controller.getTotalSize(),
          elapsedMs: result.elapsedMs,
          nowMs: now(),
        })
        return
      }

      scheduleTick()
    }

    function start(mode) {
      clearTimer()
      controller = createTransferController({
        totalSize: opts.totalSize || TRANSFER_UI_DEFAULTS.totalSize,
        seriesCount: opts.seriesCount || TRANSFER_UI_DEFAULTS.seriesCount,
        mode: mode || 'random',
      })
      controller.start(now())
      onStart({
        mode: mode || 'random',
        totalSize: controller.getTotalSize(),
        nowMs: now(),
      })
      onPauseState(false)
      scheduleTick()
    }

    function cancel() {
      if (!controller) return
      clearTimer()
      controller.cancel()
      onCancel({ nowMs: now() })
    }

    function pause() {
      if (!controller || controller.isFinished() || controller.isPaused()) return
      controller.pause(now())
      clearTimer()
      onPauseState(true)
    }

    function resume() {
      if (!controller || controller.isFinished() || !controller.isPaused()) return
      controller.resume(now())
      onPauseState(false)
      scheduleTick()
    }

    function togglePause() {
      if (!controller || controller.isFinished()) return false
      if (controller.isPaused()) {
        resume()
      } else {
        pause()
      }
      return controller.isPaused()
    }

    function isPaused() {
      return controller ? controller.isPaused() : false
    }

    function isActive() {
      return !!controller && controller.isStarted() && !controller.isFinished()
    }

    return {
      start: start,
      cancel: cancel,
      pause: pause,
      resume: resume,
      togglePause: togglePause,
      isPaused: isPaused,
      isActive: isActive,
    }
  }

  return {
    createFakeProgressSource: createFakeProgressSource,
  }
})
