function rand(min, max) {
  return Math.random() * (max - min) + min;
}

const numSort = (a, b) => a - b;

function randSeries(minCount, maxCount, minTime, maxTime, minValue, maxValue) {
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
  return series;
}

function printItem(o) {
  return o ? `t ${String(o[0]).padStart(3)} v ${String(o[1]).padStart(3)}` : o;
}

function printSeries(s) {
  return s.map((o, i) => `- ${String(i).padStart(3)} - ${printItem(o)}`);
}

function getSegment(series, minTime, maxTime) {
  let before = undefined;
  let after = undefined;
  let first = undefined;
  let last = undefined;
  const inside = [];
  const count = series.length;
  for (let i = 0; i < count; i++) {
    const item = series[i];
    if (item[0] < minTime) {
      if (!before || item[0] > before[0]) {
        before = item;
      }
    }
    if (item[0] >= minTime && item[0] <= maxTime) {
      inside.push(item);
      if (!first) {
        first = item;
        if (first[0] == minTime) {
          before = undefined;
        }
      }
      last = item;
    }
    if (item[0] > maxTime) {
      if (!after || item[0] == after[0]) {
        if (!last || last[0] < maxTime) {
          after = item;
        }
      } else if (item[0] > after[0]) {
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

function calcValueBetween(cut, before, after) {
  if (before && after) {
    const tStart = before[0];
    const tEnd = after[0];
    const tDuration = tEnd - tStart;
    const fracFirst = (cut - tStart) / tDuration;
    const vStart = before[1];
    const vEnd = after[1];
    const vDuration = vEnd - vStart;
    return fracFirst * vDuration + vStart;
  } else if (before) {
    return before[1];
  } else if (after) {
    return after[1];
  } else {
    throw new Error(`Cannot calculate value between without before or after`);
  }
}

function getSegmentValue(segment, start, end) {
  const { before, first, last, after } = segment;
  const cutBefore = first
    ? [start, calcValueBetween(start, before, first)]
    : undefined;
  const cutAfter = last ? [end, calcValueBetween(end, last, after)] : undefined;
  const value = cutBefore && cutAfter ? cutAfter[1] - cutBefore[1] : 0;
  return {
    cutBefore,
    cutAfter,
    value,
  };
}

function randSegment(series, minTime, maxTime, minLength, maxLength) {
  const length = Math.round(rand(minLength, maxLength));
  const start = Math.round(rand(minTime, maxTime - length));
  const end = start + length;
  const segment = getSegment(series, start, end);
  const cut = getSegmentValue(segment, start, end);
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

function printSegment({ meta, segment, cut }) {
  return {
    meta,
    segment: {
      before: printItem(segment.before),
      first: printItem(segment.first),
      inside: printSeries(segment.inside),
      last: printItem(segment.last),
      after: printItem(segment.after),
    },
    cut,
  };
}

const series = randSeries(15, 25, 0, 100, 0, 100);
const segment = randSegment(series, -30, 120, 10, 30);

printSeries(series).forEach((s) => console.log(s));

console.log(printSegment(segment));
