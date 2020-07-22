import wet from './wet.js'
import impulseConvolve from './impulse-convolve.js'

export default async (context, url, offset = 0) => {
  const reverb = await impulseConvolve(context, url)
  let remain = 0
  let prev = new Float32Array(), curr
  let i = 0
  return (t, amt = .5) => {
    curr = reverb(t.output[0])

    for (i = 0; i < prev.length; i++) {
      curr[i] += prev[i]
    }

    remain = (curr.length - offset) - context.totalLength

    prev = curr.subarray(-remain)

    wet(t, amt, curr.subarray(offset, offset + context.totalLength))
  }
}
