import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	randSeries,
	randSegment,
	getValueOfSeriesItem,
	getTimeOfSeriesItem,
	createSeriesItemInverted,
	calcSeriesAverage,
	calcSeriesSpeedsAtEachInterval,
	SERIES_TIME_UNIT,
	convertSeriesAccumulatedToDeltas,
} from './core/speed-series.js'
import {
	printSegment,
	printSeries,
	printAverage,
} from './test-utils/print-series.js'
import {
	buildDeterministicTransferSeries,
	clampSeriesIndex,
	createSeededRandom,
} from './fake/series.js'
import { TRANSFER_UI_DEFAULTS } from './fake/progress-source.js'
import { calcAverageSpeedsForResolution, renderTransferGraphFrame } from './core/frame.js'
import { createCanvas } from 'canvas'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 120
const SNAPSHOT_DIR = path.join(__dirname, 'snapshots')
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'simpler.json')
const SNAPSHOT_IMAGE = path.join(SNAPSHOT_DIR, 'simpler.png')
const SNAPSHOT_PROGRESS_TR_HIGH_IMAGE = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-high.png')
const SNAPSHOT_PROGRESS_TR_HIGH_IMAGE_PAW4 = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-high-paw4.png')
const SNAPSHOT_PROGRESS_TR_HIGH_IMAGE_SERIES_16 = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-high-series16.png')
const SNAPSHOT_PROGRESS_TR_LOW_IMAGE = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-low.png')
const SNAPSHOT_PROGRESS_TR_LOW_IMAGE_PAW4 = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-low-paw4.png')
const SNAPSHOT_PROGRESS_TR_LOW_IMAGE_SERIES_16 = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-low-series16.png')
const SNAPSHOT_PROGRESS_TR_NONE_IMAGE = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-none.png')
const SNAPSHOT_PROGRESS_TR_NONE_IMAGE_PAW4 = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-none-paw4.png')
const SNAPSHOT_PROGRESS_TR_NONE_IMAGE_SERIES_16 = path.join(SNAPSHOT_DIR, 'simpler-progress-5pct-time-random-none-series16.png')
const RNG_SEED = 0xC0FFEE

const UI_TOTAL_SIZE = TRANSFER_UI_DEFAULTS.totalSize
const UI_SERIES_COUNT = TRANSFER_UI_DEFAULTS.seriesCount

const transferSimulationTimeRandomLow = {
  minFrame: 520,
  maxFrame: 1020,
}

const transferSimulationTimeRandomNone = {
  minFrame: 1020,
  maxFrame: 1020,
}

function parseSeriesIndex(value) {
	if (value === undefined || value === null || value === '') return undefined
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return undefined
	return Math.floor(parsed)
}

function resolveUiSeriesIndex(seriesCount) {
	const cliArg = process.argv.find((entry) => /^--series-index=/.test(entry))
	const cliValue = cliArg ? cliArg.split('=').slice(1).join('=') : undefined
	const envValue = process.env.UI_SERIES_INDEX
	const requested = parseSeriesIndex(cliValue)
		?? parseSeriesIndex(envValue)
		?? 0
	return clampSeriesIndex(requested, seriesCount, false)
}

function pickSeriesIndexesByProgress(series, maxValue, progressList) {
	return progressList.map(progress => {
		const targetValue = maxValue * progress
		for (let index = 0, count = series.length; index < count; index++) {
			if (series[index][1] >= targetValue) {
				return index
			}
		}
		return series.length - 1
	})
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
			seriesConfig.maxValue,
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
	const canvasCtx = canvas.getContext('2d')
	let runningMaxSpeed = 0

	snapshot.series.forEach((_, index) => {
		const offsetY = index * CANVAS_HEIGHT
		const stepList = snapshot.series.slice(0, index + 1)

		canvasCtx.save()
		canvasCtx.translate(0, offsetY)
		runningMaxSpeed = renderTransferGraphFrame({
			maxValue: snapshot.seriesConfig.maxValue,
			series: stepList,
			canvasCtx,
			size: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
			runningMaxSpeed,
			graphOptions: { maxSpeedDecay: 0.965, maxSpeedHeadroom: 1.06, pixelAverageWindow: 1 },
			renderOptions: { pixelAverageWindow: 1 },
		}).runningMaxSpeed
		canvasCtx.restore()
	})

	return canvas
}

function renderProgressMilestoneSnapshotToCanvas(seriesConfig, series, progressList, renderOptions) {
	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT * progressList.length)
	const canvasCtx = canvas.getContext('2d')
	const milestoneIndexes = pickSeriesIndexesByProgress(series, seriesConfig.maxValue, progressList)

	milestoneIndexes.forEach((stepIndex, rowIndex) => {
		const offsetY = rowIndex * CANVAS_HEIGHT
		const stepList = series.slice(0, stepIndex + 1)
		const progressPct = Math.round(progressList[rowIndex] * 100)

		canvasCtx.save()
		canvasCtx.translate(0, offsetY)
		renderTransferGraphFrame({
			maxValue: seriesConfig.maxValue,
			series: stepList,
			canvasCtx,
			size: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
			runningMaxSpeed: 0,
			manageMaxSpeed: false,
			renderOptions: {
				pixelAverageWindow: 1,
				...renderOptions,
				speedLabel: `${progressPct}%`,
				backgroundValue: progressPct >= 100 ? seriesConfig.maxValue : undefined,
			},
		})
		canvasCtx.restore()
	})

	return { canvas, milestoneIndexes }
}

function createDeterministicUiProgressSnapshot(seriesOptions, progressMilestones, {label, renderOptions}) {
	const deterministicUi = buildDeterministicTransferSeries({
		...seriesOptions,
		totalSize: UI_TOTAL_SIZE,
		deterministicSeed: RNG_SEED,
		seriesCount: UI_SERIES_COUNT,
	})
	console.log(`Using UI ${label} index ${deterministicUi.selectedSeriesIndex + 1}/${UI_SERIES_COUNT}`)
	const progressSnapshot = renderProgressMilestoneSnapshotToCanvas(
		deterministicUi.config,
		deterministicUi.series,
		progressMilestones,
		renderOptions,
	)
	return { deterministicUi, progressSnapshot }
}

let progressMilestoneCanvasTrHigh = null
let progressMilestoneCanvasTrHighPaw4 = null
let progressMilestoneCanvasTrHighSeries16 = null
let progressMilestoneCanvasTrLow = null
let progressMilestoneCanvasTrLowPaw4 = null
let progressMilestoneCanvasTrLowSeries16 = null
let progressMilestoneCanvasTrNone = null
let progressMilestoneCanvasTrNonePaw4 = null
let progressMilestoneCanvasTrNoneSeries16 = null

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

	const progressMilestones = Array.from({ length: 20 }, (_, index) => (index + 1) * 0.05)

	data.progressMilestones = progressMilestones
	data.deterministicUiSeriesCount = UI_SERIES_COUNT
	// data.deterministicUiSeries = deterministicUi.series

	const {
		deterministicUi,
		progressSnapshot,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: resolveUiSeriesIndex(UI_SERIES_COUNT),
	}, progressMilestones, {
		label: 'time random high',
	})

	data.trHighSeries1 = {
		series: deterministicUi.series,
		seriesIndex: deterministicUi.selectedSeriesIndex,
		milestoneIndexes: progressSnapshot.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_HIGH_IMAGE),
	}
	// data.deterministicUiSeriesIndex = deterministicUi.selectedSeriesIndex
	// data.progressMilestoneIndexes = progressSnapshot.milestoneIndexes
	// data.progressMilestoneImage = path.basename(SNAPSHOT_PROGRESS_IMAGE)

	const {
		deterministicUi: deterministicUiPaw4,
		progressSnapshot: progressSnapshotPaw4,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: resolveUiSeriesIndex(UI_SERIES_COUNT),
	}, progressMilestones, {
		label: 'time random high',
		renderOptions: {
			pixelAverageWindow: 4,
		},
	})

	data.trHighSeries1Paw4 = {
		series: deterministicUiPaw4.series,
		seriesIndex: deterministicUiPaw4.selectedSeriesIndex,
		milestoneIndexes: progressSnapshotPaw4.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_HIGH_IMAGE_PAW4),
	}

	const {
		deterministicUi: deterministicUiSeries16,
		progressSnapshot: progressSnapshotSeries16,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: UI_SERIES_COUNT - 1,
	}, progressMilestones, {
		label: 'time random high',
	})

	data.trHighSeries16 = {
		seriesIndex: deterministicUiSeries16.selectedSeriesIndex,
		milestoneIndexes: progressSnapshotSeries16.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_HIGH_IMAGE_SERIES_16),
	}
	// data.deterministicUiSeries16Index = deterministicUiSeries16.selectedSeriesIndex
	// data.progressMilestoneSeries16Indexes = progressSnapshotSeries16.milestoneIndexes
	// data.progressMilestoneSeries16Image = path.basename(SNAPSHOT_PROGRESS_IMAGE_SERIES_16)

	const {
		deterministicUi: deterministicUiTrLow,
		progressSnapshot: progressSnapshotTrLow,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: resolveUiSeriesIndex(UI_SERIES_COUNT),
		...transferSimulationTimeRandomLow,
	}, progressMilestones, {
		label: 'time random low',
	})

	data.trLowSeries1Paw4 = {
		seriesIndex: deterministicUiTrLow.selectedSeriesIndex,
		milestoneIndexes: progressSnapshotTrLow.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_LOW_IMAGE),
	}

	const {
		deterministicUi: deterministicUiTrLowPaw4,
		progressSnapshot: progressSnapshotTrLowPaw4,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: resolveUiSeriesIndex(UI_SERIES_COUNT),
		...transferSimulationTimeRandomLow,
	}, progressMilestones, {
		label: 'time random low',
		renderOptions: {
			pixelAverageWindow: 4,
		},
	})

	data.trLowSeries1Paw4 = {
		seriesIndex: deterministicUiTrLowPaw4.selectedSeriesIndex,
		milestoneIndexes: progressSnapshotTrLowPaw4.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_LOW_IMAGE_PAW4),
	}

	const {
		deterministicUi: deterministicUiTrLowSeries16,
		progressSnapshot: progressSnapshotTrLowSeries16,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: UI_SERIES_COUNT - 1,
		...transferSimulationTimeRandomLow,
	}, progressMilestones, {
		label: 'time random low',
	})

	data.trLowSeries16 = {
		seriesIndex: deterministicUiTrLowSeries16.selectedSeriesIndex,
		milestoneIndexes: progressSnapshotTrLowSeries16.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_LOW_IMAGE_SERIES_16),
	}

	const {
		deterministicUi: deterministicUiTrNone,
		progressSnapshot: progressSnapshotTrNone,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: resolveUiSeriesIndex(UI_SERIES_COUNT),
		...transferSimulationTimeRandomNone,
	}, progressMilestones, {
		label: 'time random none',
	})

	data.trNoneSeries1 = {
		seriesIndex: deterministicUiTrNone.selectedSeriesIndex,
		milestoneIndexes: progressSnapshotTrNone.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_NONE_IMAGE),
	}

	const {
		deterministicUi: deterministicUiTrNonePaw4,
		progressSnapshot: progressSnapshotTrNonePaw4,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: resolveUiSeriesIndex(UI_SERIES_COUNT),
		...transferSimulationTimeRandomNone,
	}, progressMilestones, {
		label: 'time random none',
		renderOptions: {
			pixelAverageWindow: 4,
		},
	})

	data.trNoneSeries1Paw4 = {
		seriesIndex: deterministicUiTrNonePaw4.selectedSeriesIndex,
		milestoneIndexes: progressSnapshotTrNonePaw4.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_NONE_IMAGE_PAW4),
	}

	const {
		deterministicUi: deterministicUiTrNoneSeries16,
		progressSnapshot: progressSnapshotTrNoneSeries16,
	} = createDeterministicUiProgressSnapshot({
		seriesIndex: UI_SERIES_COUNT - 1,
		...transferSimulationTimeRandomNone,
	}, progressMilestones, {
		label: 'time random none',
	})

	data.trNoneSeries16 = {
		seriesIndex: deterministicUiTrNoneSeries16.selectedSeriesIndex,
		milestoneIndexes: progressSnapshotTrNoneSeries16.milestoneIndexes,
		milestoneImage: path.basename(SNAPSHOT_PROGRESS_TR_NONE_IMAGE_SERIES_16),
	}

	progressMilestoneCanvasTrHigh = progressSnapshot.canvas
	progressMilestoneCanvasTrHighPaw4 = progressSnapshotPaw4.canvas
	progressMilestoneCanvasTrHighSeries16 = progressSnapshotSeries16.canvas
	progressMilestoneCanvasTrLow = progressSnapshotTrLow.canvas
	progressMilestoneCanvasTrLowPaw4 = progressSnapshotTrLowPaw4.canvas
	progressMilestoneCanvasTrLowSeries16 = progressSnapshotTrLowSeries16.canvas
	progressMilestoneCanvasTrNone = progressSnapshotTrNone.canvas
	progressMilestoneCanvasTrNonePaw4 = progressSnapshotTrNonePaw4.canvas
	progressMilestoneCanvasTrNoneSeries16 = progressSnapshotTrNoneSeries16.canvas

	return data
})

fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2))
console.log(`Saved simpler snapshot to ${SNAPSHOT_FILE}`)

const snapshotCanvas = renderSnapshotToCanvas(snapshot)
fs.writeFileSync(SNAPSHOT_IMAGE, snapshotCanvas.toBuffer('image/png'))
console.log(`Saved simpler graph snapshot to ${SNAPSHOT_IMAGE}`)

if (progressMilestoneCanvasTrHigh) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_HIGH_IMAGE, progressMilestoneCanvasTrHigh.toBuffer('image/png'))
	console.log(`Saved time random high snapshot to ${SNAPSHOT_PROGRESS_TR_HIGH_IMAGE}`)
}

if (progressMilestoneCanvasTrHighPaw4) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_HIGH_IMAGE_PAW4, progressMilestoneCanvasTrHighPaw4.toBuffer('image/png'))
	console.log(`Saved time random high snapshot (PAW4) to ${SNAPSHOT_PROGRESS_TR_HIGH_IMAGE_PAW4}`)
}

if (progressMilestoneCanvasTrHighSeries16) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_HIGH_IMAGE_SERIES_16, progressMilestoneCanvasTrHighSeries16.toBuffer('image/png'))
	console.log(`Saved time random high snapshot (series 16/16) to ${SNAPSHOT_PROGRESS_TR_HIGH_IMAGE_SERIES_16}`)
}

if (progressMilestoneCanvasTrLow) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_LOW_IMAGE, progressMilestoneCanvasTrLow.toBuffer('image/png'))
	console.log(`Saved time random low snapshot to ${SNAPSHOT_PROGRESS_TR_LOW_IMAGE}`)
}

if (progressMilestoneCanvasTrLowPaw4) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_LOW_IMAGE_PAW4, progressMilestoneCanvasTrLowPaw4.toBuffer('image/png'))
	console.log(`Saved time random low snapshot (PAW4) to ${SNAPSHOT_PROGRESS_TR_LOW_IMAGE_PAW4}`)
}

if (progressMilestoneCanvasTrLowSeries16) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_LOW_IMAGE_SERIES_16, progressMilestoneCanvasTrLowSeries16.toBuffer('image/png'))
	console.log(`Saved time random low snapshot (series 16/16) to ${SNAPSHOT_PROGRESS_TR_LOW_IMAGE_SERIES_16}`)
}

if (progressMilestoneCanvasTrNone) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_NONE_IMAGE, progressMilestoneCanvasTrNone.toBuffer('image/png'))
	console.log(`Saved time random none snapshot to ${SNAPSHOT_PROGRESS_TR_NONE_IMAGE}`)
}

if (progressMilestoneCanvasTrNonePaw4) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_NONE_IMAGE_PAW4, progressMilestoneCanvasTrNonePaw4.toBuffer('image/png'))
	console.log(`Saved time random none snapshot (PAW4) to ${SNAPSHOT_PROGRESS_TR_NONE_IMAGE_PAW4}`)
}

if (progressMilestoneCanvasTrNoneSeries16) {
	fs.writeFileSync(SNAPSHOT_PROGRESS_TR_NONE_IMAGE_SERIES_16, progressMilestoneCanvasTrNoneSeries16.toBuffer('image/png'))
	console.log(`Saved time random none snapshot (series 16/16) to ${SNAPSHOT_PROGRESS_TR_NONE_IMAGE_SERIES_16}`)
}
