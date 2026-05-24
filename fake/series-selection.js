class TransferSeriesSelection {
  constructor(options) {
    const opts = options || {}
    this.clampSeriesIndex = opts.clampSeriesIndex
    this.seriesCount = Math.max(1, Math.floor(opts.seriesCount || 1))
    this.seriesActiveIndex = this.clampSeriesIndex
      ? this.clampSeriesIndex(opts.seriesActiveIndex || 1, this.seriesCount, true)
      : 1
  }

  getControlsView() {
    return {
      seriesActiveIndex: this.seriesActiveIndex,
      seriesCount: this.seriesCount,
    }
  }

  setActiveIndex(nextIndex) {
    if (!this.clampSeriesIndex) return false
    const bounded = this.clampSeriesIndex(nextIndex, this.seriesCount, true)
    if (bounded === this.seriesActiveIndex) return false
    this.seriesActiveIndex = bounded
    return true
  }

  getActiveTransferredBytes(controller) {
    if (!controller) return 0
    const selectedSeries = controller.getSeries(this.seriesActiveIndex, true)
    if (!selectedSeries || !selectedSeries.length) return 0
    return selectedSeries[selectedSeries.length - 1][1]
  }

  getActiveSeriesPoints(controller) {
    if (!controller) return [[0, 0]]
    const selectedSeries = controller.getSeries(this.seriesActiveIndex, true)
    if (!selectedSeries || !selectedSeries.length) return [[0, 0]]

    const points = []
    for (let i = 0; i < selectedSeries.length; i += 1) {
      const row = selectedSeries[i]
      if (!Array.isArray(row) || row.length < 2) continue
      points.push([row[0], row[1]])
    }

    return points.length ? points : [[0, 0]]
  }
}

export {
  TransferSeriesSelection,
}
