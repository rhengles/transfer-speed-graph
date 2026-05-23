(function () {

  // -- constants ------------------------------------------------------------
  var TOTAL_SIZE = TRANSFER_UI_DEFAULTS.totalSize
  var SERIES_COUNT = TRANSFER_UI_DEFAULTS.seriesCount
  var CANVAS_W = 416
  var CANVAS_H = 72

  // -- DOM refs -------------------------------------------------------------
  var canvas = document.getElementById('graph-canvas')
  var ctx = canvas.getContext('2d')
  var pctLabel = document.getElementById('pct-label')
  var titleText = document.getElementById('title-text')
  var statName = document.getElementById('stat-name')
  var statTime = document.getElementById('stat-time')
  var statItems = document.getElementById('stat-items')
  var statSpeed = document.getElementById('stat-speed')
  var statElapsed = document.getElementById('stat-elapsed')
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
  var btnPause = document.getElementById('btn-pause')
  var btnCancel = document.getElementById('btn-cancel')
  var toggleBtn = document.getElementById('toggle-details')
  var toggleArrow = document.getElementById('toggle-arrow')
  var detailsPanel = document.getElementById('details-panel')

  function applyControlsView(view) {
    seriesAvgActiveValue.textContent = view.seriesActiveIndex
    pixelAvgValue.textContent = view.pixelAverageWindow + ' px / ' + view.canvasWidth
    maxSpeedDecayValue.textContent = view.maxSpeedDecay.toFixed(3)
    maxSpeedHeadroomValue.textContent = view.maxSpeedHeadroom.toFixed(2)

    btnSeriesAvgActiveDown.disabled = view.seriesActiveIndex <= 1
    btnSeriesAvgActiveUp.disabled = view.seriesActiveIndex >= view.seriesCount
    btnAvgDown.disabled = view.pixelAverageWindow <= 1
    btnAvgUp.disabled = view.pixelAverageWindow >= view.canvasWidth
    btnDecayDown.disabled = view.maxSpeedDecay <= 0.5
    btnDecayUp.disabled = view.maxSpeedDecay >= 0.999
    btnHeadroomDown.disabled = view.maxSpeedHeadroom <= 1
    btnHeadroomUp.disabled = view.maxSpeedHeadroom >= 2
  }

  function bytesLabel(value) {
    return bytesSize(Math.max(0, value)).join(' ')
  }

  function applyFrameView(frame) {
    var progressText = frame.cancelled ? 'Transfer cancelled' : (frame.progressInt + '% complete')
    var titleValue = frame.cancelled ? 'Cancelled' : progressText
    var statTimeValue = frame.cancelled
      ? 'Cancelled'
      : frame.finished
      ? 'Complete'
      : frame.progress > 0
      ? 'About ' + printTime(Math.round(frame.remainingMs))
      : 'Calculating...'

    pctLabel.textContent = progressText
    titleText.textContent = titleValue
    statName.textContent = 'large_file_' + (Math.floor(frame.transferredBytes / (32 * 1024 * 1024)) + 1) + '.dat'
    statTime.textContent = statTimeValue
    statItems.textContent = '1 (' + bytesLabel(frame.remainingBytes) + ')'
    statSpeed.textContent = frame.speedBps ? (bytesLabel(frame.speedBps) + '/s') : ''
    statElapsed.textContent = printTime(frame.elapsedMs)
    statTransferred.textContent = bytesLabel(frame.transferredBytes) + ' / ' + bytesLabel(frame.totalSize)
  }

  function applyStateView(state) {
    btnPause.textContent = state.pauseButtonLabel
    btnPause.style.opacity = state.pauseButtonEnabled ? '1' : '0.4'
    btnPause.style.pointerEvents = state.pauseButtonEnabled ? 'auto' : 'none'
    startModeControls.style.display = state.started ? 'none' : ''
  }

  var app = transferGraphControllerApi.createTransferGraphController({
    ctx: ctx,
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
    totalSize: TOTAL_SIZE,
    seriesCount: SERIES_COUNT,
    mode: 'random',
    onFrame: applyFrameView,
    onControls: applyControlsView,
    onStateChange: applyStateView,
  })

  toggleBtn.addEventListener('click', function () {
    var open = detailsPanel.classList.toggle('visible')
    toggleArrow.classList.toggle('open', open)
    toggleBtn.childNodes[2].nodeValue = open ? ' Fewer details' : ' More details'
  })

  btnPause.addEventListener('click', function () {
    app.togglePause()
  })

  btnCancel.addEventListener('click', function () {
    app.cancel()
  })

  btnStartRandom.addEventListener('click', function () {
    app.start('random')
  })

  btnStartDeterministic.addEventListener('click', function () {
    app.start('deterministic')
  })

  btnSeriesAvgActiveDown.addEventListener('click', function () {
    app.setSeriesAverageActiveIndex(app.getControlsView().seriesActiveIndex - 1)
  })

  btnSeriesAvgActiveUp.addEventListener('click', function () {
    app.setSeriesAverageActiveIndex(app.getControlsView().seriesActiveIndex + 1)
  })

  btnAvgDown.addEventListener('click', function () {
    app.setPixelAverageWindow(app.getControlsView().pixelAverageWindow - 1)
  })

  btnAvgUp.addEventListener('click', function () {
    app.setPixelAverageWindow(app.getControlsView().pixelAverageWindow + 1)
  })

  btnDecayDown.addEventListener('click', function () {
    app.setMaxSpeedDecay(app.getControlsView().maxSpeedDecay - 0.005)
  })

  btnDecayUp.addEventListener('click', function () {
    app.setMaxSpeedDecay(app.getControlsView().maxSpeedDecay + 0.005)
  })

  btnHeadroomDown.addEventListener('click', function () {
    app.setMaxSpeedHeadroom(app.getControlsView().maxSpeedHeadroom - 0.01)
  })

  btnHeadroomUp.addEventListener('click', function () {
    app.setMaxSpeedHeadroom(app.getControlsView().maxSpeedHeadroom + 0.01)
  })

  btnRecalcScale.addEventListener('click', function () {
    app.refreshGraphScale()
  })

  document.getElementById('btn-close-title').addEventListener('click', function () {
    app.cancel()
  })

  app.renderFrame()

})()
