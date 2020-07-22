import toFinite from './to-finite.js'

export default (context, sample, sig, offset) => {
  return toFinite(sample[((
    (context.n + (offset * context.totalLength))
  * (sample.length / (context.totalLength * sig))
  )|0) % sample.length])
}
