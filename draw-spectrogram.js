// import fft from './lib/nfft.js'

// const WINDOW = 2**12
// const SLICES = 128

// // const fft = new FFT(
// //   WINDOW,
// //   44100,
// //   'bartlettHann',
// //   .01
// // )

// export default (canvas, data) => {
//   // data = data.subarray(0, 8192)
//   const fftData = []
// console.time('fft')
//   let slice
//   let remain = 0
//   for (let i = 0; i < SLICES; i++) {
//     let pos = Math.floor(i * (data.length/SLICES))
//     slice = data.subarray(pos, pos + WINDOW)

//     if (slice.length < WINDOW) {
//       remain = WINDOW - slice.length
//       slice = new Float32Array(WINDOW)
//       slice.set(data.subarray(pos, pos+WINDOW))
//     }

//     fftData.push(fft(512, slice))
//   }
// console.timeEnd('fft')

//  console.time('draw spectrogram')
import FFT from './lib/fft.js'
const WINDOW = 2**13
const SLICES = 4
const HALF = WINDOW/2

const fft = new FFT(
  WINDOW,
  44100,
  'bartlettHann',
  .2
)

export default (canvas, data) => {
  // data = data.subarray(0, 8192)
  const fftData = []
console.time('fft')
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
console.timeEnd('fft')

  console.time('draw spectrogram')
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(0,0,0,.5)' //'#99ff00'
  ctx.fillRect(0, 0, width, height) //*2, height*2)
  const imageData = ctx.createImageData(width, height)
  const width4 = width * 4
  let x, y
  let xw, yp, val
  for (let i = 0; i < imageData.data.length; i += 4) {
    x = (i % width4) / 4
    y = i / width4 | 0
    if (x === 0) {
      yp = (height-y) / height
      yp = (yp ** 2) * HALF
    }

    xw = Math.floor(x*SLICES / width)
    val = fftData[xw][yp|0]
    val = 255-Math.abs(Math.max(-255, Math.log10(val)*50))

    imageData.data[i] = 255
    imageData.data[i+1] = 100
    imageData.data[i+3] = val
  }
  ctx.putImageData(imageData, 0, 0)

  console.timeEnd('draw spectrogram')
}
