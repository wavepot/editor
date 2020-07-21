export default async (context, thres = .24, w = 200, release = 15000) => {
  let zeroMark = 0
  let aboveThres = false
  let sum = 0.0
  let avg = 0.0
  let x = 0
  let i = 0
  let data
  return t => {
    zeroMark = 0
    data = t.output[0]
    for (x = 0; x < data.length; x += w) {
      if (x < zeroMark) continue

      sum = 0
      for (i = x; i < x+w; i++) {
        sum += Math.abs(data[i])
      }
      avg = Math.min(1, (sum / w))

      if (avg > thres && !aboveThres) {
        aboveThres = true
        data.fill(0, zeroMark, x-w)
      }
      if (avg < thres && aboveThres) {
        aboveThres = false
        zeroMark = x+w+release
      }
    }
    if (avg < thres && !aboveThres) {
      data.fill(0, zeroMark, data.length)
    }
  }
}
