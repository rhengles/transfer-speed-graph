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
	// calcSeriesSpeedsAverageAccumulated,
	calcSeriesSpeedsAtEachInterval,
	SERIES_TIME_UNIT,
	convertSeriesAccumulatedToDeltas,
	renderStepToCanvas,
	calcAverageSpeedsForResolution,
	resolveGraphMaxSpeed,
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

function getSnapshotAverage(label, series, resolution, averageValue, getValue, getTime, createItem) {
	console.log(`Average over ${label}:`)
	const avg = calcSeriesAverage(
		series,
		resolution, // 10,
		averageValue, // 10,
		getValue, // getValueOfSeriesItem,
		getTime, // getTimeOfSeriesItem,
		createItem, // createSeriesItemInverted,
	)
	const avgPrint = printAverage(avg)
	avgPrint.avg.forEach((entry) => console.log(entry))
	console.log('- Sum:', avgPrint.sum)
	avgPrint.holes.forEach((hole, index) => {
		console.log(`- Hole ${index}:`, hole)
	})
	return { avg, avgPrint }
}

function getSnapshotAverageSpeedsAtResolution(seriesConfig, series, { w: canvasWidth, h: canvasHeight }) {
	const avgSpeedsPerStep = []
	let lastResolutionEnd = 0
	let prevResolutionEnd = 0
	series.forEach((_, index) => {
		const stepList = series.slice(0, index + 1)
		const avgResult = calcAverageSpeedsForResolution(
			seriesConfig,
			stepList,
			{ w: canvasWidth, h: canvasHeight },
		)
		if (avgResult) {
			const {avgWithSpeeds, ...avgSpeedsForStep} = avgResult
			avgSpeedsPerStep.push({
				...avgSpeedsForStep,
				index,
				avgWithSpeeds: printSeries(avgWithSpeeds.slice(lastResolutionEnd)),
				avgWithSpeedsPrev: printSeries(avgWithSpeeds.slice(prevResolutionEnd, lastResolutionEnd)),
			})
			prevResolutionEnd = lastResolutionEnd
			lastResolutionEnd = avgWithSpeeds.length
		} else {
			avgSpeedsPerStep.push(null)
		}
	})
	return avgSpeedsPerStep
}

function renderSnapshotToCanvas(snapshot) {
	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT * snapshot.series.length)
	const ctx = canvas.getContext('2d')
	let runningMaxSpeed = 0

	snapshot.series.forEach((_, index) => {
		const offsetY = index * CANVAS_HEIGHT
		const stepList = snapshot.series.slice(0, index + 1)

		// Update the running max speed so the Y scale only ever grows (never rescales down)
		const avgResult = calcAverageSpeedsForResolution(
			snapshot.seriesConfig,
			stepList,
			{ w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
		)
		if (avgResult && avgResult.localMaxAvgSpeed > 0) {
			runningMaxSpeed = resolveGraphMaxSpeed(
				avgResult.localMaxAvgSpeed,
				runningMaxSpeed,
				{ maxSpeedDecay: 0.965, maxSpeedHeadroom: 1.06 }
			)
		}

		ctx.save()
		ctx.translate(0, offsetY)
		renderStepToCanvas(
			snapshot.seriesConfig,
			stepList,
			ctx,
			{ w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
			runningMaxSpeed || undefined,
		)
		ctx.restore()
	})

	return canvas
}

const snapshot = withSeededRandom(RNG_SEED, () => {
	const seedHex = `0x${RNG_SEED.toString(16).toUpperCase()}`
	const data = { seed: seedHex }

	const {config: seriesConfig, series: seriesBase} = randSeries({
		minCount: 15,
		maxCount: 35,
		minTime: 0,
		maxTime: 100,
		minValue: 0,
		maxValue: 100,
	})
	const series = calcSeriesSpeedsAtEachInterval(seriesBase, SERIES_TIME_UNIT.ACCUMULATED)
	data.seriesConfig = seriesConfig
	data.series = series

	const seriesDeltas = calcSeriesSpeedsAtEachInterval(
		convertSeriesAccumulatedToDeltas(seriesBase),
		SERIES_TIME_UNIT.INTERVAL,
	)
	data.seriesDeltas = seriesDeltas

	const seriesPrint = printSeries(series)
	console.log('Series accumulated:')
	seriesPrint.forEach((line) => console.log(line))
	data.seriesPrint = seriesPrint

	const seriesDeltasPrint = printSeries(seriesDeltas)
	console.log('Series deltas:')
	seriesDeltasPrint.forEach((line) => console.log(line))
	data.seriesDeltasPrint = seriesDeltasPrint

	data.amountOverTime = Array.from({ length: 2 }).map((_, index) => {
		const segmentVT = randSegment(series, -50, 150, 10, 30)
		const segPrintVT = printSegment(segmentVT)

		console.log(`Amount over time (random ${index+1}/10):`)
		console.log(segPrintVT.meta)
		console.log(segPrintVT.segment)
		console.log(segPrintVT.cut)
		return segPrintVT
	})

	data.timeOverAmount = Array.from({ length: 2 }).map((_, index) => {
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

	data.averageOverTime_10_10 = getSnapshotAverage(
		'time',
		series,
		10,
		10,
	).avgPrint

	// console.log('Average over time:')
	// const avgVT = calcSeriesAverage(series, 10, 10)
	// const avgPrintVT = printAverage(avgVT)
	// avgPrintVT.avg.forEach((entry) => console.log(entry))
	// console.log(avgPrintVT.sum)
	// avgPrintVT.holes.forEach((hole, index) => {
	// 	console.log(`Hole ${index}:`, hole)
	// })
	// data.averageOverTime = avgPrintVT

	data.averageOverSize_10_10 = getSnapshotAverage(
		'size',
		series,
		10,
		10,
		getValueOfSeriesItem,
		getTimeOfSeriesItem,
		createSeriesItemInverted,
	).avgPrint

	// console.log('Average over size:')
	// const avgTV = calcSeriesAverage(
	// 	series,
	// 	10,
	// 	10,
	// 	getValueOfSeriesItem,
	// 	getTimeOfSeriesItem,
	// 	createSeriesItemInverted,
	// )
	// const avgPrintTV = printAverage(avgTV)
	// avgPrintTV.avg.forEach((entry) => console.log(entry))
	// console.log(avgPrintTV.sum)
	// avgPrintTV.holes.forEach((hole, index) => {
	// 	console.log(`Hole ${index}:`, hole)
	// })
	// data.averageOverSize = avgPrintTV

	// ****************

	data.averageOverTime_50_50 = getSnapshotAverage(
		'time [50/50]',
		series,
		50,
		50,
	).avgPrint

	// console.log('Average over time [50]:')
	// const avgVT50 = calcSeriesAverage(series, 50, 50)
	// const avgPrintVT50 = printAverage(avgVT50)
	// avgPrintVT50.avg.forEach((entry) => console.log(entry))
	// console.log(avgPrintVT50.sum)
	// avgPrintVT50.holes.forEach((hole) => console.log(hole))
	// data.averageOverTime50 = avgPrintVT50

	data.averageOverSize_50_50 = getSnapshotAverage(
		'size [50/50]',
		series,
		50,
		50,
		getValueOfSeriesItem,
		getTimeOfSeriesItem,
		createSeriesItemInverted,
	).avgPrint

	// console.log('Average over size [50]:')
	// const avgTV50 = calcSeriesAverage(
	// 	series,
	// 	50,
	// 	50,
	// 	getValueOfSeriesItem,
	// 	getTimeOfSeriesItem,
	// 	createSeriesItemInverted,
	// )
	// const avgPrintTV50 = printAverage(avgTV50)
	// avgPrintTV50.avg.forEach((entry) => console.log(entry))
	// console.log(avgPrintTV50.sum)
	// avgPrintTV50.holes.forEach((hole, index) => {
	// 	console.log(`Hole ${index}`)
	// 	console.log(hole)
	// })
	// data.averageOverSize50 = avgPrintTV50

	// ****************

	data.averageOverTime_2_2 = getSnapshotAverage(
		'time [2/2]',
		series,
		2,
		2,
	).avgPrint

	data.averageOverSize_2_2 = getSnapshotAverage(
		'size [2/2]',
		series,
		2,
		2,
		getValueOfSeriesItem,
		getTimeOfSeriesItem,
		createSeriesItemInverted,
	).avgPrint

	data.averageSpeedsAtResolution = getSnapshotAverageSpeedsAtResolution(
		seriesConfig,
		series,
		{ w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
	)

	return data
})

fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2))
console.log(`Saved simpler snapshot to ${SNAPSHOT_FILE}`)

const snapshotCanvas = renderSnapshotToCanvas(snapshot)
fs.writeFileSync(SNAPSHOT_IMAGE, snapshotCanvas.toBuffer('image/png'))
console.log(`Saved simpler graph snapshot to ${SNAPSHOT_IMAGE}`)
