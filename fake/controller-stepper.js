class TransferControllerStepper {
  constructor(options) {
    const opts = options || {}
    this.merged = opts.merged
    this.totalSize = opts.totalSize
    this.seriesCount = opts.seriesCount
    this.createSeriesCollection = opts.createSeriesCollection
    this.createFrameAndSizeGenerator = opts.createFrameAndSizeGenerator
    this.createTransferRng = opts.createTransferRng
    this.appendTransferStep = opts.appendTransferStep

    this.seriesCollection = this.createSeriesCollection(this.seriesCount)
    this.transferredBytes = 0
    this.generator = this.createFrameAndSizeGenerator(
      this.merged,
      this.createTransferRng(opts.mode, this.merged.deterministicSeed)
    )
  }

  resetSeries() {
    this.seriesCollection = this.createSeriesCollection(this.seriesCount)
    this.transferredBytes = 0
  }

  resetGenerator(mode) {
    this.generator = this.createFrameAndSizeGenerator(
      this.merged,
      this.createTransferRng(mode, this.merged.deterministicSeed)
    )
  }

  nextFrameMs() {
    return this.generator.nextFrameMs()
  }

  applyStep(elapsedMs) {
    const stepResult = this.appendTransferStep({
      seriesSeries: this.seriesCollection,
      generator: this.generator,
      transferredBytes: this.transferredBytes,
      elapsedMs,
      totalSize: this.totalSize,
      minSizeInc: this.merged.minSizeInc,
      maxSizeInc: this.merged.maxSizeInc,
    })
    this.transferredBytes = stepResult.transferredBytes
    return stepResult
  }
}

export {
  TransferControllerStepper,
}
