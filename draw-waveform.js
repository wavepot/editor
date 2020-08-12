export default (canvas, data, state) => {
  if (state === 2) data = data.subarray(0, data.length / 4 | 0)
  if (state === 3) data = data.subarray(0, data.length / 8 | 0)
  if (state === 4) data = data.subarray(0, data.length / 16 | 0)
  if (state === 5) data = data.subarray(0, data.length / 32 | 0)
  if (state === 6) data = data.subarray(0, data.length / 64 | 0)
  if (state === 7) data = data.subarray(-(data.length / 64 | 0))
  const ctx = canvas.getContext('2d')
  const width = canvas.width*2
  const height = canvas.height
  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(0,0,0,.5)' //'#99ff00'
  ctx.fillRect(0, 0, width, height) //*2, height*2)
  // ctx.strokeStyle = '#a6e22e' //'#568208' //'#99ff00'
  const color = 'rgba(215,255,105,.5)'
  const peak = '#f00'
  ctx.lineWidth = 1
  ctx.globalCompositeOperation = 'lighter'
  ctx.beginPath()
  const y = height
  const h = height/2
  const s = 32
  ctx.moveTo(0, h)
  const w = Math.floor(data.length / width)
  for (let x = 0; x < width; x++) {
    ctx.beginPath()
    ctx.globalCompositeOperation = 'lighter'

    let max = Math.max(0, Math.max(...data.subarray(x*w, x*w+w)))
    if (max > 1) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = peak
      max = 1
    }
    else ctx.strokeStyle = color

    let min = Math.min(0, Math.min(...data.subarray(x*w, x*w+w)))
    if (min < -1) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = peak
      min = -1
    }
    else ctx.strokeStyle = color

    ctx.moveTo(x/2, (h - (max * h)))
    ctx.lineTo(x/2, (h - (min * h)))
    ctx.stroke()

    // let sum = 0
    // for (let i = x*w; i < x*w+w; i += s) {
    //   sum += Math.abs(wave[i])
    // }
    // let avg = Math.min(1, (sum / (w / s) )) * h

  }
  ctx.lineTo(width, h)
  ctx.stroke()
}
