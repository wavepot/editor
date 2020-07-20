export default ({ sampleRate }, freq) =>
  Math.tan(Math.PI * freq / sampleRate)
