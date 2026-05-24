import {
  createTransferController,
  clampSeriesIndex,
  TRANSFER_UI_DEFAULTS,
} from './transfer-simulation.js'

function createFakeProgressSource(options) {
  const opts = options || {}
  const now = typeof opts.now === 'function' ? opts.now : Date.now
  const schedule = typeof opts.schedule === 'function' ? opts.schedule : setTimeout
  const unschedule = typeof opts.unschedule === 'function' ? opts.unschedule : clearTimeout

  const onStart = typeof opts.onStart === 'function' ? opts.onStart : function () {}
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {}
  const onSeriesReplace = typeof opts.onSeriesReplace === 'function' ? opts.onSeriesReplace : function () {}
  const onFinish = typeof opts.onFinish === 'function' ? opts.onFinish : function () {}
  const onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : function () {}
  const onPauseState = typeof opts.onPauseState === 'function' ? opts.onPauseState : function () {}
  const onControls = typeof opts.onControls === 'function' ? opts.onControls : function () {}
  const onOutOfBounds = typeof opts.onOutOfBounds === 'function' ? opts.onOutOfBounds : function (seriesIndex) {
    console.warn('Generated size out of bounds at index ' + seriesIndex)
  }

  const seriesCount = Math.max(1, Math.floor(opts.seriesCount || TRANSFER_UI_DEFAULTS.seriesCount || 1))
  let seriesAverageActiveIndex = clampSeriesIndex(opts.seriesAverageActiveIndex || 1, seriesCount, true)
  let controller = null
  let timerId = null

  function getControlsView() {
    return {
      seriesActiveIndex: seriesAverageActiveIndex,
      seriesCount,
    }
  }

  function notifyControls() {
    onControls(getControlsView())
  }

  function getActiveTransferredBytes() {
    if (!controller) return 0
    const selectedSeries = controller.getSeries(seriesAverageActiveIndex, true)
    if (!selectedSeries || !selectedSeries.length) return 0
    return selectedSeries[selectedSeries.length - 1][1]
  }

  function getActiveSeriesPoints() {
    if (!controller) return [[0, 0]]
    const selectedSeries = controller.getSeries(seriesAverageActiveIndex, true)
    if (!selectedSeries || !selectedSeries.length) return [[0, 0]]

    const points = []
    for (let i = 0; i < selectedSeries.length; i += 1) {
      const row = selectedSeries[i]
      if (!Array.isArray(row) || row.length < 2) continue
      points.push([row[0], row[1]])
    }

    return points.length ? points : [[0, 0]]
  }

  function clearTimer() {
    if (timerId !== null) {
      unschedule(timerId)
      timerId = null
    }
  }

  function scheduleTick() {
    if (!controller || controller.isPaused() || controller.isFinished()) return
    const frameMs = controller.nextFrameMs()
    timerId = schedule(function () {
      tick(frameMs)
    }, frameMs)
  }

  function tick(frameMs) {
    if (!controller) return
    const result = controller.runStep({ frameMs, nowMs: now() })
    if (!result.advanced) return

    if (result.outOfBoundsIndex) {
      onOutOfBounds(result.outOfBoundsIndex - 1)
    }

    onProgress({
      transferredBytes: getActiveTransferredBytes(),
      totalSize: controller.getTotalSize(),
      elapsedMs: result.elapsedMs,
      nowMs: now(),
    })

    if (result.finished) {
      onFinish({
        transferredBytes: getActiveTransferredBytes(),
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
      seriesCount,
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

  function setSeriesAverageActiveIndex(nextIndex) {
    const bounded = clampSeriesIndex(nextIndex, seriesCount, true)
    if (bounded === seriesAverageActiveIndex) return
    seriesAverageActiveIndex = bounded
    notifyControls()

    // If fake transfer is active, immediately re-render from selected series.
    if (controller && controller.isStarted()) {
      onSeriesReplace({
        series: getActiveSeriesPoints(),
        totalSize: controller.getTotalSize(),
        elapsedMs: controller.getElapsed(now()),
        finished: controller.isFinished(),
        nowMs: now(),
      })
    }
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

  notifyControls()

  return {
    start,
    cancel,
    pause,
    resume,
    togglePause,
    setSeriesAverageActiveIndex,
    getControlsView,
    isPaused,
    isActive,
  }
}

export {
  createFakeProgressSource,
}
