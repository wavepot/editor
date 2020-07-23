import Wavetable from './wavetable-osc/index.js'

export default (context, speed, phase) => {
  const spin = Wavetable(context, 'sin', null, null, phase)
  let i = 0
  context.handle = true
  let input, pos = 0
  return ({ n, output, totalLength }) => {
    input = input || [new Float32Array(totalLength), new Float32Array(totalLength)]
    input[0].set(output[0])
    input[1].set(output[1])
    for (i = 0; i < totalLength; i++) {
      pos = Math.floor((n + i) * (spin(speed)/2+1)) % totalLength
      output[0][i] = input[0][pos]
      output[1][i] = input[1][pos]
    }
  }
}
