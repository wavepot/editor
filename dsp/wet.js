export default (t, wet = .5, buffer) => {
  const dry = 1 - wet
  for (let i = 0; i < t.output[0].length; i++) {
    t.output[0][i] = t.output[0][i]*dry + buffer[i]*wet
  }
}
