function cutNumberArray(divs, number) {
  const list = []
  for (const count of divs) {
    const value = count ? number % count : number
    list.unshift(value)
    number = count ? (number - value) / count : 0
  }
  list.unshift(number)
  return list
}

const timeDayDivArray = [
  1000, 60, 60, 24,
]

function cutTimeDaysArray(number) {
  return cutNumberArray(timeDayDivArray, number)
}

function printTime(number) {
  const [d, h, m, s, ms] = cutTimeDaysArray(number)
  const p = (pad, n) => String(n).padStart(pad, '0')
  return `${d ? `${d}, ` : ''}${h ? `${p(2, h)}:` : ''}${h ? `${p(2, m)}` : m}:${p(2, s)}.${p(3, ms)}`
}

function bytesSize(b) {
  const x = 1024
  const max = [
    [0, 0, 'B'],
    [x, 1, 'kB'],
    [x * x, 2, 'MB'],
    [x * x * x, 3, 'GB'],
    [x * x * x * x, 4, 'TB'],
  ]
  let mi = 0
  let m
  do {
    m = max[mi++]
  } while (max[mi] && b >= max[mi][0])
  const sized = Number(m[0] ? b / m[0] : b).toFixed(m[1])
  return [sized, m[2]]
}

export {
  cutNumberArray,
  cutTimeDaysArray,
  printTime,
  bytesSize,
}
