
const fnFallback = (fn, fallback) => fn instanceof Function ? fn : fallback
const isNr = nr => 'number' === typeof nr && !isNaN(nr) && isFinite(nr)
const optNrFn = (v, fallback, ...args) => isNr(v) ? v : fnFallback(v, fallback)(...args)

const defaultGetWidth = ({canvas}) => canvas.width
const defaultGetHeight = ({canvas}) => canvas.height
const defaultInitialMaxSpeed = () => 1
const defaultMaxSpeedMultiple = () => 1024
const defaultMaxLinesCount = () => 7
const defaultVertLinesCount = () => 10

function getSpeedFromAvg([ms, size]) {
	return ms > 0 ? size / (ms * 0.001) : 0
}

function ceilMultipleOf(s, min) {
	return Math.ceil(s / min) * min
}

function getLineEveryMultiple(maxSpeed, min, maxCount) {
	// const startMin = min
	let units = maxSpeed / min
	while (units > maxCount) {
		min += min
		units = maxSpeed / min
	}
	return min
}

function createRenderGraph(opt) {
	let maxSpeed = optNrFn(opt.initialMaxSpeed, defaultInitialMaxSpeed, opt)
	const maxSpeedMultiple = optNrFn(opt.maxSpeedMultiple, defaultMaxSpeedMultiple, opt)
	const maxLinesCount = optNrFn(opt.maxLinesCount, defaultMaxLinesCount, opt)
	const vertLinesCount = optNrFn(opt.vertLinesCount, defaultVertLinesCount, opt)
	let speedLineMultiple = 1
	let speedLineCount = 1
	updateSpeedLines()
	return render
	function updateSpeedLines() {
		speedLineMultiple = getLineEveryMultiple(maxSpeed, maxSpeedMultiple, maxLinesCount)
		speedLineCount = Math.ceil(maxSpeed / speedLineMultiple)
		maxSpeed = speedLineCount * speedLineMultiple
	}
	function render() {
		const ct = opt.canvas.getContext('2d')
		const cw = optNrFn(opt.width, defaultGetWidth, opt)
		const ch = optNrFn(opt.height, defaultGetHeight, opt)
		const sr = opt.speedRec

		const data = sr.getData()
		const size = sr.getSize()
		let sizePrev = 0
		let lastX = 0
		// let maxData = maxSpeed
		data.forEach(a => {
			const aSize = a[1]
			const aInc = aSize - sizePrev
			const x = (cw - 1) * aSize / size
			sizePrev = aSize
			lastX = x
			maxSpeed = Math.max(maxSpeed, aInc)
		})
		// maxData = ceilMultipleOf(maxData, maxSpeedMultiple)
		sizePrev = 0

		updateSpeedLines()
		const lineHeight = (ch - 1) / speedLineCount
		const lineWidth = (cw - 1) / vertLinesCount

		ct.save()
		ct.clearRect(0, 0, cw, ch)
		ct.translate(0.5, 0.5)

		ct.lineWidth = 1
		ct.fillStyle = '#00ff00'
		ct.strokeStyle = '#00e000'
		ct.beginPath()
		ct.rect(0, 0, lastX, ch - 1)
		ct.fill()
		ct.stroke()

		ct.fillStyle = '#00a000'
		ct.strokeStyle = '#008000'

		ct.beginPath()
		ct.moveTo(0, ch - 1)
		data.forEach(a => {
			const aSize = a[1]
			const aInc = aSize - sizePrev
			const x = (cw - 1) * aSize / size
			const y = (ch - 1) - (ch - 1) * aInc / maxSpeed
			sizePrev = aSize
			ct.lineTo(x, y)
		})
		ct.lineTo(lastX, ch - 1)
		ct.closePath()
		ct.fill()
		ct.stroke()

		ct.strokeStyle = '#00000040'
		ct.fillStyle = '#00000040'
		for (let iLine = 0; iLine <= speedLineCount; iLine += 1) {
			const y = (ch - 1) - (iLine * lineHeight)
			ct.beginPath()
			ct.moveTo(0, y)
			ct.lineTo(cw - 1, y)
			ct.stroke()
			ct.textAlign = 'right'
			ct.textBaseline = 'top'
			ct.fillText(bytesSize((iLine + 1) * speedLineMultiple).join(' ').concat('/s'), cw - 5, y - lineHeight + 3)
		}

		for (let iLine = 0; iLine <= vertLinesCount; iLine += 1) {
			const x = iLine * lineWidth
			ct.beginPath()
			ct.moveTo(x, 0)
			ct.lineTo(x, ch - 1)
			ct.stroke()
		}

		ct.restore()
	}
}

function createRenderGraphAvg(opt) {
	let maxSpeed = optNrFn(opt.initialMaxSpeed, defaultInitialMaxSpeed, opt)
	const maxSpeedMultiple = optNrFn(opt.maxSpeedMultiple, defaultMaxSpeedMultiple, opt)
	const maxLinesCount = optNrFn(opt.maxLinesCount, defaultMaxLinesCount, opt)
	const vertLinesCount = optNrFn(opt.vertLinesCount, defaultVertLinesCount, opt)
	const avgList = []
	let speedLineMultiple = 1
	let speedLineCount = 1
	updateSpeedLines()
	return {
		addAvg,
		render,
	}
	function updateSpeedLines() {
		speedLineMultiple = getLineEveryMultiple(maxSpeed, maxSpeedMultiple, maxLinesCount)
		speedLineCount = Math.ceil(maxSpeed / speedLineMultiple)
		maxSpeed = speedLineCount * speedLineMultiple
	}
	function addAvg(avg) {
		const avgLen = avgList.length
		const avgPrev = avgList[avgLen - 1]
		const sr = opt.speedRec
		const last = sr.getLast()
		maxSpeed = Math.max(maxSpeed, avg)
		// maxSpeed = ceilMultipleOf(maxSpeed, maxSpeedMultiple)
		updateSpeedLines()
		if (avgPrev && last[1] < avgPrev[0]) return;
		else if (avgPrev && last[1] == avgPrev[0]) {
			avgList[avgLen - 1][1] = avg
		} else {
			avgList.push([last[1], avg])
		}
	}
	function render() {
		const ct = opt.canvas.getContext('2d')
		const cw = optNrFn(opt.width, defaultGetWidth, opt)
		const ch = optNrFn(opt.height, defaultGetHeight, opt)
		const sr = opt.speedRec
		const size = sr.getSize()

		updateSpeedLines()
		// console.log(`lineMultiple maxSpeed: ${bytesSize(maxSpeed).join(' ')}, multiple ${bytesSize(maxSpeedMultiple).join(' ')}, maxLines ${maxLinesCount}, lineMult ${bytesSize(lineMultiple).join(' ')}, lineCount ${lineCount}`)
		const lineHeight = (ch - 1) / speedLineCount
		const lineWidth = (cw - 1) / vertLinesCount

		let lastX = 0
		avgList.forEach(a => {
			const aSize = a[0]
			const x = (cw - 1) * aSize / size
			lastX = x
		})

		ct.save()
		ct.clearRect(0, 0, cw, ch)
		ct.translate(0.5, 0.5)

		ct.lineWidth = 1
		ct.fillStyle = '#00ff00'
		ct.strokeStyle = '#00e000'
		ct.beginPath()
		ct.rect(0, 0, lastX, ch - 1)
		ct.fill()
		ct.stroke()

		ct.fillStyle = '#00a000'
		ct.strokeStyle = '#008000'

		ct.beginPath()
		ct.moveTo(0, ch - 1)

		avgList.forEach(a => {
			const aSize = a[0]
			const x = (cw - 1) * aSize / size
			const y = (ch - 1) - (ch - 1) * a[1] / maxSpeed
			lastX = x
			ct.lineTo(x, y)
		})
		ct.lineTo(lastX, ch - 1)
		ct.closePath()
		ct.fill()
		ct.stroke()

		ct.strokeStyle = '#00000040'
		ct.fillStyle = '#00000040'
		for (let iLine = 0; iLine <= speedLineCount; iLine += 1) {
			const y = (ch - 1) - (iLine * lineHeight)
			ct.beginPath()
			ct.moveTo(0, y)
			ct.lineTo(cw - 1, y)
			ct.stroke()
			ct.textAlign = 'right'
			ct.textBaseline = 'top'
			ct.fillText(bytesSize((iLine + 1) * speedLineMultiple).join(' ').concat('/s'), cw - 5, y - lineHeight + 3)
		}

		for (let iLine = 0; iLine <= vertLinesCount; iLine += 1) {
			const x = iLine * lineWidth
			ct.beginPath()
			ct.moveTo(x, 0)
			ct.lineTo(x, ch - 1)
			ct.stroke()
		}

		ct.restore()
	}
}

function createRenderManager(opt) {
	let renderCurrent = undefined
	const avgTimeList = []
	const avgAddFnList = []
	let ivAvgUpdate = undefined
	return {
		render,
		addRaw,
		addAvg,
		start,
		stop,
	}
	function render() {
		renderCurrent() // the var might change
	}
	function addRaw () {
		const render = createRenderGraph(opt)
		return () => { renderCurrent = render }
	}
	function addAvg (avgTime) {
		const {addAvg: _addAvg, render} = createRenderGraphAvg(opt)
		avgTimeList.push(avgTime)
		avgAddFnList.push(_addAvg)
		return () => { renderCurrent = render }
	}
	function start() {
		stop()
		ivAvgUpdate = setInterval(avgUpdate, opt.avgRefresh || 1000)
		avgUpdate()
	}
	function stop() {
		if (ivAvgUpdate) {
			ivAvgUpdate = void clearInterval(ivAvgUpdate)
		}
	}
	function avgUpdate() {
		const sr = opt.speedRec
		if (sr.isFinished()) {
			stop()
			return
		}
		const avgCount = avgTimeList.length
		const avg = sr.getLastMsAvg(avgTimeList)
		for (let i = 0; i < avgCount; i++) {
			avgAddFnList[i](getSpeedFromAvg(avg[i]))
		}
	}
}
