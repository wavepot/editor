
/**
 * @module moogladder
 * @author stagas
 * @desc moog ladder filter
 * @org opendsp
 * @credits Will Pirkle
 * @see http://www.willpirkle.com/project-gallery/app-notes/
 * @license mit
 */

import Filter from './filter/index.js'
import prewarp from './prewarp.js'

export default async ({ sampleRate }) => {
  const lpf1 = Filter('lpf')
  const lpf2 = Filter('lpf')
  const lpf3 = Filter('lpf')
  const lpf4 = Filter('lpf')

  let a = 0.0
  let k = 0.0
  let s = 0.0

  let SM = 0.0
  let y = 0.0
  let K = 0.0
  let u = 0.0

  let G = 0.0
  let g = 0.0

  const dsp = ({ input }) => {
    SM =
      lpf1.getFeedbackOutput()
    + lpf2.getFeedbackOutput()
    + lpf3.getFeedbackOutput()
    + lpf4.getFeedbackOutput()

    K = k
    u = a * (input - K*SM)
    u = Math.tanh(u * s)
    y = lpf4.run(lpf3.run(lpf2.run(lpf1.run(input))))

    return +y
  }

  dsp.set = ({ cut = 1000, res = .5, sat = .5 } = {}) => {
    g = prewarp({ sampleRate }, cut)
    G = g / (1 + g)

    k = res
    s = sat

    // set alphas
    lpf1.a = lpf2.a = lpf3.a = lpf4.a = G

    // set beta feedback values
    lpf1.b = G*G*G/(1.0+g)
    lpf2.b = G*G/(1.0+g)
    lpf3.b = G/(1.0+g)
    lpf4.b = 1.0/(1.0+g)

    // calculate alpha0
    // Gm = G^4
    a = 1.0/(1.0 + k*G*G*G*G)
  }

  dsp.set()

  return dsp
}
