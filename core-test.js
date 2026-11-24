// Behaviour tests for the published TransferGraph API (node --test core-test.js).
// They render with node-canvas, like simpler-test.js, but go through the public
// TransferGraph facade instead of calling frame.js directly.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, Canvas } from 'canvas'
import { TransferGraph } from './core/main.js'
import { calcAverageSpeedsForResolution } from './core/frame.js'

const W = 416
const H = 72
const MB = 1024 * 1024
const OVERLAY_RGB = [0x06, 0xb0, 0x27]
const PROGRESS_RGB = [0xa1, 0xe9, 0x92]

function createClock(start = 0) {
	const clock = { t: start, now: () => clock.t }
	return clock
}

function createGraph({ canvas, pixelRatio, clock, modelOptions } = {}) {
	const cv = canvas || createCanvas(W, H)
	const graph = new TransferGraph({
		canvasCtx: cv.getContext('2d'),
		canvasWidth: W,
		canvasHeight: H,
		...(pixelRatio === undefined ? {} : { pixelRatio }),
		now: (clock || createClock()).now,
		...modelOptions,
	})
	return { graph, canvas: cv }
}

// Deterministic, slightly irregular transfer (200-450 ms between samples).
function runIrregularTransfer(graph, clock, upTo = 0.7) {
	const totalSize = 64 * MB
	graph.startTransfer({ totalSize })
	let bytes = 0
	let i = 0
	while (bytes < totalSize * upTo) {
		i += 1
		clock.t += 200 + (i * 37) % 250
		bytes += Math.round(MB * (0.3 + ((i * 53) % 100) / 60))
		graph.pushProgress({ transferredBytes: Math.min(bytes, totalSize - 1), totalSize })
	}
	return totalSize
}

function pixels(canvas) {
	return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
}

function isColor(data, width, x, y, rgb, tolerance = 40) {
	const i = (y * width + x) * 4
	return Math.abs(data[i] - rgb[0]) <= tolerance
		&& Math.abs(data[i + 1] - rgb[1]) <= tolerance
		&& Math.abs(data[i + 2] - rgb[2]) <= tolerance
}

// For each CSS column, the first row (in CSS pixels) painted with the overlay colour
// in any of the device pixels of that column.
function overlayTopProfile(canvas, ratio) {
	const data = pixels(canvas)
	const profile = []
	for (let x = 0; x < W; x++) {
		let top = -1
		for (let py = 0; py < canvas.height && top < 0; py++) {
			for (let px = Math.floor(x * ratio); px < Math.floor((x + 1) * ratio); px++) {
				if (isColor(data, canvas.width, px, py, OVERLAY_RGB)) { top = py / ratio; break }
			}
		}
		profile.push(top)
	}
	return profile
}

// For each CSS column, how many CSS pixels are covered by the speed area: the red
// channel goes from 161 (progress background) to 6 (speed area).
function overlayAreaProfile(canvas, ratio) {
	const data = pixels(canvas)
	const profile = []
	for (let x = 0; x < W; x++) {
		let covered = 0
		for (let px = Math.floor(x * ratio); px < Math.floor((x + 1) * ratio); px++) {
			for (let py = 0; py < canvas.height; py++) {
				const red = data[(py * canvas.width + px) * 4]
				covered += Math.max(0, Math.min(1, (161 - red) / (161 - 6)))
			}
		}
		profile.push(covered / ratio / ratio)
	}
	return profile
}

function renderedSpeeds(graph) {
	const model = graph.model
	const result = calcAverageSpeedsForResolution(model.totalSize, model.series, { w: W, h: H }, {
		pixelAverageWindow: model.pixelAverageWindow,
		ignoreTrailingSpeedSample: true,
	})
	return result.avgWithSpeeds.slice(0, result.renderPointCount).map((step) => step[2])
}

function withGlobals(globals, fn) {
	const previous = {}
	for (const key of Object.keys(globals)) {
		previous[key] = Object.getOwnPropertyDescriptor(globalThis, key)
		globalThis[key] = globals[key]
	}
	try {
		return fn()
	} finally {
		for (const key of Object.keys(globals)) {
			if (previous[key]) Object.defineProperty(globalThis, key, previous[key])
			else delete globalThis[key]
		}
	}
}

// -- pixelRatio ---------------------------------------------------------------

test('pixelRatio 1 draws exactly what an unmanaged canvas (0.1.3 behaviour) draws', () => {
	const results = [undefined, 1, false].map((pixelRatio) => {
		const clock = createClock()
		const { graph, canvas } = createGraph({ pixelRatio, clock })
		runIrregularTransfer(graph, clock)
		assert.equal(canvas.width, W)
		assert.equal(canvas.height, H)
		return pixels(canvas)
	})
	assert.deepEqual(results[1], results[2], 'pixelRatio 1 vs pixelRatio false')
	assert.deepEqual(results[0], results[2], 'default (node-canvas) vs pixelRatio false')
})

test('pixelRatio 2 doubles the backing store and keeps the drawing in place', () => {
	const run = (pixelRatio) => {
		const clock = createClock()
		const canvas = createCanvas(W, H)
		canvas.style = {}
		const { graph } = createGraph({ canvas, pixelRatio, clock })
		const totalSize = runIrregularTransfer(graph, clock)
		canvas.progressEndX = graph.model.getTransferredBytes() / totalSize * (W - 1)
		return canvas
	}
	const canvas1 = run(1)
	const canvas2 = run(2)

	assert.equal(canvas2.width, W * 2)
	assert.equal(canvas2.height, H * 2)
	assert.equal(canvas2.style.width, W + 'px')
	assert.equal(canvas2.style.height, H + 'px')
	// The context transform is restored after the frame.
	assert.ok(canvas2.getContext('2d').getTransform().isIdentity)

	// Height of the speed area in each CSS column (antialiasing-proof: fractional coverage).
	const area1 = overlayAreaProfile(canvas1, 1)
	const area2 = overlayAreaProfile(canvas2, 2)
	// The column where the progress bar ends is blended with the empty area at 1x; skip it.
	const endColumn = Math.floor(canvas1.progressEndX + 0.5)
	const diffs = area1.map((h, x) => Math.abs(x - endColumn) <= 1 ? 0 : Math.abs(h - area2[x]))
	const maxDiff = Math.max(...diffs)
	const meanDiff = diffs.reduce((sum, d) => sum + d, 0) / W
	assert.ok(area1.filter((h) => h > 10).length > W * 0.5, 'speed area drawn')
	assert.ok(meanDiff < 0.25, `mean column height difference ${meanDiff}`)
	assert.ok(maxDiff < 2, `max column height difference ${maxDiff}`)

	// Downscaled 2x image is close to the 1x one.
	const d1 = pixels(canvas1)
	const d2 = pixels(canvas2)
	let different = 0
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			for (let ch = 0; ch < 3; ch++) {
				const i1 = (y * W + x) * 4 + ch
				const at = (yy, xx) => d2[(yy * W * 2 + xx) * 4 + ch]
				const avg = (at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1)) / 4
				if (Math.abs(avg - d1[i1]) > 64) { different += 1; break }
			}
		}
	}
	assert.ok(different / (W * H) < 0.02, `${different} pixels differ`)
})

test('automatic pixelRatio follows devicePixelRatio for DOM canvases', () => {
	withGlobals({ HTMLCanvasElement: Canvas, devicePixelRatio: 2 }, () => {
		const clock = createClock()
		const canvas = createCanvas(W, H)
		canvas.style = {}
		const { graph } = createGraph({ canvas, clock })
		runIrregularTransfer(graph, clock)
		assert.equal(canvas.width, W * 2)
		assert.equal(canvas.height, H * 2)
		assert.equal(canvas.style.width, W + 'px')

		globalThis.devicePixelRatio = 1.5
		graph.renderFrame()
		assert.equal(canvas.width, Math.round(W * 1.5))
		assert.equal(canvas.height, Math.round(H * 1.5))
	})
})

test('scaling done by the caller is not doubled', () => {
	const reference = (() => {
		const clock = createClock()
		const canvas = createCanvas(W, H)
		const { graph } = createGraph({ canvas, pixelRatio: 2, clock })
		runIrregularTransfer(graph, clock)
		return pixels(canvas)
	})()

	// Caller already sized and scaled the canvas, and still passes pixelRatio 2.
	const explicit = (() => {
		const clock = createClock()
		const canvas = createCanvas(W * 2, H * 2)
		canvas.getContext('2d').scale(2, 2)
		const { graph } = createGraph({ canvas, pixelRatio: 2, clock })
		runIrregularTransfer(graph, clock)
		assert.equal(canvas.width, W * 2)
		return pixels(canvas)
	})()
	assert.deepEqual(explicit, reference)

	// Caller scales by hand and leaves pixelRatio automatic on a DOM canvas:
	// the library sees the transform and leaves canvas and transform alone.
	withGlobals({ HTMLCanvasElement: Canvas, devicePixelRatio: 2 }, () => {
		const clock = createClock()
		const canvas = createCanvas(W * 2, H * 2)
		canvas.style = { width: W + 'px', height: H + 'px' }
		const ctx = canvas.getContext('2d')
		ctx.scale(2, 2)
		const { graph } = createGraph({ canvas, clock })
		runIrregularTransfer(graph, clock)
		assert.equal(canvas.width, W * 2)
		assert.equal(ctx.getTransform().a, 2)
		assert.deepEqual(pixels(canvas), reference)
	})

	// Caller scales by hand with pixelRatio: false.
	const disabled = (() => {
		const clock = createClock()
		const canvas = createCanvas(W * 2, H * 2)
		canvas.getContext('2d').scale(2, 2)
		const { graph } = createGraph({ canvas, pixelRatio: false, clock })
		runIrregularTransfer(graph, clock)
		return pixels(canvas)
	})()
	assert.deepEqual(disabled, reference)
})

// -- starting with progress already done ---------------------------------------

function runConstantSpeedFrom40(startOptions) {
	const totalSize = 100 * MB
	const bytesPerMs = MB / 1000
	const startedAt = 1_000_000
	const clock = createClock(startedAt + 40_000) // screen opens 40 s into the transfer
	const { graph, canvas } = createGraph({ clock })
	const startBytes = Math.round(40_000 * bytesPerMs) // 40 %
	graph.startTransfer({ totalSize, ...startOptions(startedAt, startBytes) })
	const openedAt = clock.t
	while (clock.t < openedAt + 20_000) {
		clock.t += 250
		graph.pushProgress({ transferredBytes: Math.round((clock.t - startedAt) * bytesPerMs), totalSize })
	}
	return { graph, canvas, clock, openedAt, startedAt, totalSize, bytesPerMs }
}

function assertFlat(speeds, label) {
	const max = Math.max(...speeds)
	const min = Math.min(...speeds)
	assert.ok(max / min < 1.02, `${label}: speeds between ${min} and ${max}`)
}

function assertFlatProfile(canvas, label) {
	const profile = overlayTopProfile(canvas, 1).filter((y) => y >= 0)
	assert.ok(profile.length > W * 0.5, `${label}: overlay in ${profile.length} columns`)
	// Ignore the antialiased first columns and the last one.
	const inner = profile.slice(3, -1)
	const max = Math.max(...inner)
	const min = Math.min(...inner)
	assert.ok(max - min <= 1, `${label}: overlay top between rows ${min} and ${max}`)
}

test('the old way (no transferredBytes) makes a spike that flattens the curve', () => {
	const { graph } = runConstantSpeedFrom40(() => ({}))
	const speeds = renderedSpeeds(graph)
	assert.ok(Math.max(...speeds) / Math.min(...speeds) > 20, 'expected a spike')
})

test('startTransfer with transferredBytes and nowMs: flat curve, average since nowMs', () => {
	const { graph, canvas, clock, startedAt, totalSize, bytesPerMs } = runConstantSpeedFrom40(
		(startedAt, transferredBytes) => ({ transferredBytes, nowMs: startedAt })
	)
	assert.deepEqual(graph.model.series[1], [40_000, Math.round(40_000 * bytesPerMs)])
	assertFlat(renderedSpeeds(graph), 'speeds')
	assertFlatProfile(canvas, 'canvas')

	const view = graph.renderFrame()
	assert.equal(view.elapsedMs, clock.t - startedAt)
	const expectedRemaining = (totalSize - view.transferredBytes) / bytesPerMs
	assert.ok(Math.abs(view.remainingMs - expectedRemaining) < 50, `remaining ${view.remainingMs} vs ${expectedRemaining}`)
})

test('startTransfer with transferredBytes but no start time: no spike either', () => {
	const { graph, canvas, clock, openedAt, totalSize, bytesPerMs } = runConstantSpeedFrom40(
		(_, transferredBytes) => ({ transferredBytes })
	)
	assertFlat(renderedSpeeds(graph), 'speeds')
	assertFlatProfile(canvas, 'canvas')

	const view = graph.renderFrame()
	// Elapsed is what we actually observed; the estimate only feeds the curve and the ETA.
	assert.equal(view.elapsedMs, clock.t - openedAt)
	const expectedRemaining = (totalSize - view.transferredBytes) / bytesPerMs
	assert.ok(Math.abs(view.remainingMs - expectedRemaining) < 50, `remaining ${view.remainingMs} vs ${expectedRemaining}`)
})

test('progress already done is shown before the first speed sample', () => {
	const clock = createClock(5000)
	const { graph, canvas } = createGraph({ clock })
	let view
	graph.setOnFrame((v) => { view = v })
	graph.startTransfer({ totalSize: 100 * MB, transferredBytes: 40 * MB })
	assert.equal(view.transferredBytes, 40 * MB)
	assert.equal(view.progressInt, 40)
	const data = pixels(canvas)
	// Columns chosen away from the vertical grid lines.
	assert.ok(isColor(data, W, Math.round(W * 0.25), H / 2, PROGRESS_RGB, 10), 'progress bar drawn up to 40 %')
	assert.ok(!isColor(data, W, Math.round(W * 0.55), H / 2, PROGRESS_RGB, 10), 'nothing drawn after 40 %')
})

// -- minSampleIntervalMs --------------------------------------------------------

test('samples closer than minSampleIntervalMs do not become speed points', () => {
	const clock = createClock()
	const { graph } = createGraph({ clock })
	const totalSize = 10 * MB
	graph.startTransfer({ totalSize })
	clock.t = 200
	graph.pushProgress({ transferredBytes: 200 * 1024, totalSize })
	clock.t = 205 // burst: 2 MB more in 5 ms
	graph.pushProgress({ transferredBytes: 2200 * 1024, totalSize })
	assert.deepEqual(graph.getSeries(), [[0, 0], [200, 200 * 1024]])
	assert.equal(graph.renderFrame().transferredBytes, 2200 * 1024, 'held sample still shown as progress')

	clock.t = 400
	graph.pushProgress({ transferredBytes: 2400 * 1024, totalSize })
	assert.deepEqual(graph.getSeries(), [[0, 0], [200, 200 * 1024], [400, 2400 * 1024]])

	clock.t = 410 // finish right after: replaces the previous point instead of a 10 ms segment
	graph.finishTransfer({ transferredBytes: totalSize, totalSize })
	assert.deepEqual(graph.getSeries(), [[0, 0], [200, 200 * 1024], [410, totalSize]])
	assert.equal(graph.getState().finished, true)
})

test('minSampleIntervalMs: 0 keeps every sample', () => {
	const clock = createClock()
	const { graph } = createGraph({ clock, modelOptions: { minSampleIntervalMs: 0 } })
	graph.startTransfer({ totalSize: MB })
	clock.t = 3
	graph.pushProgress({ transferredBytes: 1000 })
	clock.t = 5
	graph.pushProgress({ transferredBytes: 2000 })
	assert.deepEqual(graph.getSeries(), [[0, 0], [3, 1000], [5, 2000]])
	assert.equal(graph.getState().minSampleIntervalMs, 0)
})

test('reaching the total in pushProgress is never held back', () => {
	const clock = createClock()
	const { graph } = createGraph({ clock })
	graph.startTransfer({ totalSize: MB })
	clock.t = 500
	graph.pushProgress({ transferredBytes: MB / 2 })
	clock.t = 510
	graph.pushProgress({ transferredBytes: MB })
	assert.equal(graph.getState().finished, true)
	assert.deepEqual(graph.getSeries().at(-1), [510, MB])
})

// -- injectable clock -----------------------------------------------------------

test('the now option drives every clock read', () => {
	const clock = createClock(10_000)
	const { graph } = createGraph({ clock })
	graph.startTransfer({ totalSize: 10 * MB })
	clock.t += 1500
	graph.pushProgress({ transferredBytes: MB })
	assert.deepEqual(graph.getSeries().at(-1), [1500, MB])
	assert.equal(graph.renderFrame().elapsedMs, 1500)

	graph.pause()
	clock.t += 4000
	assert.equal(graph.renderFrame().elapsedMs, 1500)
	graph.resume()
	clock.t += 500
	assert.equal(graph.renderFrame().elapsedMs, 2000)

	// Swapping the clock mid-transfer keeps the transfer (and its total size).
	const other = createClock(clock.t + 1000)
	graph.setModelOptions({ now: other.now })
	assert.equal(graph.model.totalSize, 10 * MB)
	assert.equal(graph.renderFrame().elapsedMs, 3000)
})
