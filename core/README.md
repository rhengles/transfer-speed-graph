# Transfer Speed Graph

![Transfer Speed Graph](artwork/github-preview-720.png)

A lightweight, modular transfer-speed graph inspired by the Windows 8 file transfer dialog, with support for:

- Real transfer integration (download/upload)
- Deterministic and random fake transfer simulation
- Pause/cancel/finish states
- Highly configurable graph smoothing and dynamic Y-scale behavior

### Real Example

[Live homepage](https://speed-transfer.arijs.org/)

![Deterministic transfer at 50%](screenshots/deterministic-50perc.png)

## Quick Usage

### Download Example

```js
import { TransferGraphController } from './core/controller.js'

const controller = new TransferGraphController()
controller.setOnFrame((view) => {
  // update your UI with view.progressInt, view.speedBps, etc.
})

const downloadUrl = 'https://httpbin.org/bytes/12582912?seed=2026'
const fallbackTotalSize = 12 * 1024 * 1024

controller.setRendererOptions({
  canvasCtx,
  canvasWidth: 416,
  canvasHeight: 72,
})

fetch(downloadUrl).then(async (res) => {
  if (!res.ok || !res.body) throw new Error('Download failed: ' + res.status)

  const totalHeader = parseInt(res.headers.get('content-length') || '0', 10)
  const totalSize = Number.isFinite(totalHeader) && totalHeader > 0
    ? totalHeader
    : fallbackTotalSize

  const reader = res.body.getReader()
  let transferredBytes = 0

  controller.startTransfer({ totalSize })

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    transferredBytes += chunk.value.byteLength
    controller.pushProgress({ transferredBytes, totalSize })
  }

  controller.finishTransfer({ transferredBytes, totalSize })
}).catch((err) => {
  console.warn(err)
  controller.cancel()
})
```

Source example: [real/download-example.js](real/download-example.js)

### Upload Example

```js
import { TransferGraphController } from './core/controller.js'

const controller = new TransferGraphController()
const uploadUrl = 'https://httpbin.org/post'
const uploadSize = 10 * 1024 * 1024

const xhr = new XMLHttpRequest()
const payload = new Blob([new Uint8Array(uploadSize)])

controller.setRendererOptions({
  canvasCtx,
  canvasWidth: 416,
  canvasHeight: 72,
})
controller.startTransfer({ totalSize: uploadSize })

xhr.upload.addEventListener('progress', (ev) => {
  if (!ev.lengthComputable) return
  controller.pushProgress({
    transferredBytes: ev.loaded,
    totalSize: ev.total,
  })
})

xhr.addEventListener('load', () => {
  controller.finishTransfer({
    transferredBytes: uploadSize,
    totalSize: uploadSize,
  })
})

xhr.addEventListener('error', () => {
  console.warn('upload failed')
  controller.cancel()
})

xhr.addEventListener('abort', () => {
  controller.cancel()
})

xhr.open('POST', uploadUrl)
xhr.send(payload)
```

Source example: [real/upload-example.js](real/upload-example.js)

## State Showcase

Paused state:

![Paused transfer state](screenshots/deterministic-series16-67perc-paused.png)

Cancelled state:

![Cancelled transfer state](screenshots/deterministic-series16-67perc-cancelled.png)

## Why This Library Is Strong

### Clean Organization

The project is split by concern:

- Graph core:
  - [core/controller.js](core/controller.js)
  - [core/model.js](core/model.js)
  - [core/renderer.js](core/renderer.js)
  - [core/frame.js](core/frame.js)
- Fake transfer subsystem:
  - [fake/progress-source.js](fake/progress-source.js)
  - [fake/simulation.js](fake/simulation.js)
  - [fake/series.js](fake/series.js)
- Real transfer examples:
  - [real/download-example.js](real/download-example.js)
  - [real/upload-example.js](real/upload-example.js)

That separation keeps rendering, state management, fake generation, and transport examples independent and easy to evolve.

### High Configurability

Graph behavior can be tuned at runtime with controls such as:

- `pixelAverageWindow`
- `maxSpeedDecay`
- `maxSpeedHeadroom`
- `ignoreTrailingSpeedSample`

Fake simulation is configurable through `simulationOptions`, including:

- `minFrame`, `maxFrame`
- `minFrameRepeat`, `maxFrameRepeat`
- `minSizeInc`, `maxSizeInc`
- `deterministicSeed`

This allows both realistic noisy profiles and stable deterministic test profiles.

### Practical Runtime API

`TransferGraphController` gives a straightforward app-facing API:

- Lifecycle: `startTransfer`, `pushProgress`, `finishTransfer`, `cancel`, `reset`
- Visual control: `pause`, `resume`, `toggleFinishedPauseVisual`, `refreshGraphScale`
- Tuning: `setPixelAverageWindow`, `setMaxSpeedDecay`, `setMaxSpeedHeadroom`
- UI hooks: `setOnFrame`, `setOnControls`, `setOnStateChange`

## Development

Install dependencies:

```bash
npm install
```

Run tests / snapshot checks:

```bash
npm test
```

Open the demo UI by loading [index.html](index.html) in a browser.
