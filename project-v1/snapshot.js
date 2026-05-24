const fs = require('fs')
const path = require('path')
const {createCanvas} = require('canvas')
const {createRenderManager} = require('./graph.js')
const {fnSpeedRecorder} = require('./speed-recorder.js')

const CANVAS_WIDTH = 1024 + 512 + 256
const CANVAS_HEIGHT = 0.25 * (1024 - 128)
const TOTAL_SIZE = 256 * 1024 * 1024
const OUTPUT_DIR = path.join(__dirname, 'snapshots')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'graph.png')

function createSeededRandom(seed) {
	let value = seed >>> 0
	return function next() {
		value = (value * 1664525 + 1013904223) >>> 0
		return value / 0x100000000
	}
}

function randBetween(rand, min, max) {
	return rand() * (max - min) + min
}

function generateRecording() {
	const rand = createSeededRandom(0xC0FFEE)
	let timeline = 0
	let progress = 0
	const recorder = fnSpeedRecorder({now: () => timeline})
	recorder.start(TOTAL_SIZE)
	while (progress < TOTAL_SIZE) {
		timeline += Math.round(randBetween(rand, 20, 3020))
		progress = Math.min(TOTAL_SIZE, progress + Math.round(randBetween(rand, 8, 1024 * 1024 + 8)))
		recorder.update(progress)
	}
	return recorder
}

function renderSnapshot() {
	const speedRec = generateRecording()
	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT)
	const renderMgr = createRenderManager({canvas, speedRec})
	const useAvg1s = renderMgr.addAvg(1000)
	useAvg1s()
	renderMgr.start()
	renderMgr.render()
	renderMgr.stop()
	fs.mkdirSync(OUTPUT_DIR, {recursive: true})
	fs.writeFileSync(OUTPUT_FILE, canvas.toBuffer('image/png'))
	console.log(`Saved graph snapshot to ${OUTPUT_FILE}`)
}

renderSnapshot()
