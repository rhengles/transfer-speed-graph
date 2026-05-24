import {
  calcAverageSpeedsForResolution,
  resolveGraphMaxSpeed,
  renderStepToCanvas,
} from './simpler.js'

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

export {
  renderTransferGraphFrame,
}