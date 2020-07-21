export default async (context, d = 1, s = 32) => {
  const bar = context.lengths.bar
  const add = []
  for (let x = 0; x < 10000; x++) {
    add.push((((Math.random() * s | 0)/s) * bar) | 0)
  }
  let i = 0
  return t => t.output[0][((i++ % Math.floor(bar/d)) +
    (add[(t*1) % add.length | 0])
  ) % bar]
}
