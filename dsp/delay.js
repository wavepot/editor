export default async (context, size = context.lengths.bar) => {
  const buffer = new Float32Array(size)

  let counter = 0, back = 0
  let x = 0.0, x0 = 0.0, x_1 = 0.0, x1 = 0.0, x2 = 0.0
  let y = 0.0, y0 = 0.0, y_1 = 0.0, y1 = 0.0, y2 = 0.0
  let c0 = 0.0, c1 = 0.0, c2 = 0.0, c3 = 0.0

  return (t, { feedback = .5, delay = 100 }) => {
    back = counter - delay
    if (back < 0) back = size + back

    x0 = Math.floor(back)

    x_1 = x0 - 1
    x1 = x0 + 1
    x2 = x0 + 2

    if (x_1 < 0) x_1 = size - 1
    if (x1 >= size) x1 = 0
    if (x2 >= size) x2 = 0

    y_1 = buffer[x_1]
    y0 = buffer[x0]
    y1 = buffer[x1]
    y2 = buffer[x2]

    x = back - x0

    c0 = y0
    c1 = 0.5*(y1-y_1)
    c2 = y_1 - 2.5*y0 + 2.0*y1 - 0.5*y2
    c3 = 0.5*(y2-y_1) + 1.5*(y0-y1)

    y = ((c3*x*c2)*x+c1)*x+c0
    buffer[counter++] = t.input + y*feedback

    if (counter >= size) counter = 0

    return y
  }
}
