export default (t, amount = 500) => {
  t.output[1].set(
    t.output[0].subarray(0,-amount),
    amount
  )
}
