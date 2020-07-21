const worker = {
  setup ({ canvas, lines, clock, pixelRatio }) {
    this.animTick = this.animTick.bind(this)

    this.clock = clock

    this.pixelRatio = pixelRatio

    this.canvas = {}
    this.canvas.outer = canvas
    this.canvas.lines = lines
    this.canvas.inner = new OffscreenCanvas(canvas.width, canvas.height)

    this.ctx = {}
    this.ctx.outer = this.canvas.outer.getContext('2d')
    this.ctx.lines = this.canvas.lines.getContext('2d')
    this.ctx.inner = this.canvas.inner.getContext('2d')

    // this.ctx.outer = this.canvas.outer.getContext('2d')
    // this.ctx.outer.scale(this.pixelRatio, this.pixelRatio)
    // this.ctx.inner.scale(this.pixelRatio, this.pixelRatio)

    this.waveforms = {}
  },
  suspend () {
    cancelAnimationFrame(this.animFrame)
  },
  resume () {
    cancelAnimationFrame(this.animFrame)
    this.animFrame = requestAnimationFrame(this.animTick)
  },
  createWaveform ({ id }) {
    if (id in this.waveforms) return

    const canvas = new OffscreenCanvas(
      170 * this.pixelRatio,
      75 * this.pixelRatio
    )
    const ctx = canvas.getContext('2d')
    ctx.scale(this.pixelRatio, this.pixelRatio)
    this.waveforms[id] = { canvas, ctx, volume: 1 }
  },
  setVolume ({ id, volume }) {
    this.waveforms[id].volume = volume
    this.animTick(false)
  },
  removeWaveform ({ id }) {
    // todo
  },
  redrawWaves () {
    const ctx = this.ctx.inner
    ctx.clearRect(0, 0, this.canvas.inner.width, this.canvas.inner.height)
    const height = 150
    let i = 0
    for (const waveform of Object.values(this.waveforms)) {
      ctx.drawImage(waveform.canvas, 0, i * height)
      i++
    }
    this.ctx.outer.drawImage(this.canvas.inner, 0, 0)
    this.animTick(false)
  },
  animTick (animate = false) {
    if (animate !== false) {
      cancelAnimationFrame(this.animFrame)
      this.animFrame = requestAnimationFrame(this.animTick)
    }
    const ctx = this.ctx.lines
    ctx.clearRect(0, 0, this.canvas.lines.width, this.canvas.lines.height)
    // ctx.drawImage(this.canvas.inner, 0, 0)
    // ctx.save()
    ctx.font = 'normal 12pt monospace'
    ctx.textBaseline = 'top'
    ctx.lineWidth = this.pixelRatio
    ctx.strokeStyle = '#a2a2b2'
    const time = this.clock.time[0]
    let i = 0, x = 0
    for (const waveform of Object.values(this.waveforms)) {
      // ctx.drawImage(editor.wave, 0, i * height)
      ctx.lineWidth = this.pixelRatio
      ctx.strokeStyle = '#a2a2b2'
      ctx.beginPath()
      x = (( (time - waveform.syncTime) % (this.clock.bar * waveform.bars))
        / (this.clock.bar * waveform.bars)) * this.canvas.outer.width
      ctx.moveTo(x, 150 * i)
      ctx.lineTo(x, 150 * i + 150)
      ctx.stroke()

      ctx.fillStyle = '#888'
      ctx.fillText(waveform.title, 5, 5 + 150 * i)
      ctx.fillText(waveform.volume.toFixed(2), 340 - 45, 5 + 150 * i)
      i++
    }
  },
  drawWaveform ({ id, title, data, syncTime, bars }) {
    this.waveforms[id].syncTime = syncTime
    this.waveforms[id].bars = bars
    this.waveforms[id].title = title
    const ctx = this.waveforms[id].ctx
    const width = 170 * this.pixelRatio*2 // window.devicePixelRatio + 1
    const height = 75
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000' //'#99ff00'
    ctx.fillRect(0, 0, width, height) //*2, height*2)
    // ctx.strokeStyle = '#a6e22e' //'#568208' //'#99ff00'
    const color = 'rgba(215,255,105,0.46)'
    const peak = '#f31'
    ctx.lineWidth = .5
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    const y = height
    const h = height / 2
    const s = 32
    ctx.moveTo(0, h)
    const w = Math.floor(data.length / width)
    for (let x = 0; x < width; x++) {
      ctx.beginPath()
      let max = Math.abs(Math.max(...data.subarray(x*w, x*w+w)))
      if (max > 1) {
        ctx.strokeStyle = peak
        max = 1
      }
      else ctx.strokeStyle = color

      // let sum = 0
      // for (let i = x*w; i < x*w+w; i += s) {
        // sum += Math.abs(wave[i])
      // }
      // let avg = Math.min(1, (sum / (w / s) )) * h

      ctx.moveTo(x/2/2, (h - (max * h)))
      ctx.lineTo(x/2/2, (h + (max * h)))
      ctx.stroke()
    }
    ctx.lineTo(width, h)
    ctx.stroke()
    this.redrawWaves()
  }
}

onmessage = ({ data }) => worker[data.call](data)
