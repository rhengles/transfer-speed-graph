function startRealUploadExample(options) {
  const {
    controller,
    endpoint,
    setActiveMode,
    setActiveNetworkAbort,
    onError,
    canvasCtx,
    canvasWidth,
    canvasHeight,
  } = options
  if (!controller) throw new Error('startRealUploadExample requires a controller')

  setActiveMode('upload')

  const xhr = new XMLHttpRequest()
  const payloadSize = endpoint.uploadSize
  const payload = new Blob([new Uint8Array(payloadSize)])

  controller.setRendererOptions({
    canvasCtx,
    canvasWidth,
    canvasHeight,
  })
  controller.startTransfer({ totalSize: payloadSize })

  setActiveNetworkAbort({
    abort: function () {
      xhr.abort()
    }
  })

  xhr.upload.addEventListener('progress', function (ev) {
    if (!ev.lengthComputable) return
    controller.pushProgress({
      transferredBytes: ev.loaded,
      totalSize: ev.total,
    })
  })

  xhr.addEventListener('load', function () {
    controller.finishTransfer({ transferredBytes: payloadSize, totalSize: payloadSize })
    setActiveNetworkAbort(null)
  })

  xhr.addEventListener('error', function () {
    onError()
    controller.cancel()
    setActiveNetworkAbort(null)
    setActiveMode('idle')
  })

  xhr.addEventListener('abort', function () {
    controller.cancel()
    setActiveNetworkAbort(null)
    setActiveMode('idle')
  })

  xhr.open('POST', endpoint.uploadUrl)
  xhr.send(payload)

  return xhr
}

export {
  startRealUploadExample,
}
