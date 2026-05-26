function startRealDownloadExample(options) {
  const {
    controller,
    endpoint,
    // setActiveMode,
    setActiveNetworkAbort,
    onError,
    canvasCtx,
    canvasWidth,
    canvasHeight,
  } = options
  if (!controller) throw new Error('startRealDownloadExample requires a controller')

  const abortController = new AbortController()
  // setActiveMode('download')
  setActiveNetworkAbort(abortController)

  // To display the transfer speed graph, you create an instance of
  // TransferGraphController, configure it with renderer options, and
  // then start a transfer with the total size. After that, you can
  // push progress updates as they happen, and call finishTransfer
  // when done. The controller will handle the rest (calculating
  // speeds, rendering frames, etc).
  // 
  // const controller = new TransferGraphController()

  controller.setRendererOptions({
    canvasCtx,
    canvasWidth,
    canvasHeight,
  })

  return fetch(endpoint.downloadUrl, { signal: abortController.signal }).then(function (res) {
    if (!res.ok || !res.body) {
      throw new Error('Download failed: ' + res.status)
    }

    const totalHeader = parseInt(res.headers.get('content-length') || '0', 10)
    const totalSize = Number.isFinite(totalHeader) && totalHeader > 0
      ? totalHeader
      : endpoint.downloadSize

    const reader = res.body.getReader()
    let transferredBytes = 0

    controller.startTransfer({ totalSize })

    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) {
          controller.finishTransfer({ transferredBytes, totalSize })
          setActiveNetworkAbort(null)
          return
        }

        transferredBytes += chunk.value.byteLength
        controller.pushProgress({ transferredBytes, totalSize })
        return pump()
      })
    }

    return pump()
  }).catch(function (err) {
    if (abortController.signal.aborted) return
    onError(err)
    controller.cancel()
    setActiveNetworkAbort(null)
    // setActiveMode('idle')
  })
}

export {
  startRealDownloadExample,
}
