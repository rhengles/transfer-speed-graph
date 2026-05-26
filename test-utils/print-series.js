function getTimeOfSeriesItem(item) {
	return item[0];
}

function getValueOfSeriesItem(item) {
	return item[1];
}

function getSpeedOfSeriesItem(item) {
	return item[2];
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

export {
	printItem,
	printSeries,
	printCutSum,
	printSegment,
	printAvgFullInfo,
	printAvgFullInfoList,
	printAverageHole,
	printAverage,
}
