import { makeDrag } from "./node_modules/@arijs/frontend/src/client/dom/pointer-drag.mjs";

function sliderValueContinuous(value) {
	return value
}

function fnSliderValueRoundToTickUniform(tickCount) {
	return function (value, min, max) {
		const totalLen = max - min
		const tickLen = totalLen / tickCount
		return Math.round((value - min) / tickLen) * tickLen + min
	}
}

function useSlider(track, btMin, btMax, getValue = sliderValueContinuous) {

	let pMin = 0
	let pMax = track.scrollWidth
	let vMin = 0
	let vMax = 100
	let minPos = 0
	let maxPos = 0
	console.log(`module.js: got makeDrag`, vMax - vMin, track, btMin, btMax, makeDrag)

	const pixelToValue = p => pMax ? p * vMax / pMax : vMin
	const valueToPixel = v => vMax ? v * pMax / vMax : pMin
	const renderBtPos = (px, el) => el.style.left = `${px}px`
	const applyValue = (v, el) => {
		v = getValue(v, vMin, vMax)
		const px = Math.round(valueToPixel(v))
		renderBtPos(px, el)
		return {v, px}
	}

	const ro = new ResizeObserver(([entry]) => {
		console.log(`Slider resize`, entry)
		pMax = entry.contentBoxSize[0].inlineSize
		applyValue(minPos, btMin)
		applyValue(maxPos, btMax)
	})
	ro.observe(track)

	makeDrag({
		el: btMin,
		onStart() {
			const hMin = applyValue(minPos, btMin)
			this.xposStart = this.xpos = hMin.px
		},
		onMove() {
			const minPixel = Math.max(pMin, Math.min(Math.round(valueToPixel(maxPos)), this.xpos))
			this.xpos = minPixel
			this.ypos = 0
			minPos = applyValue(pixelToValue(minPixel), btMin).v
		},
		onEnd() {
			console.log(`drag btMin end`, minPos, '-', maxPos)
		},
	})

	makeDrag({
		el: btMax,
		onStart() {
			const hMax = applyValue(maxPos, btMax)
			this.xposStart = this.xpos = hMax.px
		},
		onMove() {
			const maxPixel = Math.max(Math.round(valueToPixel(minPos)), Math.min(pMax, this.xpos))
			this.xpos = maxPixel
			this.ypos = 0
			maxPos = applyValue(pixelToValue(maxPixel), btMax).v
		},
		onEnd() {
			console.log(`drag btMax end`, minPos, '-', maxPos)
		},
	})

}

useSlider(
	document.querySelector('.slider-1 .slider-actual-track'),
	document.querySelector('.slider-1 .slider-bt-min'),
	document.querySelector('.slider-1 .slider-bt-max'),
	fnSliderValueRoundToTickUniform(20),
)
