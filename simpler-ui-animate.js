
function fnMod (fn, mod) {
	return function(t) {
		return mod(t, fn)
	}
}
function quad (x) {
	return x * x
}
function cubic (x) {
  return x * x * x
}
function modOut (t, fn) {
	return 1 - fn(1 - t)
}
function modTwice (t, fn) {
	return fn(t * 2) * 0.5
}
function modInOut (t, fn) {
	return (t < 0.5 ?
		modTwice(t, fn) :
		modOut(t, fnMod(fn, modTwice))
	)
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function easeInOutQuadPulse(progress) {
  const t = clamp01(progress)
  return modInOut(t, cubic)
  // if (t < 0.5) {
  //   return 2 * t * t
  // }
  // return 1 - Math.pow(-2 * t + 2, 2) / 2
}

function resolveWaveAmplitude(phaseMs, cycleMs) {
  const ascentCycleMs = cycleMs * 0.5
  const descentCycleMs = cycleMs * 0.5
  if (phaseMs < ascentCycleMs) {
    return easeInOutQuadPulse(phaseMs / ascentCycleMs)
  }
  return 1 - easeInOutQuadPulse((phaseMs - ascentCycleMs) / descentCycleMs)
}

function getPositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function createIdleWaveAnimator(options) {
  const opts = options || {}
  const app = opts.app
  const getActiveMode = typeof opts.getActiveMode === 'function' ? opts.getActiveMode : () => 'idle'
  const totalSize = getPositiveNumber(opts.totalSize, 1)
  const waveBarCount = Math.floor(getPositiveNumber(opts.waveBarCount, 10))
  const waveCycleMs = getPositiveNumber(opts.waveCycleMs, 3000)
  const waveOffsetMs = getPositiveNumber(opts.waveOffsetMs, 300)
  const waveMinSegmentMs = getPositiveNumber(opts.waveMinSegmentMs, 200)
  const waveMaxSegmentMs = getPositiveNumber(opts.waveMaxSegmentMs, 600)

  let rafId = 0
  let started = false
  let startMs = 0
  let pausedElapsedMs = 0
  let paused = false

  function buildWaveSeries(elapsedMs) {
    const series = [[0, 0]]
    const bytesPerBar = totalSize / waveBarCount
    let transferredBytes = 0

    for (let i = 0; i < waveBarCount; i += 1) {
      // Positive offset advances bars to the right, so peaks travel right -> left.
      const phaseMs = ((elapsedMs + i * waveOffsetMs) % waveCycleMs + waveCycleMs) % waveCycleMs
      const pulse = resolveWaveAmplitude(phaseMs, waveCycleMs)
      const segmentDurationMs = waveMaxSegmentMs - (waveMaxSegmentMs - waveMinSegmentMs) * pulse
      transferredBytes += bytesPerBar
      if (i === waveBarCount - 1) {
        transferredBytes = totalSize
      }
      series.push([series[series.length - 1][0] + segmentDurationMs, transferredBytes])
    }

    return series
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  function renderFrame() {
    if (getActiveMode() !== 'idle') {
      stop()
      return
    }
    if (paused) return

    if (!started) {
      started = true
      startMs = Date.now()
      app.startTransfer({
        totalSize,
        nowMs: startMs,
      })
    }

    const nowMs = Date.now()
    const elapsedMs = Math.max(0, nowMs - startMs)
    app.replaceRenderedSeries({
      series: buildWaveSeries(elapsedMs),
      totalSize,
      elapsedMs,
      finished: false,
      nowMs,
    })

    rafId = requestAnimationFrame(renderFrame)
  }

  function sync() {
    if (getActiveMode() !== 'idle') {
      stop()
      return
    }
    if (!rafId && !paused) {
      renderFrame()
    }
  }

  function pause(nowMs) {
    if (paused || getActiveMode() !== 'idle') return false
    pausedElapsedMs = Math.max(0, (Number.isFinite(nowMs) ? nowMs : Date.now()) - startMs)
    paused = true
    stop()
    app.pause(nowMs)
    return true
  }

  function resume(nowMs) {
    if (!paused || getActiveMode() !== 'idle') return false
    const resumeAt = Number.isFinite(nowMs) ? nowMs : Date.now()
    startMs = resumeAt - pausedElapsedMs
    paused = false
    app.resume(resumeAt)
    sync()
    return true
  }

  function reset() {
    stop()
    started = false
    startMs = 0
    pausedElapsedMs = 0
    paused = false
  }

  return {
    sync,
    stop,
    pause,
    resume,
    reset,
    isPaused: function () {
      return paused
    },
  }
}

export {
  createIdleWaveAnimator,
}