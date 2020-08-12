import FFT from './lib/fft.js'

const WINDOW = 2**13
const SLICES = 16

const fft = new FFT(
  WINDOW,
  44100,
  'bartlettHann',
  .01
)

export default (canvas, data) => {
  const fftData = []

  let slice
  let remain = 0
  for (let i = 0; i < SLICES; i++) {
    let pos = Math.floor(i * (data.length/SLICES))
    slice = data.subarray(pos, pos + WINDOW)

    if (slice.length < WINDOW) {
      remain = WINDOW - slice.length
      slice = new Float32Array(WINDOW)
      slice.set(data.subarray(pos, pos+WINDOW))
    }

    fftData.push(fft.calculateSpectrum(slice))
  }

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
  const w = width / (fftData.length - remain/2/fftData.length)// - (remain*4) / fftData.length))
  const h = fftData[0].length
  for (let x = 0; x < width; x++) {
    let xw = Math.floor(x*fftData.length / width)
    for (let y = 0; y < height; y++) {
      let yp = (y/height) * fftData[xw].length
      yp = Math.floor(
        linearToLog(0, fftData[xw].length,
        linearToLog(0, fftData[xw].length,
        linearToLog(0, fftData[xw].length,
        linearToLog(0, fftData[xw].length,
        linearToLog(0, fftData[xw].length, yp)
        ))))
      )
      let val = fftData[xw][yp]
      val = 1-(Math.abs(Math.max(-255, Math.log10(val) * (130 - (Math.sqrt(y)*4.8) ) ))/255)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `rgba(255,90,0,${val})`
      ctx.fillRect(x/2, height-y, 1, 1)
    }
  }
}

const linearToLog = (min, max, now) => {
  var v = Math.exp((now - min) / (max - min)); // 1 <= result <= E
  return min + (max - min) * (v - 1) / (Math.E - 1);
}
