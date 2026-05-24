function startRealDownloadExample(options) {
  const {
    controller,
    endpoint,
    setActiveMode,
    setActiveNetworkAbort,
    onError,
    now,
    canvasCtx,
    canvasWidth,
    canvasHeight,
  } = options
  if (!controller) throw new Error('startRealDownloadExample requires a controller')

  const abortController = new AbortController()
  setActiveMode('download')
  setActiveNetworkAbort(abortController)

  controller.setRendererOptions({
    canvasCtx,
    canvasWidth,
    canvasHeight,
  })
  controller.startTransfer({ totalSize: endpoint.downloadSize, nowMs: now() })

  return fetch(endpoint.downloadUrl, { signal: abortController.signal }).then(function (res) {
    if (!res.ok || !res.body) {
      throw new Error('Download failed: ' + res.status)
    }

    const totalHeader = parseInt(res.headers.get('content-length') || '0', 10)
    const totalSize = Number.isFinite(totalHeader) && totalHeader > 0
      ? totalHeader
      : endpoint.downloadSize

    const reader = res.body.getReader()
    let loaded = 0

    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) {
          controller.finishTransfer({ transferredBytes: loaded, totalSize: totalSize, nowMs: now() })
          setActiveNetworkAbort(null)
          return
        }

        loaded += chunk.value.byteLength
        controller.pushProgress({ transferredBytes: loaded, totalSize: totalSize, nowMs: now() })
        return pump()
      })
    }

    return pump()
  }).catch(function (err) {
    if (abortController.signal.aborted) return
    onError(err)
    controller.cancel()
    setActiveNetworkAbort(null)
    setActiveMode('idle')
  })
}

export {
  startRealDownloadExample,
}
