export default async (context, amount = 500) => {
  const prev = new Float32Array(amount)
  return t => {
    t.output[1].set(
      prev,
      0
    )
    t.output[1].set(
      t.output[0].subarray(0,-amount),
      amount
    )
    prev.set(
      t.output[0].subarray(-amount)
    )
  }
}
