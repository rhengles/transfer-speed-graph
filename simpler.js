function rand(min, max) {
	return Math.random() * (max - min) + min;
}

const numSort = (a, b) => a - b;

function randSeries(config) {
	const {minCount, maxCount, minTime, maxTime, minValue, maxValue} = config;
	const count = rand(minCount, maxCount);
	const times = [];
	const values = [];
	const series = [];
	for (let i = 0; i < count; i++) {
		times.push(Math.round(rand(minTime, maxTime)));
		values.push(Math.round(rand(minValue, maxValue)));
	}
	times.sort(numSort);
	values.sort(numSort);
	for (let i = 0; i < count; i++) {
		series.push([times[i], values[i]]);
	}
	series.unshift([minTime, minValue]);
	series.push([maxTime, maxValue]);
	return {config, series};
}

function getTimeOfSeriesItem(item) {
	return item[0];
}

function getValueOfSeriesItem(item) {
	return item[1];
}

function getSpeedOfSeriesItem(item) {
	return item[2];
}

function createSeriesItem(time, value) {
	return [time, value];
}

function createSeriesItemInverted(time, value) {
	return [value, time];
}

function reduceValueLesser(item1, item2, gv = getValueOfSeriesItem) {
	const v1 = gv(item1);
	const v2 = gv(item2);
	return v2 < v1 ? item2 : item1;
}

function reduceValueGreater(item1, item2, gv = getValueOfSeriesItem) {
	const v1 = gv(item1);
	const v2 = gv(item2);
	return v2 > v1 ? item2 : item1;
}

function getSegment(
	series,
	minTime,
	maxTime,
	gt = getTimeOfSeriesItem,
	gv = getValueOfSeriesItem,
	reduceBefore = reduceValueGreater,
	reduceFirst = reduceValueGreater,
	reduceLast = reduceValueGreater,
	reduceAfter = reduceValueGreater
) {
	let before = undefined;
	let after = undefined;
	let first = undefined;
	let last = undefined;
	const inside = [];
	const count = series.length;
	for (let i = 0; i < count; i++) {
		const item = series[i];
		const gtItem = gt(item);
		if (gtItem < minTime) {
			const gtBefore = before && gt(before);
			const gtBeforeEqual = gtBefore === gtItem
			if (!before || gtItem >= gtBefore) {
				before = gtBeforeEqual
					? reduceBefore(item, before, gv)
					: item;
			}
		}
		if (gtItem >= minTime && gtItem <= maxTime) {
			inside.push(item);
			const gtFirst = first && gt(first);
			const gtFirstEqual = gtFirst === gtItem;
			if (!first || gtFirstEqual) {
				first = gtFirstEqual
					? reduceFirst(item, first, gv)
					: item;
				if (gt(first) == minTime) {
					before = undefined;
				}
			}
			const gtLast = last && gt(last);
			const gtLastEqual = gtLast === gtItem;
			last = gtLastEqual
				? reduceLast(item, last, gv)
				: item;
		}
		if (gtItem > maxTime) {
			const gtAfter = after && gt(after);
			const gtAfterEqual = gtAfter === gtItem;
			if (!after || gtAfterEqual) {
				//  || gtItem == gtAfter
				if (!last || gt(last) < maxTime) {
					//   after = item;
					after = gtAfterEqual
						? reduceAfter(item, after, gv)
						: item;
				}
			} else if (gtItem > gtAfter) {
				break;
			}
		}
	}
	return {
		before,
		first,
		inside,
		last,
		after,
	};
}

function calcItemBetween(
	cut,
	before,
	after,
	gt = getTimeOfSeriesItem,
	gv = getValueOfSeriesItem,
	ci = createSeriesItem
) {
	if (before && after) {
		const tStart = gt(before);
		const tEnd = gt(after);
		const tDuration = tEnd - tStart;
		const fracFirst = (cut - tStart) / tDuration;
		const vStart = gv(before);
		const vEnd = gv(after);
		const vDuration = vEnd - vStart;
		return ci(cut, fracFirst * vDuration + vStart);
	} else if (before) {
		return ci(cut, gv(before));
	} else if (after) {
		return ci(cut, gv(after));
	} else {
		throw new Error(`Cannot calculate value between without before or after`);
	}
}

function getSegmentCutAndSum(
	segment,
	start,
	end,
	gt = getTimeOfSeriesItem,
	gv = getValueOfSeriesItem,
	ci = createSeriesItem
) {
	const { before, first, last, after } = segment;
	const cutBefore = first
		? calcItemBetween(start, before, first, gt, gv, ci)
		: before && after
		? calcItemBetween(start, before, after, gt, gv, ci)
		: undefined;
	const cutAfter = last
		? calcItemBetween(end, last, after, gt, gv, ci) // dont break line
		: before && after
		? calcItemBetween(end, before, after, gt, gv, ci)
		: undefined;
	const time = cutBefore && cutAfter ? gt(cutAfter) - gt(cutBefore) : 0;
	const value = cutBefore && cutAfter ? gv(cutAfter) - gv(cutBefore) : 0;
	const sum = cutBefore && cutAfter ? ci(time, value) : undefined;
	return {
		cutBefore,
		cutBeforeSimul: !first,
		cutAfter,
		cutAfterSimul: !last,
		sum,
	};
}

function getSegmentCutAndSumFromSeries(series, start, end, gt, gv, ci, rb, rf, rl, ra) {
	const length = end - start;
	const meta = {
		start,
		length,
		end,
	};
	const segment = getSegment(series, start, end, gt, gv, rb, rf, rl, ra);
	const cut = getSegmentCutAndSum(segment, start, end, gt, gv, ci);
	return { meta, segment, cut };
}

function csAvgGetSumFromCut(cut) {
	return cut.cut.sum;
}

function csAvgGetFullInfoFromCut(cut, cutPrev) {
	return { cut, cutPrev };
}

function convertSeriesAccumulatedToDeltas(series) {
	const seriesDeltas = []
	for (let i = 0, c = series.length; i < c; i++) {
		const accumulatedStep = series[i]
		const [time0, value0] = series[i - 1] || [0, 0]
		const [time1, value1] = accumulatedStep
		const dt = time1 - time0
		const dv = value1 - value0
		const deltaStep = [...accumulatedStep]
		deltaStep[0] = dt
		deltaStep[1] = dv
		seriesDeltas.push(deltaStep)
	}
	return seriesDeltas
}

function calcSeriesSpeedsAverageAccumulated(series) {
	const seriesWithSpeeds = [
		// [...series[0], 0],
	]
	for (let i = 0, c = series.length; i < c; i++) {
		// const [time0, value0] = series[i - 1]
		const [time, value] = series[i]
		// const dt = time1 - time0
		// const dv = Math.abs(value1 - value0)
		// const speed = dt ? dv / dt : 0
		const speed = time ? value / time : 0
		seriesWithSpeeds.push([time, value, speed])
	}
	return seriesWithSpeeds
}

const SERIES_TIME_UNIT = {
	ACCUMULATED: 1,
	INTERVAL: 2,
}
function calcSeriesSpeedsAtEachInterval(series, mode = SERIES_TIME_UNIT.ACCUMULATED) {
	const seriesWithSpeeds = [
		// [...series[0], 0],
	]
	for (let i = 0, c = series.length; i < c; i++) {
		const [time0, value0] = series[i - 1] || [0, 0]
		const [time1, value1] = series[i]
		const dt = mode === SERIES_TIME_UNIT.ACCUMULATED
			? time1 - time0
			: time1
		const dv = mode === SERIES_TIME_UNIT.ACCUMULATED
			? value1 - value0
			: value1
		const speed = dt ? dv / dt : (dv ? +Infinity : 0)
		seriesWithSpeeds.push([time1, value1, speed])
	}
	return seriesWithSpeeds
}

function calcSeriesAverage(
	series,
	resolution,
	average,
	gt = getTimeOfSeriesItem,
	gv = getValueOfSeriesItem,
	ci = createSeriesItem,
	getInfoFromCut = csAvgGetSumFromCut
) {
	const sLen = series.length;
	const tMin = gt(series[0]);
	const tMax = gt(series[sLen - 1]);
	const avgBase = [];
	const holes = [];
	let currentHole = undefined;
	let lastCut = undefined;
	let prevCut = undefined;
	let tPos = tMin;
	let tSum = 0;
	let vSum = 0;
	while (tPos < tMax) {
		const tNext = tPos + resolution;
		prevCut = lastCut;
		lastCut = getSegmentCutAndSumFromSeries(
			series,
			tNext - average,
			tNext,
			gt,
			gv,
			ci,
			prevCut ? undefined : reduceValueLesser,
			prevCut ? undefined : reduceValueLesser,
		);
		const { cutBefore, sum } = lastCut.cut;
		if (sum) {
			if (currentHole) {
				currentHole.end = cutBefore;
				currentHole = undefined;
			}
			avgBase.push(getInfoFromCut(lastCut, prevCut));
			tSum += gt(sum);
			vSum += gv(sum);
		} else if (!currentHole) {
			currentHole = {
				tPos,
				tNext,
				tStart: tNext - average,
				cutPrev: prevCut,
				cutLast: lastCut,
				start: prevCut?.cut.cutAfter,
				end: undefined,
			};
			holes.push(currentHole);
		}
		tPos = tNext;
	}
	const avg = calcSeriesSpeedsAtEachInterval(avgBase, SERIES_TIME_UNIT.INTERVAL);
	const sum = ci(tSum, vSum);
	return { avg, sum, holes, sLen, tMin, tMax };
}

function randSegment(
	series,
	minTime,
	maxTime,
	minLength,
	maxLength,
	gt,
	gv,
	ci
) {
	const length = Math.round(rand(minLength, maxLength));
	const start = Math.round(rand(minTime, maxTime - length));
	const end = start + length;
	const segment = getSegment(series, start, end, gt, gv);
	const cut = getSegmentCutAndSum(segment, start, end, gt, gv, ci);
	return {
		meta: {
			start,
			length,
			end,
		},
		segment,
		cut,
	};
}

function printItem(o, gt = getTimeOfSeriesItem, gv = getValueOfSeriesItem) {
	const s = (o && 2 in o) ? ` s ${String(getSpeedOfSeriesItem(o)).padStart(3)}` : ''
	const xy = (o && 4 in o) ? ` / x ${String(o[3]).padStart(3)} y ${String(o[4]).padStart(3)}` : ''
	return o
		? `t ${String(gt(o)).padStart(3)} v ${String(gv(o)).padStart(3)}${s}${xy}`
		: o;
}

function printSeries(s, gt, gv) {
	if (!(s instanceof Array)) {
		throw new Error(`printSeries: series is not an array`);
	}
	return s.map(
		(o, i) => `- ${String(i).padStart(3)} - ${printItem(o, gt, gv)}`
	);
}

function printCutSum(cut) {
	const { cutBefore, cutBeforeSimul, cutAfter, cutAfterSimul, sum } = cut;
	return {
		cutBefore: printItem(cutBefore),
		cutBeforeSimul,
		cutAfter: printItem(cutAfter),
		cutAfterSimul,
		sum: printItem(sum),
	};
}

function printSegment({ meta, segment, cut }, gt, gv) {
	return {
		meta,
		segment: {
			before: printItem(segment.before, gt, gv),
			first: printItem(segment.first, gt, gv),
			inside: printSeries(segment.inside, gt, gv),
			last: printItem(segment.last),
			after: printItem(segment.after),
		},
		cut: printCutSum(cut),
	};
}

function printAvgFullInfo({ cut, cutPrev }) {
	return {
		cut: cut && printSegment(cut),
		cutPrev: cutPrev && printSegment(cutPrev),
		simul: cut?.cut?.cutBeforeSimul || cut?.cut?.cutAfterSimul,
	};
}

function printAvgFullInfoList(s, gt, gv) {
	if (!(s instanceof Array)) {
		throw new Error(`printAvgFullInfoList: series is not an array`);
	}
	return s.map(printAvgFullInfo);
}

function printAverageHole(hole) {
	const { tPos, tNext, tStart, cutPrev, cutLast, start, end } = hole;
	return {
		tPos,
		tNext,
		tStart,
		cutPrev: printSegment(cutPrev),
		cutLast: printSegment(cutLast),
		start: printItem(start),
		end: printItem(end),
	};
}

function printAverage(obj, gt, gv, printList = printSeries) {
	const { avg, sum, holes } = obj;
	return {
		avg: printList(avg, gt, gv),
		sum: printItem(sum, gt, gv),
		holes: holes.map((h) => printAverageHole(h)),
	};
}

function clampPixelAverageWindow(pixelAverageWindow, maxWindow) {
	const maxAllowed = Math.max(1, Math.floor(maxWindow || 1))
	const nextWindow = Math.floor(pixelAverageWindow)
	if (!Number.isFinite(nextWindow)) return 1
	return Math.min(Math.max(1, nextWindow), maxAllowed)
}

function applyRollingAverageToSpeedSeries(avgWithSpeeds, pixelAverageWindow) {
	const windowSize = clampPixelAverageWindow(pixelAverageWindow, avgWithSpeeds.length)
	if (windowSize <= 1 || avgWithSpeeds.length <= 1) {
		return avgWithSpeeds
	}
	const finiteWindow = []
	const smoothed = []
	let finiteSum = 0
	let finiteCount = 0
	for (let i = 0, c = avgWithSpeeds.length; i < c; i++) {
		const step = avgWithSpeeds[i]
		const speed = step[2]
		const finiteSpeed = Number.isFinite(speed) ? speed : undefined
		finiteWindow.push(finiteSpeed)
		if (finiteSpeed !== undefined) {
			finiteSum += finiteSpeed
			finiteCount += 1
		}
		if (finiteWindow.length > windowSize) {
			const removedSpeed = finiteWindow.shift()
			if (removedSpeed !== undefined) {
				finiteSum -= removedSpeed
				finiteCount -= 1
			}
		}
		const smoothedSpeed = finiteCount ? finiteSum / finiteCount : speed
		smoothed.push([step[0], step[1], smoothedSpeed])
	}
	return smoothed
}

function resolveGraphMaxSpeed(localMaxAvgSpeed, previousMaxSpeed, renderOptions) {
	const localMax = Number.isFinite(localMaxAvgSpeed) && localMaxAvgSpeed > 0
		? localMaxAvgSpeed
		: 1
	const decay = Number.isFinite(renderOptions?.maxSpeedDecay) && renderOptions.maxSpeedDecay > 0 && renderOptions.maxSpeedDecay < 1
		? renderOptions.maxSpeedDecay
		: 0.96
	const headroom = Number.isFinite(renderOptions?.maxSpeedHeadroom) && renderOptions.maxSpeedHeadroom >= 1
		? renderOptions.maxSpeedHeadroom
		: 1.08
	const previousMax = Number.isFinite(previousMaxSpeed) && previousMaxSpeed > 0
		? previousMaxSpeed
		: 0
	// previousMaxSpeed already includes headroom from the prior frame, so remove it
	// before applying decay to avoid compounding headroom over time.
	const previousBase = previousMax ? previousMax / headroom : 0
	const decayedMax = previousBase ? previousBase * decay : 0
	return Math.max(localMax, decayedMax) * headroom
}

function calcAverageSpeedsForResolution(config, stepList, { w: canvasWidth, h: canvasHeight }, renderOptions) {
	if (!stepList.length) return
	const lastStep = stepList[stepList.length - 1]
	const [, lastValue] = lastStep
	// const maxValue = config.maxValue
	const lastX = lastValue / config.maxValue * (canvasWidth - 1)
	if (lastX) {
		const pixelsPerValue = lastValue ? lastX / lastValue : 0
		// With this, we should get the resolution of 1px per datapoint
		const avgResolution = lastValue / lastX
		const avgWithSpeeds = calcSeriesSpeedsAtEachInterval(
			calcSeriesAverage(
				stepList,
				avgResolution, // resolution,
				avgResolution, // averageValue,
				getValueOfSeriesItem,
				getTimeOfSeriesItem,
				createSeriesItemInverted,
			).avg,
			SERIES_TIME_UNIT.INTERVAL,
		)
		const pixelAverageWindow = clampPixelAverageWindow(renderOptions?.pixelAverageWindow, canvasWidth)
		const avgWithSpeedsSmoothed = applyRollingAverageToSpeedSeries(avgWithSpeeds, pixelAverageWindow)
		let hasZeroTime = false
		const infiniteFactor = 2 // how much more space infinite speed (0 time) gets compared to max speed
		const localMaxAvgSpeed = avgWithSpeedsSmoothed.reduce((max, [time,,speed]) => {
			if (time === 0 || !Number.isFinite(speed)) {
				hasZeroTime = true // that's infinite speed
				return max
			}
			return Math.max(max, speed)
		}, 0)
		// const resolvedMaxSpeed = (
		// 	typeof globalMaxSpeed === 'number' && globalMaxSpeed > 0
		// 		? globalMaxSpeed
		// 		: localMaxAvgSpeed
		// ) || 1
		const maxAvgSpeed = localMaxAvgSpeed * (hasZeroTime ? infiniteFactor : 1)
		const height = canvasHeight - 1
		let x = 0
		let y = height
		// canvasCtx.moveTo(x, y)
		for (let i = 0, c = avgWithSpeedsSmoothed.length; i < c; i++) {
			const [time, value, speed] = avgWithSpeedsSmoothed[i]
			const valuePx = pixelsPerValue ? value * pixelsPerValue : 0
			x += valuePx
			let speedRatio = time === 0 ? 1
				: Math.min(1, speed / maxAvgSpeed)
			y = height - (height * speedRatio) + 0
			// canvasCtx.lineTo(x, y)
			avgWithSpeedsSmoothed[i].push(x, y)
		}
		return {
			lastX,
			lastValue,
			maxValue: config.maxValue,
			pixelsPerValue,
			avgResolution,
			avgWithSpeeds: avgWithSpeedsSmoothed,
			localMaxAvgSpeed,
			maxAvgSpeed,
			hasZeroTime,
			pixelAverageWindow,
			canvasWidth,
			canvasHeight,
		}
	}
}

function renderStepToCanvas(config, stepList, canvasCtx, { w: canvasWidth, h: canvasHeight }, globalMaxSpeed, renderOptions) {
	const {
		colorBackground = '#a1e992',
		colorBackgroundStroke = '#8dd07a',
		colorOverlay = '#06b027',
		gridCols = 8,
		gridRows = 4,
		gridColor = 'rgba(255,255,255,0.4)',
		borderColor = 'rgba(0,0,0,0.25)',
		speedLabel = '',
		speedLabelColor = 'rgba(0,0,0,0.75)',
		speedGuideColor = 'rgba(0,0,0,0.7)',
	} = renderOptions || {}
	if (!stepList.length) return
	const lastStep = stepList[stepList.length - 1]
	const [, lastValue] = lastStep
	const lastX = lastValue / config.maxValue * (canvasWidth - 1)
	let currentSpeedY = undefined

	canvasCtx.save()

	canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight)
	canvasCtx.fillStyle = colorBackground
	canvasCtx.strokeStyle = colorBackgroundStroke
	canvasCtx.lineWidth = 1
	canvasCtx.beginPath()
	canvasCtx.rect(0.5, 0.5, lastX, canvasHeight - 1)
	canvasCtx.fill()
	canvasCtx.stroke()

	if (lastX) {
		const avgResult = calcAverageSpeedsForResolution(
			config,
			stepList,
			{ w: canvasWidth, h: canvasHeight },
			renderOptions,
		)
		const {
			avgWithSpeeds,
			pixelsPerValue,
			localMaxAvgSpeed,
			hasZeroTime,
		} = avgResult
		const infiniteFactor = 2 // how much more space infinite speed (0 time) gets compared to max speed
		const resolvedMaxSpeed = (
			typeof globalMaxSpeed === 'number' && globalMaxSpeed > 0
				? globalMaxSpeed
				: localMaxAvgSpeed
		) || 1
		const maxAvgSpeed = resolvedMaxSpeed * (hasZeroTime ? infiniteFactor : 1)

		canvasCtx.save()
		canvasCtx.beginPath()
		let x = 0.5
		let y = canvasHeight - 0.5
		const height = canvasHeight - 1
		canvasCtx.moveTo(x, y)
		for (let i = 0, c = avgWithSpeeds.length; i < c; i++) {
			const [time, value, speed] = avgWithSpeeds[i]
			const valuePx = pixelsPerValue ? value * pixelsPerValue : 0
			x += valuePx
			let speedRatio = time === 0 ? 1
				: Math.min(1, speed / maxAvgSpeed)
			y = height - (height * speedRatio) + 0.5
			canvasCtx.lineTo(x, y)
		}
		currentSpeedY = y
		canvasCtx.lineTo(x, canvasHeight - 0.5)
		canvasCtx.closePath()
		canvasCtx.fillStyle = colorOverlay
		canvasCtx.fill()
		// canvasCtx.strokeStyle = '#e00000'
		// canvasCtx.stroke()
		canvasCtx.restore()

	}

	// Grid lines drawn over the full canvas width (including the unfilled area)
	canvasCtx.save()
	canvasCtx.strokeStyle = gridColor
	canvasCtx.lineWidth = 1
	for (let i = 1; i < gridCols; i++) {
		const gx = Math.round(canvasWidth * i / gridCols) + 0.5
		canvasCtx.beginPath()
		canvasCtx.moveTo(gx, 0.5)
		canvasCtx.lineTo(gx, canvasHeight - 0.5)
		canvasCtx.stroke()
	}
	for (let i = 1; i < gridRows; i++) {
		const gy = Math.round(canvasHeight * i / gridRows) + 0.5
		canvasCtx.beginPath()
		canvasCtx.moveTo(0.5, gy)
		canvasCtx.lineTo(canvasWidth - 0.5, gy)
		canvasCtx.stroke()
	}
	canvasCtx.restore()

	// Speed label aligned to the right edge with a guide line at the current speed height.
	if (speedLabel && Number.isFinite(currentSpeedY)) {
		canvasCtx.save()
		canvasCtx.font = 'bold 11px sans-serif'
		const labelPaddingX = 4
		const labelPaddingY = 2
		const labelMetrics = canvasCtx.measureText(speedLabel)
		const labelWidth = Math.ceil(labelMetrics.width)
		const guideY = Math.max(10.5, Math.min(canvasHeight - 3.5, currentSpeedY))
		const textX = canvasWidth - 4.5
		const labelBottomY = Math.max(12.5, Math.min(canvasHeight - 2.5, guideY - 2))
		const labelTopY = labelBottomY - 11 - labelPaddingY * 2
		const labelLeftX = textX - labelWidth - labelPaddingX * 2

		canvasCtx.strokeStyle = speedGuideColor
		canvasCtx.lineWidth = 1
		canvasCtx.beginPath()
		canvasCtx.moveTo(0.5, guideY)
		canvasCtx.lineTo(canvasWidth - 3.5, guideY)
		canvasCtx.stroke()

		canvasCtx.fillStyle = 'rgba(255,255,255,0.92)'
		canvasCtx.fillRect(
			labelLeftX,
			labelTopY,
			labelWidth + labelPaddingX * 2,
			11 + labelPaddingY * 2
		)
		canvasCtx.fillStyle = speedLabelColor
		canvasCtx.textAlign = 'right'
		canvasCtx.textBaseline = 'bottom'
		canvasCtx.fillText(speedLabel, textX, labelBottomY)
		canvasCtx.restore()
	}

	// Border around the entire canvas
	canvasCtx.save()
	canvasCtx.strokeStyle = borderColor
	canvasCtx.lineWidth = 1
	canvasCtx.strokeRect(0.5, 0.5, canvasWidth - 1, canvasHeight - 1)
	canvasCtx.restore()

	canvasCtx.restore()
}

const simplerApi = {
	rand,
	numSort,
	randSeries,
	getTimeOfSeriesItem,
	getValueOfSeriesItem,
	createSeriesItem,
	createSeriesItemInverted,
	reduceValueLesser,
	reduceValueGreater,
	getSegment,
	calcItemBetween,
	getSegmentCutAndSum,
	getSegmentCutAndSumFromSeries,
	csAvgGetSumFromCut,
	csAvgGetFullInfoFromCut,
	convertSeriesAccumulatedToDeltas,
	calcSeriesSpeedsAverageAccumulated,
	calcSeriesSpeedsAtEachInterval,
	calcSeriesAverage,
	randSegment,
	printItem,
	printSeries,
	printCutSum,
	printSegment,
	printAvgFullInfo,
	printAvgFullInfoList,
	printAverageHole,
	printAverage,
	calcAverageSpeedsForResolution,
	renderStepToCanvas,
	resolveGraphMaxSpeed,
	SERIES_TIME_UNIT,
};

if (typeof module !== 'undefined' && module.exports) {
	module.exports = simplerApi;
} else if (typeof window !== 'undefined') {
	Object.assign(window, simplerApi);
}
