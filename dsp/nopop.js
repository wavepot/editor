export default async (context, thres = .05, amt = .12) => {
  let prev = 0.0, next = 0.0, diff = 0.0
  return t => {
    next = t.input
    diff = next - prev
    if (Math.abs(diff) > thres) {
      prev += diff * amt
    } else {
      prev = next
    }
    return prev
  }
}
