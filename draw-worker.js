import drawWaveform from './draw-waveform.js'
import drawSpectrogram from './draw-spectrogram.js'
import drawFrequency from './draw-frequency.js'

let data = []

const canvas = {}

onmessage = ({ data }) => {
  canvas.waveform = { canvas: data.waveform, draw: drawWaveform, state: 1, states: 8 }
  canvas.spectrogram = { canvas: data.spectrogram, draw: drawSpectrogram, state: 1, states: 1 }
  canvas.frequency = { canvas: data.frequency, draw: drawFrequency, state: 1, states: 1 }
  onmessage = ({ data }) => {
    const method = Object.keys(data)[0]
    const arg = data[method]
    self.methods[method](arg)
  }
}

self.methods = {
  toggle (which) {
    canvas[which].state = (canvas[which].state + 1) % canvas[which].states
    if (canvas[which].state) {
      canvas[which].draw(canvas[which].canvas, data, canvas[which].state)
    }
  },
  draw (_data) {
    data = _data
    if (canvas.waveform.state) {
      canvas.waveform.draw(canvas.waveform.canvas, data, canvas.waveform.state)
    }
    if (canvas.spectrogram.state) {
      canvas.spectrogram.draw(canvas.spectrogram.canvas, data, canvas.spectrogram.state)
    }
    if (canvas.frequency.state) {
      canvas.frequency.draw(canvas.frequency.canvas, data.subarray(0, 4096))
    }
  },
  drawSweep (_data) {
    data = _data
    if (canvas.frequency.state) {
      canvas.frequency.draw(canvas.frequency.canvas, data)
    }
  }
}
