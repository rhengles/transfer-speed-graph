import {
	calcSeriesSpeedsAtEachInterval,
	calcSeriesAverage,
	getValueOfSeriesItem,
	getTimeOfSeriesItem,
	createSeriesItemInverted,
	SERIES_TIME_UNIT,
} from './speed-series.js'

function isZeroLikeTime(time, epsilon = 1e-6) {
	return !Number.isFinite(time) || Math.abs(time) <= epsilon
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

function defaultDrawProgressBar(args) {
	args.createDefaultPath()
	args.canvasCtx.fill()
	args.canvasCtx.stroke()
}

function defaultDrawGrid(args) {
	args.createDefaultPath()
	args.canvasCtx.stroke()
}

function defaultDrawSpeedOverlay(args) {
	args.createDefaultPath()
	args.canvasCtx.fill()
}

function defaultDrawSpeedLineLabel(args) {
	args.createDefaultLinePath()
	args.canvasCtx.stroke()
	args.createDefaultLabelBackgroundPath()
	args.canvasCtx.fill()
	args.fillDefaultLabelText()
}

function defaultDrawBorder(args) {
	args.createDefaultPath()
	args.canvasCtx.stroke()
}

function calcAverageSpeedsForResolution(maxValue, stepList, { w: canvasWidth, h: canvasHeight }, renderOptions) {
	if (!stepList.length) return
	if (!(Number.isFinite(maxValue) && maxValue > 0)) return
	const lastStep = stepList[stepList.length - 1]
	const [, lastValue] = lastStep
	const lastX = lastValue / maxValue * (canvasWidth - 1)
	if (lastX) {
		const pixelsPerValue = lastValue ? lastX / lastValue : 0
		const avgResolution = lastValue / lastX
		const avgWithSpeeds = calcSeriesSpeedsAtEachInterval(
			calcSeriesAverage(
				stepList,
				avgResolution,
				avgResolution,
				getValueOfSeriesItem,
				getTimeOfSeriesItem,
				createSeriesItemInverted,
			).avg,
			SERIES_TIME_UNIT.INTERVAL,
		)
		const pixelAverageWindow = clampPixelAverageWindow(renderOptions?.pixelAverageWindow, canvasWidth)
		const avgWithSpeedsSmoothed = applyRollingAverageToSpeedSeries(avgWithSpeeds, pixelAverageWindow)
		const ignoreTrailingSpeedSample = renderOptions?.ignoreTrailingSpeedSample === true
		const renderPointCount = ignoreTrailingSpeedSample && avgWithSpeedsSmoothed.length > 1
			? avgWithSpeedsSmoothed.length - 1
			: avgWithSpeedsSmoothed.length
		let hasZeroTime = false
		const zeroLikeTimeEpsilon = Number.isFinite(renderOptions?.zeroLikeTimeEpsilon) && renderOptions.zeroLikeTimeEpsilon > 0
			? renderOptions.zeroLikeTimeEpsilon
			: 1e-6
		let localMaxAvgSpeed = 0
		for (let i = 0; i < renderPointCount; i++) {
			const [time,,speed] = avgWithSpeedsSmoothed[i]
			if (isZeroLikeTime(time, zeroLikeTimeEpsilon) || !Number.isFinite(speed)) {
				hasZeroTime = true
				continue
			}
			localMaxAvgSpeed = Math.max(localMaxAvgSpeed, speed)
		}
		const maxAvgSpeed = localMaxAvgSpeed || 1
		const height = canvasHeight - 1
		let x = 0
		let y = height
		for (let i = 0, c = avgWithSpeedsSmoothed.length; i < c; i++) {
			const [time, value, speed] = avgWithSpeedsSmoothed[i]
			const valuePx = pixelsPerValue ? value * pixelsPerValue : 0
			x += valuePx
			let speedRatio = isZeroLikeTime(time, zeroLikeTimeEpsilon) ? 1
				: Math.min(1, speed / maxAvgSpeed)
			y = height - (height * speedRatio) + 0
			avgWithSpeedsSmoothed[i].push(x, y)
		}
		return {
			lastX,
			lastValue,
			maxValue,
			pixelsPerValue,
			avgResolution,
			avgWithSpeeds: avgWithSpeedsSmoothed,
			renderPointCount,
			ignoreTrailingSpeedSample,
			localMaxAvgSpeed,
			maxAvgSpeed,
			hasZeroTime,
			pixelAverageWindow,
			canvasWidth,
			canvasHeight,
		}
	}
}

function renderTransferGraphFrame(args) {
  const maxValue = Number.isFinite(args.maxValue) ? args.maxValue : 0
  const series = args.series
  const canvasCtx = args.canvasCtx
  const size = args.size
  const runningMaxSpeed = args.runningMaxSpeed
  const graphOptions = args.graphOptions || {}
  const renderOptions = args.renderOptions || {}
  const manageMaxSpeed = args.manageMaxSpeed !== false
  const recalculateMaxFromZero = args.recalculateMaxFromZero === true
  let nextRunningMax = Number.isFinite(runningMaxSpeed) ? runningMaxSpeed : 0
  let lastRenderedSpeed

  if (recalculateMaxFromZero) {
    nextRunningMax = 0
  }

  if (manageMaxSpeed && series.length > 1) {
    const avgResult = calcAverageSpeedsForResolution(maxValue, series, size, {
      pixelAverageWindow: graphOptions.pixelAverageWindow,
      ignoreTrailingSpeedSample: graphOptions.ignoreTrailingSpeedSample !== false,
    })
    if (avgResult && avgResult.localMaxAvgSpeed > 0) {
      nextRunningMax = resolveGraphMaxSpeed(avgResult.localMaxAvgSpeed, nextRunningMax, {
        maxSpeedDecay: graphOptions.maxSpeedDecay,
        maxSpeedHeadroom: graphOptions.maxSpeedHeadroom,
      })
    }
    if (avgResult && avgResult.renderPointCount > 0) {
      lastRenderedSpeed = avgResult.avgWithSpeeds[avgResult.renderPointCount - 1][2]
    }
  }

  let finalRenderOptions = renderOptions
  if (
    typeof renderOptions.speedLabelFormatter === 'function' &&
    !renderOptions.speedLabel &&
    typeof lastRenderedSpeed === 'number' &&
    Number.isFinite(lastRenderedSpeed)
  ) {
    finalRenderOptions = Object.assign({}, renderOptions, {
      speedLabel: renderOptions.speedLabelFormatter(lastRenderedSpeed)
    })
  }

  renderStepToCanvas(
    maxValue,
    series,
    canvasCtx,
    size,
    manageMaxSpeed ? (nextRunningMax || undefined) : undefined,
    finalRenderOptions
  )

  return { runningMaxSpeed: nextRunningMax, lastRenderedSpeed }
}

function renderStepToCanvas(maxValue, stepList, canvasCtx, { w: canvasWidth, h: canvasHeight }, globalMaxSpeed, renderOptions) {
	const {
		colorBackground = '#a1e992',
		colorBackgroundStroke = '#8dd07a',
		colorOverlay = '#06b027',
		gridCols = 10,
		gridRows = 5,
		gridColor = 'rgba(0,0,0,0.125)',
		borderColor = 'rgba(0,0,0,0.25)',
		speedLabel = '',
		speedLabelColor = 'rgba(0,0,0,0.75)',
		speedLabelBackgroundColor = 'rgba(255,255,255,0)',
		speedGuideColor = 'rgba(0,0,0,0.7)',
		ignoreTrailingSpeedSample = true,
		drawProgressBar = defaultDrawProgressBar,
		drawGrid = defaultDrawGrid,
		drawSpeedOverlay = defaultDrawSpeedOverlay,
		drawSpeedLineLabel = defaultDrawSpeedLineLabel,
		drawBorder = defaultDrawBorder,
	} = renderOptions || {}
	if (!stepList.length) return
	if (!(Number.isFinite(maxValue) && maxValue > 0)) return
	const lastStep = stepList[stepList.length - 1]
	const [, lastValue] = lastStep
	const backgroundValue = Number.isFinite(renderOptions?.backgroundValue)
		? Math.min(maxValue, Math.max(0, renderOptions.backgroundValue))
		: lastValue
	const lastX = backgroundValue / maxValue * (canvasWidth - 1)
	let currentSpeedY = undefined

	canvasCtx.save()

	canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight)
	canvasCtx.fillStyle = colorBackground
	canvasCtx.strokeStyle = colorBackgroundStroke
	canvasCtx.lineWidth = 1
	const renderProgressBar = drawProgressBar instanceof Function ? drawProgressBar : defaultDrawProgressBar
	renderProgressBar({
		canvasCtx,
		canvasWidth,
		canvasHeight,
		lastX,
		backgroundValue,
		createDefaultPath: () => {
			canvasCtx.beginPath()
			canvasCtx.rect(0.5, 0.5, lastX, canvasHeight - 1)
		},
	})

	// Grid lines drawn over the full canvas width (including the unfilled area)
	canvasCtx.save()
	canvasCtx.strokeStyle = gridColor
	canvasCtx.lineWidth = 1
	const renderGrid = drawGrid instanceof Function ? drawGrid : defaultDrawGrid
	renderGrid({
		canvasCtx,
		canvasWidth,
		canvasHeight,
		gridCols,
		gridRows,
		createDefaultPath: () => {
			canvasCtx.beginPath()
			for (let i = 1; i < gridCols; i++) {
				const gx = Math.round(canvasWidth * i / gridCols) + 0.5
				canvasCtx.moveTo(gx, 0.5)
				canvasCtx.lineTo(gx, canvasHeight - 0.5)
			}
			for (let i = 1; i < gridRows; i++) {
				const gy = Math.round(canvasHeight * i / gridRows) + 0.5
				canvasCtx.moveTo(0.5, gy)
				canvasCtx.lineTo(canvasWidth - 0.5, gy)
			}
		},
	})
	canvasCtx.restore()

	if (lastX) {
		const avgResult = calcAverageSpeedsForResolution(
			maxValue,
			stepList,
			{ w: canvasWidth, h: canvasHeight },
			Object.assign({}, renderOptions, { ignoreTrailingSpeedSample }),
		)
		const {
			avgWithSpeeds,
			renderPointCount,
			pixelsPerValue,
			localMaxAvgSpeed,
		} = avgResult
		const resolvedMaxSpeed = (
			typeof globalMaxSpeed === 'number' && globalMaxSpeed > 0
				? globalMaxSpeed
				: localMaxAvgSpeed
		) || 1
		const maxAvgSpeed = resolvedMaxSpeed

		canvasCtx.save()
		const endX = Math.min(canvasWidth - 0.5, Math.max(0.5, lastX + 0.5))
		canvasCtx.fillStyle = colorOverlay
		const renderSpeedOverlay = drawSpeedOverlay instanceof Function ? drawSpeedOverlay : defaultDrawSpeedOverlay
		renderSpeedOverlay({
			canvasCtx,
			canvasWidth,
			canvasHeight,
			lastX,
			endX,
			avgWithSpeeds,
			renderPointCount,
			pixelsPerValue,
			maxAvgSpeed,
			createDefaultPath: () => {
				canvasCtx.beginPath()
				let x = 0.5
				let y = canvasHeight - 0.5
				const height = canvasHeight - 1
				canvasCtx.moveTo(x, y)
				for (let i = 0, c = renderPointCount; i < c; i++) {
					const [time, value, speed] = avgWithSpeeds[i]
					const valuePx = pixelsPerValue ? value * pixelsPerValue : 0
					x += valuePx
					let speedRatio = isZeroLikeTime(time, 1e-6) ? 1
						: Math.min(1, speed / maxAvgSpeed)
					y = height - (height * speedRatio) + 0.5
					canvasCtx.lineTo(x, y)
				}
				// Keep the last measured speed until the filled progress width ends.
				if (x < endX) {
					canvasCtx.lineTo(endX, y)
					x = endX
				}
				currentSpeedY = y
				canvasCtx.lineTo(x, canvasHeight - 0.5)
				canvasCtx.closePath()
			},
		})
		// canvasCtx.strokeStyle = '#e00000'
		// canvasCtx.stroke()
		canvasCtx.restore()

	}

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
		const renderSpeedLineLabel = drawSpeedLineLabel instanceof Function ? drawSpeedLineLabel : defaultDrawSpeedLineLabel
		renderSpeedLineLabel({
			canvasCtx,
			canvasWidth,
			canvasHeight,
			guideY,
			textX,
			labelBottomY,
			labelTopY,
			labelLeftX,
			labelWidth,
			labelPaddingX,
			labelPaddingY,
			speedLabel,
			speedLabelColor,
			speedLabelBackgroundColor,
			speedGuideColor,
			createDefaultLinePath: () => {
				canvasCtx.beginPath()
				canvasCtx.moveTo(0.5, guideY)
				canvasCtx.lineTo(canvasWidth - 3.5, guideY)
				canvasCtx.strokeStyle = speedGuideColor
			},
			createDefaultLabelBackgroundPath: () => {
				canvasCtx.beginPath()
				canvasCtx.rect(
					labelLeftX,
					labelTopY,
					labelWidth + labelPaddingX * 2,
					11 + labelPaddingY * 2,
				)
				canvasCtx.fillStyle = speedLabelBackgroundColor
			},
			fillDefaultLabelText: ({ fillStyle, textAlign, textBaseline } = {}) => {
				canvasCtx.fillStyle = fillStyle ?? speedLabelColor
				canvasCtx.textAlign = textAlign ?? 'right'
				canvasCtx.textBaseline = textBaseline ?? 'bottom'
				canvasCtx.fillText(speedLabel, textX, labelBottomY)
			},
		})
		canvasCtx.restore()
	}

	// Border around the entire canvas
	canvasCtx.save()
	canvasCtx.strokeStyle = borderColor
	canvasCtx.lineWidth = 1
	const renderBorder = typeof drawBorder === 'function' ? drawBorder : defaultDrawBorder
	renderBorder({
		canvasCtx,
		canvasWidth,
		canvasHeight,
		borderColor,
		createDefaultPath: () => {
			canvasCtx.beginPath()
			canvasCtx.rect(0.5, 0.5, canvasWidth - 1, canvasHeight - 1)
		},
	})
	canvasCtx.restore()

	canvasCtx.restore()
}

export {
	calcAverageSpeedsForResolution,
	resolveGraphMaxSpeed,
	renderTransferGraphFrame,
	renderStepToCanvas,
}
