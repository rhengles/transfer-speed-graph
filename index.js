
const htmlMount = document.querySelector('.controls')
const divStart = document.createElement('div')
const btStart = document.createElement('button')
const divCanvas = document.createElement('div')
const divSelector = document.createElement('div')
btStart.appendChild(document.createTextNode('start'))
divStart.appendChild(btStart)
htmlMount.appendChild(divStart)
htmlMount.appendChild(divCanvas)
htmlMount.appendChild(divSelector)

const cv = addCanvas('Gráfico')
// const cvAvg1 = addCanvas('Velocidade média em 1s')
// const cvAvg5 = addCanvas('Velocidade média em 5s')
// const cvAvg15 = addCanvas('Velocidade média em 15s')

function addCanvas(label) {
	const div = document.createElement('div')
	const cv = document.createElement('canvas')
	setText(div, label)
	cv.width = (1024 + 512 + 256)
	cv.height = 0.25 * (1024 - 128)
	// const ct = cv.getContext('2d')
	divCanvas.appendChild(div)
	divCanvas.appendChild(cv)
	return cv
}

function addGraphSelector(label, value, onClick, checked = false) {
	const lb = document.createElement('label')
	const radio = document.createElement('input')
	radio.type = 'radio'
	radio.name = 'graph-type'
	radio.value = value
	radio.checked = checked
	lb.appendChild(radio)
	lb.appendChild(document.createTextNode(` ${label} `))
	radio.addEventListener('click', onClick, false)
	divSelector.appendChild(lb)
}

function setText(el, text) {
	let tnode = undefined
	let tc = el.childNodes.length
	for (let i = 0; i < tc; i++) {
		const n = el.childNodes[i]
		if (!tnode && n.nodeType === Element.TEXT_NODE) {
			tnode = n
		} else {
			el.removeChild(n), i--, tc--
		}
	}
	if (tnode) {
		tnode.nodeValue = text
	} else {
		el.appendChild(document.createTextNode(text))
	}
}

function fnSpeedRecorder() {
	let data = undefined
	let tStart = undefined
	let tEnd = undefined
	let size = undefined
	let last = undefined
	return {
		start,
		update,
		getData,
		getLast,
		getSize,
		isFinished,
		getStartTime,
		getEndTime,
		getLastMsAvg,
	}
	function start(s) {
		data = []
		tEnd = tStart = Date.now()
		size = s
		data.push([tStart, 0])
	}
	function update(pos) {
		tEnd = Date.now()
		last = Math.min(pos, size)
		data.push([tEnd, last])
	}
	function getData() {
		return data
	}
	function getLast() {
		const dataLen = data.length
		const dataLast = dataLen ? data[dataLen - 1] : undefined
		return dataLen ? [dataLast[0] - tStart, dataLast[1]] : [0, 0]
	}
	function getSize() {
		return size
	}
	function isFinished() {
		return last === size
	}
	function getStartTime() {
		return tStart
	}
	function getEndTime() {
		return tEnd
	}
	function getLastMsAvg(msList) {
		const dataLen = data.length
		const dataLast = dataLen ? data[dataLen - 1] : undefined
		const now = isFinished() ? dataLen ? dataLast[0] : Date.now() : Date.now()
		const msQueue = msList.map((ms, index) => [index, ms])
		const resList = msList.map(() => [0, 0])
		let msCount = msQueue.length
		let dataAfter = undefined
		for (let i = dataLen; i && msCount; i--) {
			const dataItem = data[i - 1]
			const t = dataItem[0]
			const p = dataItem[1]
			const d = now - t
			let anyInside = false
			for (let j = 0; j < msCount; j++) {
				const [mj, ms] = msQueue[j]
				if (d <= ms) {
					resList[mj] = [d, dataLast[1] - p]
					anyInside = true
					if (!(resList[mj][0] >= 0 && resList[mj][1] >= 0)) {
						throw new Error(`o tempo ou o tamanho são negativos`)
					}
				} else if (dataAfter) {
					const tAfter = dataAfter[0]
					const pAfter = dataAfter[1]
					const dAfter = now - tAfter

					const tInside = Math.max(0, ms - dAfter) // kind of a hack
					if (!(tInside >= 0)) {
						throw new Error(`a parte dentro do intervalo entre 2 pontos é negativa`)
					}

					const pDiff = pAfter - p
					const tInsideFactor = tInside / (tAfter - t)
					const [tRes, pRes] = resList[mj]
					resList[mj] = [
						tRes + tInside,
						pRes + (tInsideFactor * pDiff)
					]
					msQueue.splice(j, 1)
					msCount -= 1
					if (!(resList[mj][0] >= 0 && resList[mj][1] >= 0)) {
						throw new Error(`o tempo ou o tamanho são negativos`)
					}
				} else {
					anyInside = true
				}
			}
			if (!anyInside) break
			dataAfter = dataItem
		}
		return resList
	}
}

function getRand(min, max) {
	const d = max - min
	return Math.random() * d + min
}

function createTableRow(index) {
	const tr = document.createElement('tr')
	const addCol = () => {
		const td = document.createElement('td')
		tr.appendChild(td)
		return td
	}
	const setSpeed = (td, avg) => {
		setText(td, bytesSize(getSpeedFromAvg(avg)).join(' ').concat('/s'))
	}
	const tdIndex = addCol()
	setText(tdIndex, index)
	const tdEllapsed = addCol()
	const tdProgress = addCol()
	const tdAvg = addCol()
	const tdAvg1min = addCol()
	const tdAvg15s = addCol()
	const tdAvg5s = addCol()
	const tdAvg1s = addCol()
	const update = (ellapsed, progress, avgList) => {
		// console.log(`table`, ellapsed, progress, avgList)
		setText(tdEllapsed, printTime(ellapsed))
		setText(tdProgress, bytesSize(progress).join(' '))
		setSpeed(tdAvg, avgList[0])
		setSpeed(tdAvg1min, avgList[1])
		setSpeed(tdAvg15s, avgList[2])
		setSpeed(tdAvg5s, avgList[3])
		setSpeed(tdAvg1s, avgList[4])
	}
	const setActive = a => {
		const cname = 'row-active'
		if (a) {
			tr.classList.add(cname)
		} else {
			tr.classList.remove(cname)
		}
	}
	return {
		tr,
		update,
		setActive,
	}
}

function createRowManager(tbody, rowCount) {
	if (0 <= rowCount && rowCount <= 100) {
		const rowsUpdate = []
		const rowsSetActive = []
		let index = 0
		for (let i = 0; i < rowCount; i++) {
			const {tr, update, setActive} = createTableRow(i + 1)
			tbody.appendChild(tr)
			rowsUpdate.push(update)
			rowsSetActive.push(setActive)
		}
		return update
		function update(ellapsed, progress, avgList) {
			rowsUpdate[index](ellapsed, progress, avgList)
			for (let i = 0; i < rowCount; i++) {
				rowsSetActive[i](i === index)
			}
			index = (index + 1) % rowCount
		}
	}
	throw new Error(`invalid row count: ${typeof rowCount} ${JSON.stringify(rowCount)}`)
}

function start() {
	if (!isStarted()) {
		paused = false
		speedRec.start(totalSize)
		resume()
	} else if (paused) {
		resume()
	} else {
		pause()
	}
}
function isStarted() {
	return Boolean(speedRec.getData()?.length)
}
function pause() {
	paused = true
	renderMgr.stop()
}
function resume() {
	paused = false
	renderMgr.start()
	render()
	randIncNext()
}
function render() {
	if (paused) return;
	const last = speedRec.getLast()
	const s = 1000
	const avg = speedRec.getLastMsAvg([Infinity, 60*s, 15*s, 5*s, 1*s])
	rowUpdate(last[0], last[1], avg)
	renderMgr.render()
	// renderGraph()
	// renderGraphAvg.addAvg(getSpeedFromAvg(avg[4]))
	// renderGraphAvg.render()
	// renderGraphAvg5.addAvg(getSpeedFromAvg(avg[3]))
	// renderGraphAvg5.render()
	// renderGraphAvg15.addAvg(getSpeedFromAvg(avg[2]))
	// renderGraphAvg15.render()

	if (!speedRec.isFinished()) {
		// raf(render)
		setTimeout(render, 1000)
	}
}
function randInc(time) {
	if (paused) return;
	const size = randSizeInc()
	transfPos = Math.min(totalSize, transfPos + size)
	// console.log(`progress`, Number(transfPos/totalSize).toFixed(3), transfPos, size, time)
	speedRec.update(transfPos)
	if (speedRec.isFinished()) {

	} else {
		randIncNext()
	}
}
function randIncNext() {
	if (speedRec.isFinished()) return;
	const nFrame = randFrame()
	const next = () => randInc(nFrame)
	ivRender = setTimeout(next, nFrame)
}
function wrapUseRender(use) {
	return function() {
		use()
		if (isStarted()) renderMgr.render()
	}
}

const minFrame = 20
const maxFrame = 3020
const minFrameRepeatCount = 1
const maxFrameRepeatCount = 6
let frameRepeatIndex = 1
let frameRepeatCurrent = 1
let frameCurrent = minFrame
const randFrame = () => {
	if (frameRepeatIndex < frameRepeatCurrent) {
		frameRepeatIndex += 1
	} else {
		frameCurrent = getRand(minFrame, maxFrame)
		frameRepeatIndex = 0
		frameRepeatCurrent = getRand(minFrameRepeatCount, maxFrameRepeatCount)
	}
	return frameCurrent
}

const minSizeInc = 8
const maxSizeInc = 1024 * 1024 + 8
const randSizeInc = () => getRand(minSizeInc, maxSizeInc)

const tbody = document.querySelector('table tbody')

const speedRec = fnSpeedRecorder()
const rowUpdate = createRowManager(tbody, 100)
let ivRender = undefined
let paused = false
const totalSize = 256 * 1024 * 1024
const raf = window.requestAnimationFrame
let transfPos = 0
let rowIndex = 0
// const rowCount = 20
// const renderGraph = createRenderGraph(cv, speedRec, 1024 * 1024)
// const renderGraphAvg = createRenderGraphAvg(cvAvg1, speedRec, 1024 * 1024)
// const renderGraphAvg5 = createRenderGraphAvg(cvAvg5, speedRec, 1024 * 1024)
// const renderGraphAvg15 = createRenderGraphAvg(cvAvg15, speedRec, 1024 * 1024)
const renderMgr = createRenderManager({
	canvas: cv,
	speedRec,
	// initialMaxSpeed: 1024 * 1024,
})
const useRenderRaw = wrapUseRender(renderMgr.addRaw())
const useRenderAvg1s = wrapUseRender(renderMgr.addAvg(1000))
const useRenderAvg3s = wrapUseRender(renderMgr.addAvg(3 * 1000))
const useRenderAvg5s = wrapUseRender(renderMgr.addAvg(5 * 1000))
const useRenderAvg10s = wrapUseRender(renderMgr.addAvg(10 * 1000))
const useRenderAvg15s = wrapUseRender(renderMgr.addAvg(15 * 1000))
const useRenderAvg30s = wrapUseRender(renderMgr.addAvg(30 * 1000))
const useRenderAvg45s = wrapUseRender(renderMgr.addAvg(45 * 1000))
const useRenderAvg60s = wrapUseRender(renderMgr.addAvg(60 * 1000))
const useRenderAvgInf = wrapUseRender(renderMgr.addAvg(Infinity))
useRenderAvg1s()
addGraphSelector('Raw data', 'raw', useRenderRaw)
addGraphSelector('Avg 1s', '1', useRenderAvg1s, true)
addGraphSelector('Avg 3s', '3', useRenderAvg3s)
addGraphSelector('Avg 5s', '5', useRenderAvg5s)
addGraphSelector('Avg 10s', '10', useRenderAvg10s)
addGraphSelector('Avg 15s', '15', useRenderAvg15s)
addGraphSelector('Avg 30s', '30', useRenderAvg30s)
addGraphSelector('Avg 45s', '45', useRenderAvg45s)
addGraphSelector('Avg 60s', '60', useRenderAvg60s)
addGraphSelector('Avg total', 'avg', useRenderAvgInf)

btStart.addEventListener('click', start, false)
