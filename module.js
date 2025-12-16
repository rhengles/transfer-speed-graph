import { simpleSlider, SLIDER_HORIZONTAL, SLIDER_VERTICAL } from "./node_modules/@arijs/frontend/src/client/dom/slider.mjs";

// SLIDER_HORIZONTAL

simpleSlider(
	SLIDER_HORIZONTAL,
	document.querySelector('.slider-1-cont .slider-actual-track'),
).addHandle(
	document.querySelector('.slider-1-cont .slider-bt'),
).onEnd.on(v => console.log(`Slider 1 cont pos`, v))

simpleSlider(
	SLIDER_HORIZONTAL,
	document.querySelector('.slider-1-tick-20 .slider-actual-track'),
	0,
	20,
	20,
).addHandle(
	document.querySelector('.slider-1-tick-20 .slider-bt'),
).onEnd.on(v => console.log(`Slider 1 tick 20 pos`, v))

const s2Cont = simpleSlider(
	SLIDER_HORIZONTAL,
	document.querySelector('.slider-2-cont .slider-actual-track'),
).addRange(
	document.querySelector('.slider-2-cont .slider-bt-min'),
	document.querySelector('.slider-2-cont .slider-bt-max'),
)
s2Cont.min.onEnd.on(v => console.log(`Slider 2 cont range min`, v))
s2Cont.max.onEnd.on(v => console.log(`Slider 2 cont range max`, v))

const s2Tick = simpleSlider(
	SLIDER_HORIZONTAL,
	document.querySelector('.slider-2-tick-20 .slider-actual-track'),
	0,
	20,
	20,
).addRange(
	document.querySelector('.slider-2-tick-20 .slider-bt-min'),
	document.querySelector('.slider-2-tick-20 .slider-bt-max'),
)
s2Tick.min.onEnd.on(v => console.log(`Slider 2 tick 20 range min`, v))
s2Tick.max.onEnd.on(v => console.log(`Slider 2 tick 20 range max`, v))

// SLIDER_VERTICAL

simpleSlider(
	SLIDER_VERTICAL,
	document.querySelector('.slider-v1-cont .slider-actual-track'),
).addHandle(
	document.querySelector('.slider-v1-cont .slider-bt'),
).onEnd.on(v => console.log(`Slider v1 cont pos`, v))

simpleSlider(
	SLIDER_VERTICAL,
	document.querySelector('.slider-v1-tick-20 .slider-actual-track'),
	0,
	20,
	20,
).addHandle(
	document.querySelector('.slider-v1-tick-20 .slider-bt'),
).onEnd.on(v => console.log(`Slider v1 tick 20 pos`, v))

const sv2Cont = simpleSlider(
	SLIDER_VERTICAL,
	document.querySelector('.slider-v2-cont .slider-actual-track'),
).addRange(
	document.querySelector('.slider-v2-cont .slider-bt-min'),
	document.querySelector('.slider-v2-cont .slider-bt-max'),
)
sv2Cont.min.onEnd.on(v => console.log(`Slider v2 cont range min`, v))
sv2Cont.max.onEnd.on(v => console.log(`Slider v2 cont range max`, v))

const sv2Tick = simpleSlider(
	SLIDER_VERTICAL,
	document.querySelector('.slider-v2-tick-20 .slider-actual-track'),
	0,
	20,
	20,
).addRange(
	document.querySelector('.slider-v2-tick-20 .slider-bt-min'),
	document.querySelector('.slider-v2-tick-20 .slider-bt-max'),
)
sv2Tick.min.onEnd.on(v => console.log(`Slider v2 tick 20 range min`, v))
sv2Tick.max.onEnd.on(v => console.log(`Slider v2 tick 20 range max`, v))

/*
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
*/
