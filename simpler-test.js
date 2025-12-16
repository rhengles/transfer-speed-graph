const fs = require('fs')
const path = require('path')
const {
	randSeries,
	randSegment,
	getValueOfSeriesItem,
	getTimeOfSeriesItem,
	createSeriesItemInverted,
	calcSeriesAverage,
	printSegment,
	printSeries,
	printAverage,
} = require('./simpler.js')
const { createCanvas } = require('canvas')

const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 120
const SNAPSHOT_DIR = path.join(__dirname, 'snapshots')
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'simpler.json')
const SNAPSHOT_IMAGE = path.join(SNAPSHOT_DIR, 'simpler.png')
const RNG_SEED = 0xC0FFEE

function createSeededRandom(seed) {
	let state = seed >>> 0
	return function random() {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 0x100000000
	}
}

function withSeededRandom(seed, fn) {
	const originalRandom = Math.random
	Math.random = createSeededRandom(seed)
	try {
		return fn()
	} finally {
		Math.random = originalRandom
	}
}

function renderStepToCanvas(config, stepList, canvasCtx, offsetY) {
	if (!stepList.length) return
	const lastStep = stepList[stepList.length - 1]
	const [, lastValue] = lastStep
	const maxValue = config.maxValue
	const lastX = lastValue / maxValue * (CANVAS_WIDTH - 1)
	canvasCtx.save()
	canvasCtx.translate(0, offsetY)
	canvasCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
	canvasCtx.fillStyle = '#00ff00'
	canvasCtx.strokeStyle = '#00e000'
	canvasCtx.beginPath()
	canvasCtx.rect(0.5, 0.5, lastX, CANVAS_HEIGHT-1)
	canvasCtx.fill()
	canvasCtx.stroke()
	canvasCtx.restore()
}

function renderSnapshotToCanvas(snapshot) {
	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT * snapshot.series.length)
	const ctx = canvas.getContext('2d')
	snapshot.series.forEach((_, index) => {
		const offsetY = index * CANVAS_HEIGHT
		const stepList = snapshot.series.slice(0, index + 1)
		renderStepToCanvas(
			snapshot.seriesConfig,
			stepList,
			ctx,
			offsetY,
		)
	})
	return canvas
}

const snapshot = withSeededRandom(RNG_SEED, () => {
	const seedHex = `0x${RNG_SEED.toString(16).toUpperCase()}`
	const data = { seed: seedHex }

	const {config: seriesConfig, series} = randSeries({
		minCount: 15,
		maxCount: 35,
		minTime: 0,
		maxTime: 100,
		minValue: 0,
		maxValue: 100,
	})
	data.seriesConfig = seriesConfig
	data.series = series

	data.amountOverTime = Array.from({ length: 10 }).map((_, index) => {
		const segmentVT = randSegment(series, -50, 150, 10, 30)
		const segPrintVT = printSegment(segmentVT)

		console.log(`Amount over time (random ${index+1}/10):`)
		console.log(segPrintVT.meta)
		console.log(segPrintVT.segment)
		console.log(segPrintVT.cut)
		return segPrintVT
	})

	data.timeOverAmount = Array.from({ length: 10 }).map((_, index) => {
		const segmentTV = randSegment(
			series,
			-50,
			150,
			10,
			30,
			getValueOfSeriesItem,
			getTimeOfSeriesItem,
			createSeriesItemInverted,
		)
		const segPrintTV = printSegment(segmentTV)

		console.log(`Time over amount (random ${index+1}/10):`)
		console.log(segPrintTV.meta)
		console.log(segPrintTV.segment)
		console.log(segPrintTV.cut)
		return segPrintTV
	})
	// data.timeOverAmount = 

	const seriesPrint = printSeries(series)
	seriesPrint.forEach((line) => console.log(line))
	data.seriesPrint = seriesPrint

	console.log('Average over time:')
	const avgVT = calcSeriesAverage(series, 10, 10)
	const avgPrintVT = printAverage(avgVT)
	avgPrintVT.avg.forEach((entry) => console.log(entry))
	console.log(avgPrintVT.sum)
	avgPrintVT.holes.forEach((hole) => console.log(hole))
	data.averageOverTime = avgPrintVT

	console.log('Average over size:')
	const avgTV = calcSeriesAverage(
		series,
		10,
		10,
		getValueOfSeriesItem,
		getTimeOfSeriesItem,
		createSeriesItemInverted,
	)
	const avgPrintTV = printAverage(avgTV)
	avgPrintTV.avg.forEach((entry) => console.log(entry))
	console.log(avgPrintTV.sum)
	avgPrintTV.holes.forEach((hole, index) => {
		console.log(`Hole ${index}`)
		console.log(hole)
	})
	data.averageOverSize = avgPrintTV

	// ****************

	console.log('Average over time [50]:')
	const avgVT50 = calcSeriesAverage(series, 50, 50)
	const avgPrintVT50 = printAverage(avgVT50)
	avgPrintVT50.avg.forEach((entry) => console.log(entry))
	console.log(avgPrintVT50.sum)
	avgPrintVT50.holes.forEach((hole) => console.log(hole))
	data.averageOverTime50 = avgPrintVT50

	console.log('Average over size [50]:')
	const avgTV50 = calcSeriesAverage(
		series,
		50,
		50,
		getValueOfSeriesItem,
		getTimeOfSeriesItem,
		createSeriesItemInverted,
	)
	const avgPrintTV50 = printAverage(avgTV50)
	avgPrintTV50.avg.forEach((entry) => console.log(entry))
	console.log(avgPrintTV50.sum)
	avgPrintTV50.holes.forEach((hole, index) => {
		console.log(`Hole ${index}`)
		console.log(hole)
	})
	data.averageOverSize50 = avgPrintTV50

	return data
})

fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2))
console.log(`Saved simpler snapshot to ${SNAPSHOT_FILE}`)

const snapshotCanvas = renderSnapshotToCanvas(snapshot)
fs.writeFileSync(SNAPSHOT_IMAGE, snapshotCanvas.toBuffer('image/png'))
console.log(`Saved simpler graph snapshot to ${SNAPSHOT_IMAGE}`)
