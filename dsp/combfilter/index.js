
/**
 * @module combfilter
 * @author stagas
 * @org opendsp
 * @desc comb filter
 * @license mit
 */

export default async (context, size = 1000) => {
  const buffer = new Float32Array(size)
  let filter = 0.0
  let sample = 0.0
  let index = 0
  return ({ input }, { feedback = .5, damp = .5 } = {}) => {
    sample = buffer[index]
    filter = sample * (1 - damp) + filter * damp
    buffer[index] = input * 0.015 + filter * feedback
    if (++index === size) index = 0
    return sample
  }
}
