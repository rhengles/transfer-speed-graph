function fnSpeedRecorder(options = {}) {
	const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
	let data;
	let tStart;
	let tEnd;
	let size;
	let last;
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
	};
	function now() {
		return nowFn();
	}
	function start(totalSize) {
		data = [];
		tEnd = tStart = now();
		size = totalSize;
		last = 0;
		data.push([tStart, 0]);
	}
	function update(pos) {
		tEnd = now();
		last = Math.min(pos, size);
		data.push([tEnd, last]);
	}
	function getData() {
		return data;
	}
	function getLast() {
		const dataLen = data?.length || 0;
		const dataLast = dataLen ? data[dataLen - 1] : undefined;
		return dataLen ? [dataLast[0] - tStart, dataLast[1]] : [0, 0];
	}
	function getSize() {
		return size;
	}
	function isFinished() {
		return last === size;
	}
	function getStartTime() {
		return tStart;
	}
	function getEndTime() {
		return tEnd;
	}
	function getLastMsAvg(msList) {
		const dataLen = data?.length || 0;
		const dataLast = dataLen ? data[dataLen - 1] : undefined;
		const nowValue = isFinished()
			? dataLen ? dataLast[0] : now()
			: now();
		const msQueue = msList.map((ms, index) => [index, ms]);
		const resList = msList.map(() => [0, 0]);
		let msCount = msQueue.length;
		let dataAfter;
		for (let i = dataLen; i && msCount; i--) {
			const dataItem = data[i - 1];
			const t = dataItem[0];
			const p = dataItem[1];
			const d = nowValue - t;
			let anyInside = false;
			for (let j = 0; j < msCount; j++) {
				const [mj, ms] = msQueue[j];
				if (d <= ms) {
					resList[mj] = [d, dataLast[1] - p];
					anyInside = true;
					if (!(resList[mj][0] >= 0 && resList[mj][1] >= 0)) {
						throw new Error('negative time or size inside avg calc');
					}
				} else if (dataAfter) {
					const tAfter = dataAfter[0];
					const pAfter = dataAfter[1];
					const dAfter = nowValue - tAfter;
					const tInside = Math.max(0, ms - dAfter);
					if (!(tInside >= 0)) {
						throw new Error('interval overlap is negative');
					}
					const pDiff = pAfter - p;
					const tInsideFactor = tInside / (tAfter - t);
					const [tRes, pRes] = resList[mj];
					resList[mj] = [
						tRes + tInside,
						pRes + (tInsideFactor * pDiff),
					];
					msQueue.splice(j, 1);
					msCount -= 1;
					if (!(resList[mj][0] >= 0 && resList[mj][1] >= 0)) {
						throw new Error('negative time or size after slicing');
					}
				} else {
					anyInside = true;
				}
			}
			if (!anyInside) break;
			dataAfter = dataItem;
		}
		return resList;
	}
}

const api = { fnSpeedRecorder };
if (typeof module !== 'undefined' && module.exports) {
	module.exports = api;
} else {
	Object.assign(window, api);
}
