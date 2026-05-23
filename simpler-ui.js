(function () {

  // -- constants ------------------------------------------------------------
  var TOTAL_SIZE    = TRANSFER_UI_DEFAULTS.totalSize
  var SERIES_COUNT  = TRANSFER_UI_DEFAULTS.seriesCount
  var CANVAS_W      = 416
  var CANVAS_H      = 72

  // -- state ----------------------------------------------------------------
  var seriesConfig  = { maxValue: TOTAL_SIZE }
  var seriesActiveIndex = 1
  var runningMaxSpeed = 0
  var pixelAverageWindow = 1
  var maxSpeedDecay = 0.500
  var maxSpeedHeadroom = 1.06
  var ignoreTrailingSpeedSample = true
  var tickTimer     = null
  var controller = createTransferController({
    totalSize: TOTAL_SIZE,
    seriesCount: SERIES_COUNT,
    mode: 'random',
  })

  // -- DOM refs -------------------------------------------------------------
  var canvas    = document.getElementById('graph-canvas')
  var ctx       = canvas.getContext('2d')
  var pctLabel  = document.getElementById('pct-label')
  var titleText = document.getElementById('title-text')
  var statName  = document.getElementById('stat-name')
  var statTime  = document.getElementById('stat-time')
  var statItems = document.getElementById('stat-items')
  var statSpeed = document.getElementById('stat-speed')
  var statElapsed    = document.getElementById('stat-elapsed')
  var statTransferred = document.getElementById('stat-transferred')
  var seriesAvgActiveValue = document.getElementById('series-avg-value')
  var pixelAvgValue = document.getElementById('pixel-avg-value')
  var maxSpeedDecayValue = document.getElementById('max-speed-decay-value')
  var maxSpeedHeadroomValue = document.getElementById('max-speed-headroom-value')
  var btnSeriesAvgActiveDown = document.getElementById('btn-series-avg-down')
  var btnSeriesAvgActiveUp = document.getElementById('btn-series-avg-up')
  var btnAvgDown = document.getElementById('btn-avg-down')
  var btnAvgUp = document.getElementById('btn-avg-up')
  var btnDecayDown = document.getElementById('btn-decay-down')
  var btnDecayUp = document.getElementById('btn-decay-up')
  var btnHeadroomDown = document.getElementById('btn-headroom-down')
  var btnHeadroomUp = document.getElementById('btn-headroom-up')
  var btnRecalcScale = document.getElementById('btn-recalc-scale')
  var startModeControls = document.getElementById('start-mode-controls')
  var btnStartRandom = document.getElementById('btn-start-random')
  var btnStartDeterministic = document.getElementById('btn-start-deterministic')
  var btnPause  = document.getElementById('btn-pause')
  var btnCancel = document.getElementById('btn-cancel')
  var toggleBtn = document.getElementById('toggle-details')
  var toggleArrow   = document.getElementById('toggle-arrow')
  var detailsPanel  = document.getElementById('details-panel')

  // -- helpers --------------------------------------------------------------
  function setSimulationMode(mode) {
    controller.setMode(mode)
  }

  function getSeries() {
    return controller.getSeries(seriesActiveIndex, true)
  }

  function elapsed() {
    return controller.getElapsed(Date.now())
  }

  function scheduleTick() {
    var nextFrame = controller.nextFrameMs()
    tickTimer = setTimeout(function () {
      tick(nextFrame)
    }, nextFrame)
  }

  function speedLabel(series) {
    if (series.length < 2) return ''
    var endIndex = series.length - 1
    if (ignoreTrailingSpeedSample && series.length > 2) {
      endIndex = series.length - 2
    }
    var a = series[endIndex - 1]
    var b = series[endIndex]
    var dt = b[0] - a[0]
    var dv = b[1] - a[1]
    if (dt <= 0 || dv <= 0) return ''
    var bps = (dv / dt) * 1000
    return bytesSize(bps).join(' ') + '/s'
  }

  function refreshGraphScale() {
    if (getSeries().length > 1) {
      runningMaxSpeed = 0
      renderFrame()
    }
  }

  function setSeriesAverageActiveIndex(nextWindow) {
    var bounded = clampSeriesIndex(nextWindow, SERIES_COUNT, true)
    if (bounded === seriesActiveIndex) return
    seriesActiveIndex = bounded
    updateSeriesAverageActiveIndex()
    refreshGraphScale()
  }

  function setPixelAverageWindow(nextWindow) {
    var bounded = Math.max(1, Math.min(CANVAS_W, Math.round(nextWindow)))
    if (bounded === pixelAverageWindow) return
    pixelAverageWindow = bounded
    updatePixelAverageUi()
    refreshGraphScale()
  }

  function updateSeriesAverageActiveIndex() {
    seriesAvgActiveValue.textContent = seriesActiveIndex
    btnSeriesAvgActiveDown.disabled = seriesActiveIndex <= 1
    btnSeriesAvgActiveUp.disabled = seriesActiveIndex >= SERIES_COUNT
  }

  function updatePixelAverageUi() {
    pixelAvgValue.textContent = pixelAverageWindow + ' px / ' + CANVAS_W
    btnAvgDown.disabled = pixelAverageWindow <= 1
    btnAvgUp.disabled = pixelAverageWindow >= CANVAS_W
  }

  function setMaxSpeedDecay(nextValue) {
    var bounded = Math.max(0.5, Math.min(0.999, Math.round(nextValue * 1000) / 1000))
    if (bounded === maxSpeedDecay) return
    maxSpeedDecay = bounded
    updateScaleUi()
    refreshGraphScale()
  }

  function setMaxSpeedHeadroom(nextValue) {
    var bounded = Math.max(1, Math.min(2, Math.round(nextValue * 100) / 100))
    if (bounded === maxSpeedHeadroom) return
    maxSpeedHeadroom = bounded
    updateScaleUi()
    refreshGraphScale()
  }

  function updateScaleUi() {
    maxSpeedDecayValue.textContent = maxSpeedDecay.toFixed(3)
    maxSpeedHeadroomValue.textContent = maxSpeedHeadroom.toFixed(2)
    btnDecayDown.disabled = maxSpeedDecay <= 0.5
    btnDecayUp.disabled = maxSpeedDecay >= 0.999
    btnHeadroomDown.disabled = maxSpeedHeadroom <= 1
    btnHeadroomUp.disabled = maxSpeedHeadroom >= 2
  }

  function renderFrame() {
    var transferredBytes = controller.getTransferredBytes()
    var pct = TOTAL_SIZE > 0 ? transferredBytes / TOTAL_SIZE : 0

    runningMaxSpeed = renderTransferGraphFrame({
      seriesConfig: seriesConfig,
      series: getSeries(),
      ctx: ctx,
      size: { w: CANVAS_W, h: CANVAS_H },
      runningMaxSpeed: runningMaxSpeed,
      recalculateMaxFromZero: true,
      graphOptions: {
        pixelAverageWindow: pixelAverageWindow,
        maxSpeedDecay: maxSpeedDecay,
        maxSpeedHeadroom: maxSpeedHeadroom,
        ignoreTrailingSpeedSample: ignoreTrailingSpeedSample,
      },
      renderOptions: {
        speedLabel: speedLabel(getSeries()),
        pixelAverageWindow: pixelAverageWindow,
        ignoreTrailingSpeedSample: ignoreTrailingSpeedSample,
        backgroundValue: controller.isFinished() ? TOTAL_SIZE : undefined,
        colorBackground: controller.isPaused() ? '#f4e499' : undefined,
        colorOverlay: controller.isPaused() ? '#b19704' : undefined,
        //gridColor: paused ? '#ebe070' : undefined,
      },
    })

    var pctInt = Math.round(pct * 100)
    pctLabel.textContent = pctInt + '% complete'
    titleText.textContent = pctInt + '% complete'

    var elMs = elapsed()
    var remaining = pct > 0 ? elMs / pct * (1 - pct) : 0

    statName.textContent = 'large_file_' + (Math.floor(transferredBytes / (32 * 1024 * 1024)) + 1) + '.dat'
    statTime.textContent = pct >= 1 ? 'Complete'
      : pct > 0 ? 'About ' + printTime(Math.round(remaining))
      : 'Calculating...'
    var remBytes = TOTAL_SIZE - transferredBytes
    statItems.textContent = '1 (' + bytesSize(remBytes).join(' ') + ')'
    statSpeed.textContent = speedLabel(getSeries())
    statElapsed.textContent = printTime(elMs)
    statTransferred.textContent = bytesSize(transferredBytes).join(' ') + ' / ' + bytesSize(TOTAL_SIZE).join(' ')
  }

  function tick(frameMs) {
    var stepResult = controller.runStep({
      frameMs: frameMs,
      nowMs: Date.now(),
    })
    if (!stepResult.advanced) return

    if (stepResult.outOfBoundsIndex) {
      console.warn('Generated size out of bounds at index ' + (stepResult.outOfBoundsIndex - 1))
    }

    renderFrame()

    if (stepResult.finished) {
      pctLabel.textContent = '100% complete'
      titleText.textContent = '100% complete'
      // btnPause.textContent = '⏸'
      // btnPause.style.opacity = '0.4'
      // btnPause.style.pointerEvents = 'none'
      return
    }

    scheduleTick()
  }

  function startTransfer() {
    if (controller.isStarted() || controller.isFinished()) return
    controller.start(Date.now())
    startModeControls.style.display = 'none'
    btnPause.style.opacity = '1'
    btnPause.style.pointerEvents = 'auto'
    scheduleTick()
  }

  function startTransferWithMode(mode) {
    if (controller.isStarted() || controller.isFinished()) return
    setSimulationMode(mode)
    startTransfer()
  }

  function togglePause() {
    if (!controller.isStarted()) return
    if (controller.isPaused()) {
      controller.resume(Date.now())
      btnPause.textContent = '⏸'
      renderFrame()
      if (!controller.isFinished()) {
        scheduleTick()
      }
    } else {
      controller.pause(Date.now())
      clearTimeout(tickTimer)
      btnPause.textContent = '▶'
      renderFrame()
    }
  }

  function cancelTransfer() {
    controller.cancel()
    clearTimeout(tickTimer)
    titleText.textContent = 'Cancelled'
    pctLabel.textContent = 'Transfer cancelled'
    btnPause.style.opacity = '0.4'
    btnPause.style.pointerEvents = 'none'
  }

  toggleBtn.addEventListener('click', function () {
    var open = detailsPanel.classList.toggle('visible')
    toggleArrow.classList.toggle('open', open)
    toggleBtn.childNodes[2].nodeValue = open ? ' Fewer details' : ' More details'
  })

  btnPause.addEventListener('click', togglePause)
  btnCancel.addEventListener('click', cancelTransfer)
  btnStartRandom.addEventListener('click', function () { startTransferWithMode('random') })
  btnStartDeterministic.addEventListener('click', function () { startTransferWithMode('deterministic') })
  btnSeriesAvgActiveDown.addEventListener('click', function () { setSeriesAverageActiveIndex(seriesActiveIndex - 1) })
  btnSeriesAvgActiveUp.addEventListener('click', function () { setSeriesAverageActiveIndex(seriesActiveIndex + 1) })
  btnAvgDown.addEventListener('click', function () { setPixelAverageWindow(pixelAverageWindow - 1) })
  btnAvgUp.addEventListener('click', function () { setPixelAverageWindow(pixelAverageWindow + 1) })
  btnDecayDown.addEventListener('click', function () { setMaxSpeedDecay(maxSpeedDecay - 0.005) })
  btnDecayUp.addEventListener('click', function () { setMaxSpeedDecay(maxSpeedDecay + 0.005) })
  btnHeadroomDown.addEventListener('click', function () { setMaxSpeedHeadroom(maxSpeedHeadroom - 0.01) })
  btnHeadroomUp.addEventListener('click', function () { setMaxSpeedHeadroom(maxSpeedHeadroom + 0.01) })
  btnRecalcScale.addEventListener('click', refreshGraphScale)
  document.getElementById('btn-close-title').addEventListener('click', cancelTransfer)

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, CANVAS_W - 1, CANVAS_H - 1)
  btnPause.style.opacity = '0.4'
  btnPause.style.pointerEvents = 'none'
  updateSeriesAverageActiveIndex()
  updatePixelAverageUi()
  updateScaleUi()

})()
