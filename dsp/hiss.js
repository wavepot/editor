import { noise } from './osc/index.js'
export default async ({ totalLength }) => {
  var hiss = 0
  var hiss_delay = Array(100).fill(0)
  var f = 0
  return t => {
    hiss = noise()
    hiss_delay.push(-hiss)
    hiss_delay.shift()
    f = t.n % (totalLength*2)
    return .15 * (
    + (f <= totalLength) ? 1 : 0)*(0
      + hiss * .7
      + hiss_delay[98] * .7
      ) * (.15 * (1 - (f / (totalLength))))
  }
}
