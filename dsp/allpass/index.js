export default async (context, size = 500) => {
  const buffer = new Float32Array(size)
  let filter = 0.0
  let sample = 0.0
  let index = 0
  return ({ input }) => {
    sample = buffer[index]
    filter = -input + sample
    buffer[index] = input + (sample * 0.5)
    if (++index === size) index = 0
    return filter
  }
}
