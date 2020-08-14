import FFT from './lib/fft.js'

const WINDOW = 4096/2
const SLICES = 1

const fft = new FFT(
  WINDOW,
  44100,
  'blackman',
  .5
)

export default (canvas, data) => {
  data = data.subarray(0,2048)
  console.time('draw frequency')
  // const fftData = []

  // let slice
  // let remain = 0
  // for (let i = 0; i < SLICES; i++) {
  //   let pos = Math.floor(i * (data.length/SLICES))
  //   slice = data.subarray(pos, pos + WINDOW)

  //   if (slice.length < WINDOW) {
  //     remain = WINDOW - slice.length
  //     slice = new Float32Array(WINDOW)
  //     slice.set(data.subarray(pos, pos+WINDOW))
  //   }

  //   fftData.push(

  const fftData = fft.calculateSpectrum(data)
  // }

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
  const y = height
  // const w = width /// (fftData.length - remain/2/fftData.length)// - (remain*4) / fftData.length))
  const h = fftData[0].length

  const w = Math.floor(fftData.length / width)

  ctx.beginPath()
  ctx.moveTo(0, y)
  const s = 1
  for (let x = 0; x < width; x++) {
    let xw = Math.floor(x * fftData.length / width)
    let val = fftData[xw]

    // let sum = 0
    // for (let i = x*w; i < x*w+w; i += s) {
    //   sum += Math.abs(data[i])
    // }
    // let val = (sum / (w / s) )

    // let val = Math.max(0, Math.max(...data.subarray(x*w, x*w+w)))

    // for (let y = 0; y < height; y++) {
      // let yp = (y/height) * fftData[xw].length
      // yp = Math.floor(
      //   linearToLog(0, fftData[xw].length,
      //   linearToLog(0, fftData[xw].length,
      //   linearToLog(0, fftData[xw].length,
      //   linearToLog(0, fftData[xw].length,
      //   linearToLog(0, fftData[xw].length, yp)
      //   ))))
      // )
      // let val = fftData[xw]
      val = 1-(Math.abs(Math.max(-255, Math.log10(val)*45)/255))//(200+(Math.sqrt(y)/5)) ))/255)
      // val = 20 * Math.log(val) / Math.LN10
      // console.log(val)
      // ctx.globalCompositeOperation = 'lighter'
      // ctx.fillRect(x/2, height*val, 1, 1)
    // ctx.moveTo(x/2, height * val) //(h - (max * h)))
    ctx.lineTo(x/2, height - height * val) //(h - (min * h)))
    // }
    // ctx.stroke()
  }
  ctx.strokeStyle = `rgba(100,150,255,.7)`
  ctx.stroke()
  console.timeEnd('draw frequency')
}

const linearToLog = (min, max, now) => {
  var v = Math.exp((now - min) / (max - min)); // 1 <= result <= E
  return min + (max - min) * (v - 1) / (Math.E - 1);
}
