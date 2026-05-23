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
  var groupSeriesControls = document.getElementById('group-series-controls')
  var groupMaxSpeedDecay = document.getElementById('group-maxspeed-decay')
  var groupMaxSpeedHeadroom = document.getElementById('group-maxspeed-headroom')
  var groupMaxSpeedRecalc = document.getElementById('group-maxspeed-recalc')
  var startModeControls = document.getElementById('start-mode-controls')
  var btnStartRandom = document.getElementById('btn-start-random')
  var btnStartDeterministic = document.getElementById('btn-start-deterministic')
  var btnStartDownload = document.getElementById('btn-start-download')
  var btnStartUpload = document.getElementById('btn-start-upload')
  var inputDownloadUrl = document.getElementById('input-download-url')
  var inputDownloadSize = document.getElementById('input-download-size')
  var inputUploadUrl = document.getElementById('input-upload-url')
  var inputUploadSize = document.getElementById('input-upload-size')
  var btnPause = document.getElementById('btn-pause')
  var btnCancel = document.getElementById('btn-cancel')
  var btnReset = document.getElementById('btn-reset')
  var toggleBtn = document.getElementById('toggle-details')
  var toggleArrow = document.getElementById('toggle-arrow')
  var detailsPanel = document.getElementById('details-panel')

  var graphControlsState = {
    pixelAverageWindow: 1,
    canvasWidth: CANVAS_W,
    maxSpeedDecay: 0.5,
    maxSpeedHeadroom: 1.06,
  }

  var fakeControlsState = {
    seriesActiveIndex: 1,
    seriesCount: SERIES_COUNT,
  }

  function applySeriesControlsView(view) {
    fakeControlsState.seriesActiveIndex = view.seriesActiveIndex
    fakeControlsState.seriesCount = view.seriesCount
    seriesAvgActiveValue.textContent = view.seriesActiveIndex
    btnSeriesAvgActiveDown.disabled = view.seriesActiveIndex <= 1
    btnSeriesAvgActiveUp.disabled = view.seriesActiveIndex >= view.seriesCount
  }

  function applyControlsView(view) {
    graphControlsState.pixelAverageWindow = view.pixelAverageWindow
    graphControlsState.canvasWidth = view.canvasWidth
    graphControlsState.maxSpeedDecay = view.maxSpeedDecay
    graphControlsState.maxSpeedHeadroom = view.maxSpeedHeadroom

    pixelAvgValue.textContent = view.pixelAverageWindow + ' px / ' + view.canvasWidth
    maxSpeedDecayValue.textContent = view.maxSpeedDecay.toFixed(3)
    maxSpeedHeadroomValue.textContent = view.maxSpeedHeadroom.toFixed(2)

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
    updateToolbarVisibility(state)
    if (btnReset) {
      btnReset.style.display = state.started ? '' : 'none'
    }
  }

  var activeNetworkAbort = null
  var activeMode = 'idle'

  function isRealMode() {
    return activeMode === 'download' || activeMode === 'upload'
  }

  function updateToolbarVisibility(state) {
    if (groupMaxSpeedDecay) groupMaxSpeedDecay.style.display = 'none'
    if (groupMaxSpeedHeadroom) groupMaxSpeedHeadroom.style.display = 'none'
    if (groupMaxSpeedRecalc) groupMaxSpeedRecalc.style.display = 'none'
    if (groupSeriesControls) {
      groupSeriesControls.style.display = (state.started && isRealMode()) ? 'none' : ''
    }
  }

  function parsePositiveInt(value, fallback) {
    var parsed = parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
  }

  function getEndpointConfig() {
    var defaultDownloadUrl = 'https://httpbin.org/bytes/12582912?seed=2026'
    var defaultUploadUrl = 'https://httpbin.org/post'
    var defaultDownloadSize = 12 * 1024 * 1024
    var defaultUploadSize = 10 * 1024 * 1024
    return {
      downloadUrl: inputDownloadUrl && inputDownloadUrl.value.trim() ? inputDownloadUrl.value.trim() : defaultDownloadUrl,
      uploadUrl: inputUploadUrl && inputUploadUrl.value.trim() ? inputUploadUrl.value.trim() : defaultUploadUrl,
      downloadSize: parsePositiveInt(inputDownloadSize && inputDownloadSize.value, defaultDownloadSize),
      uploadSize: parsePositiveInt(inputUploadSize && inputUploadSize.value, defaultUploadSize),
    }
  }

  function stopActiveSource() {
    if (fakeSource.isActive()) {
      fakeSource.cancel()
    }
    if (activeNetworkAbort) {
      activeNetworkAbort.abort()
      activeNetworkAbort = null
    }
  }

  var app = transferGraphControllerApi.createTransferGraphController({
    ctx: ctx,
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
    totalSize: TOTAL_SIZE,
    mode: 'random',
    onFrame: applyFrameView,
    onControls: applyControlsView,
    onStateChange: applyStateView,
  })

  var fakeSource = transferFakeProgressSourceApi.createFakeProgressSource({
    totalSize: TOTAL_SIZE,
    seriesCount: SERIES_COUNT,
    onStart: function (ev) {
      app.startTransfer({ totalSize: ev.totalSize, nowMs: ev.nowMs })
      activeMode = ev.mode
    },
    onProgress: function (ev) {
      app.pushProgress(ev)
    },
    onFinish: function (ev) {
      app.finishTransfer(ev)
    },
    onControls: applySeriesControlsView,
    onCancel: function () {
      app.cancel()
      activeMode = 'idle'
    },
    onPauseState: function (isPaused) {
      if (isPaused) app.pause()
      else app.resume()
    },
  })

  function startFake(mode) {
    stopActiveSource()
    activeMode = mode
    fakeSource.start(mode)
  }

  function startRealDownloadExample() {
    stopActiveSource()
    activeMode = 'download'

    var endpoint = getEndpointConfig()

    var abortController = new AbortController()
    activeNetworkAbort = abortController

    var url = endpoint.downloadUrl
    var startedNow = Date.now()
    app.startTransfer({ totalSize: endpoint.downloadSize, nowMs: startedNow })

    fetch(url, { signal: abortController.signal }).then(function (res) {
      if (!res.ok || !res.body) {
        throw new Error('Download failed: ' + res.status)
      }

      var totalHeader = parseInt(res.headers.get('content-length') || '0', 10)
      var totalSize = Number.isFinite(totalHeader) && totalHeader > 0
        ? totalHeader
        : endpoint.downloadSize

      var reader = res.body.getReader()
      var loaded = 0

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) {
            app.finishTransfer({ transferredBytes: loaded, totalSize: totalSize, nowMs: Date.now() })
            activeNetworkAbort = null
            return
          }
          loaded += chunk.value.byteLength
          app.pushProgress({ transferredBytes: loaded, totalSize: totalSize, nowMs: Date.now() })
          return pump()
        })
      }

      return pump()
    }).catch(function (err) {
      if (abortController.signal.aborted) return
      console.warn('Real download example failed:', err)
      app.cancel()
      activeNetworkAbort = null
      activeMode = 'idle'
    })
  }

  function startRealUploadExample() {
    stopActiveSource()
    activeMode = 'upload'

    var endpoint = getEndpointConfig()

    var xhr = new XMLHttpRequest()
    var payloadSize = endpoint.uploadSize
    var payload = new Blob([new Uint8Array(payloadSize)])
    var startedNow = Date.now()

    app.startTransfer({ totalSize: payloadSize, nowMs: startedNow })

    activeNetworkAbort = {
      abort: function () {
        xhr.abort()
      }
    }

    xhr.upload.addEventListener('progress', function (ev) {
      if (!ev.lengthComputable) return
      app.pushProgress({
        transferredBytes: ev.loaded,
        totalSize: ev.total,
        nowMs: Date.now(),
      })
    })

    xhr.addEventListener('load', function () {
      app.finishTransfer({ transferredBytes: payloadSize, totalSize: payloadSize, nowMs: Date.now() })
      activeNetworkAbort = null
    })

    xhr.addEventListener('error', function () {
      console.warn('Real upload example failed')
      app.cancel()
      activeNetworkAbort = null
      activeMode = 'idle'
    })

    xhr.addEventListener('abort', function () {
      app.cancel()
      activeNetworkAbort = null
      activeMode = 'idle'
    })

    xhr.open('POST', endpoint.uploadUrl)
    xhr.send(payload)
  }

  toggleBtn.addEventListener('click', function () {
    var open = detailsPanel.classList.toggle('visible')
    toggleArrow.classList.toggle('open', open)
    toggleBtn.childNodes[2].nodeValue = open ? ' Fewer details' : ' More details'
  })

  btnPause.addEventListener('click', function () {
    if (fakeSource.isActive()) {
      fakeSource.togglePause()
      return
    }

    var state = app.getState()
    if (state.finished) {
      app.toggleFinishedPauseVisual()
    }
  })

  btnCancel.addEventListener('click', function () {
    stopActiveSource()
    app.cancel()
    activeMode = 'idle'
  })

  if (btnReset) {
    btnReset.addEventListener('click', function () {
      stopActiveSource()
      app.reset()
      activeMode = 'idle'
    })
  }

  btnStartRandom.addEventListener('click', function () {
    startFake('random')
  })

  btnStartDeterministic.addEventListener('click', function () {
    startFake('deterministic')
  })

  if (btnStartDownload) {
    btnStartDownload.addEventListener('click', function () {
      startRealDownloadExample()
    })
  }

  if (btnStartUpload) {
    btnStartUpload.addEventListener('click', function () {
      startRealUploadExample()
    })
  }

  btnSeriesAvgActiveDown.addEventListener('click', function () {
    fakeSource.setSeriesAverageActiveIndex(fakeControlsState.seriesActiveIndex - 1)
  })

  btnSeriesAvgActiveUp.addEventListener('click', function () {
    fakeSource.setSeriesAverageActiveIndex(fakeControlsState.seriesActiveIndex + 1)
  })

  btnAvgDown.addEventListener('click', function () {
    app.setPixelAverageWindow(graphControlsState.pixelAverageWindow - 1)
  })

  btnAvgUp.addEventListener('click', function () {
    app.setPixelAverageWindow(graphControlsState.pixelAverageWindow + 1)
  })

  btnDecayDown.addEventListener('click', function () {
    app.setMaxSpeedDecay(graphControlsState.maxSpeedDecay - 0.005)
  })

  btnDecayUp.addEventListener('click', function () {
    app.setMaxSpeedDecay(graphControlsState.maxSpeedDecay + 0.005)
  })

  btnHeadroomDown.addEventListener('click', function () {
    app.setMaxSpeedHeadroom(graphControlsState.maxSpeedHeadroom - 0.01)
  })

  btnHeadroomUp.addEventListener('click', function () {
    app.setMaxSpeedHeadroom(graphControlsState.maxSpeedHeadroom + 0.01)
  })

  btnRecalcScale.addEventListener('click', function () {
    app.refreshGraphScale()
  })

  document.getElementById('btn-close-title').addEventListener('click', function () {
    stopActiveSource()
    app.cancel()
    activeMode = 'idle'
  })

  app.renderFrame()

})()
