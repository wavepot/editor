const colors = {
  back: '#000',
  text: '#fff',
  caret: '#77f',
  gutter: '#333',
  lineNumbers: '#888'
}

const lines = text => text.split(/\n/g)

class Editor {
  constructor () {
    this.pos = { x: 0, y: 0 }
  }

  async setup (data) {
    const { pixelRatio } = data
    const { width, height } = data.outerCanvas

    this.canvas = { width, height, pixelRatio, padding: 5 }
    this.canvas.outer = data.outerCanvas
    this.canvas.gutter = new OffscreenCanvas(width, height)
    this.canvas.text = new OffscreenCanvas(width, height)

    this.ctx = {}
    this.ctx.outer = this.canvas.outer.getContext('2d')
    this.ctx.gutter = this.canvas.gutter.getContext('2d')
    this.ctx.text = this.canvas.text.getContext('2d')

    this.key = null
    this.keys = new Set

    this.applyFont()
    this.char = {}
    this.char.metrics = this.ctx.text.measureText('M')
    this.char.width = this.char.metrics.width
    this.char.height = this.char.metrics.emHeightDescent

    this.gutter = { padding: 5 }

    this.line = { padding: 2 }
    this.line.height = this.char.height + this.line.padding

    this.setText(this.setup.toString())
    this.setCaret({ col: 3, line: 0 })

    this.animationFrame(() => {
      this.drawText()
      this.drawCaret()
      this.clear()
      this.draw()
    })
  }

  setCaret ({ col, line }) {
    this.caret = { col, line }

    const left = -(this.pos.x / this.canvas.pixelRatio)
    const width =
      this.canvas.width / this.canvas.pixelRatio
    - (this.gutter.width / this.canvas.pixelRatio)
    const right = left + width
    const top = -(
      this.pos.y / this.canvas.pixelRatio
    + this.canvas.padding
    )
    const height = this.canvas.height / this.canvas.pixelRatio
    const bottom = top + height

    const x = col * this.char.width
    const y = line * this.line.height - this.line.padding

    const dx =
      x < left ? left - x
    : x + (this.gutter.width + this.gutter.padding) > right ? right - (x + this.gutter.width + this.gutter.padding)
    : 0

    const dy =
      y < top ? top - y
    : y + this.line.height + this.line.padding > bottom ? bottom - (y + this.line.height + this.line.padding)
    : 0

    if (dx) this.pos.x += dx * this.canvas.pixelRatio
    if (dy) this.pos.y += dy * this.canvas.pixelRatio

    this.animationFrame(() => {
      this.drawText()
      this.drawCaret()
      this.clear()
      this.draw()
    })
  }

  setText (text) {
    this.text = text
    this.lines = lines(this.text)

    this.longestLineLength = Math.max(...this.lines.map(line => line.length))

    this.canvas.overscrollHeight = -(
      - (this.lines.length - 1)
      * this.line.height
      - this.canvas.padding
      + this.line.padding
    ) * this.canvas.pixelRatio

    this.gutter.size = this.lines.length.toString().length
    this.gutter.width = this.gutter.size * this.char.width + this.gutter.padding

    this.canvas.text.width = (
      this.longestLineLength
    * this.char.width
    + this.gutter.padding
    ) * this.canvas.pixelRatio

    this.canvas.text.height =
      (this.canvas.padding * 2)
    + (this.lines.length * this.line.height)
    * this.canvas.pixelRatio

    this.canvas.gutter.width =
      (this.gutter.width + this.canvas.padding)
    * this.canvas.pixelRatio

    this.canvas.gutter.height =
      this.canvas.text.height
    + Math.max(
        this.canvas.overscrollHeight,
        this.canvas.height
      - this.char.height
      - (this.canvas.padding * this.canvas.pixelRatio) * 2
      )

    this.canvas.overscrollWidth =
      Math.min(
        Math.max(0, -(this.canvas.width - this.canvas.text.width)),
        - this.canvas.text.width
        + this.canvas.width
        - this.canvas.gutter.width
        - this.canvas.padding * this.canvas.pixelRatio
      )

    this.ctx.gutter.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
    this.ctx.text.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
  }

  applyFont () {
    this.ctx.gutter.textBaseline =
    this.ctx.text.textBaseline = 'top'
    this.ctx.gutter.font =
    this.ctx.text.font = 'normal 9pt Liberation Mono'
  }

  drawCaret () {
    const { col, line } = this.caret
    const { text } = this.ctx
    text.fillStyle = colors.caret
    text.fillRect(
      col * this.char.width + this.gutter.padding - 1,
      line * this.line.height + this.canvas.padding - this.line.padding - 1,
      2,
      this.line.height + this.line.padding / 2 + 2
    )
  }

  drawText () {
    const { gutter, text } = this.ctx
    gutter.fillStyle = colors.gutter
    gutter.fillRect(0, 0, this.canvas.gutter.width, this.canvas.gutter.height)
    // text.fillStyle = '#f00'
    text.clearRect(0, 0, this.canvas.text.width, this.canvas.text.height)

    this.applyFont()

    gutter.fillStyle = colors.lineNumbers
    text.fillStyle = colors.text

    let posY = 0
    for (const [i, lineText] of this.lines.entries()) {
      posY = this.canvas.padding + i * this.line.height

      gutter.fillText(
        (1 + i).toString().padStart(this.gutter.size),
        this.canvas.padding,
        posY
      )

      text.fillText(
        lineText,
        this.gutter.padding,
        posY
      )
    }
  }

  clear () {
    this.ctx.outer.fillStyle = colors.back
    this.ctx.outer.fillRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    )
  }

  draw () {
    // draw text
    this.ctx.outer.drawImage(
      this.canvas.text,
      -this.pos.x,
      -this.pos.y,
      this.canvas.width,
      this.canvas.height,
      this.canvas.gutter.width,
      0,
      this.canvas.width,
      this.canvas.height
    )

    // draw gutter
    this.ctx.outer.drawImage(
      this.canvas.gutter,
      0,
      -this.pos.y,
      this.canvas.gutter.width,
      this.canvas.gutter.height,
      0,
      0,
      this.canvas.gutter.width,
      this.canvas.gutter.height
    )
  }

  onmousewheel ({ deltaX, deltaY }) {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      this.pos.x += deltaX * 280
      this.pos.x = Math.max(
        this.canvas.overscrollWidth,
        Math.min(0, this.pos.x)
      )
    } else {
      this.pos.y -= deltaY * 600
      this.pos.y = Math.max(
        - this.canvas.overscrollHeight,
        Math.min(0, this.pos.y)
      )
    }

    this.animationFrame(() => {
      this.clear()
      this.draw()
    })
  }

  animationFrame (fn) {
    cancelAnimationFrame(this.animFrame)
    this.animFrame = requestAnimationFrame(fn)
  }

  onmousedown ({ clientX, clientY }) {
    const lineNumber = Math.max(
      1,
      Math.min(
        this.lines.length,
        Math.floor(
          (clientY - (this.pos.y / 2 + this.canvas.padding))
        / this.line.height
        + 1
        )
      )
    )
  }

  hasKeys (keys) {
    return keys.every(key => this.keys.has(key))
  }

  onkeydown (e) {
    this.keys.delete(e.key.toLowerCase())
    this.keys.delete(e.key.toUpperCase())
    this.keys.add(e.key)
    this.keys.add(e.which)
    this.keys.add(e.char)
    this.key = e.key.length === 1 ? e.key : null

    let { col, line } = this.caret
    if (e.key === 'ArrowLeft') {
      col--
      if (col < 0) {
        line--
        if (line < 0) {
          col = 0
          line = 0
        } else {
          col = this.lines[line].length
        }
      }
    } else if (e.key === 'ArrowUp') {
      line--
      if (line < 0) {
        line = 0
      }
    } else if (e.key === 'ArrowRight') {
      col++
      if (col > this.lines[line].length) {
        line++
        if (line > this.lines.length - 1) {
          line = this.lines.length - 1
          col = this.lines[line].length
        } else {
          col = 0
        }
      }
    } else if (e.key === 'ArrowDown') {
      line++
      if (line > this.lines.length - 1) {
        line = this.lines.length - 1
      }
    }
    if (col !== this.caret.col || line !== this.caret.line) {
      this.setCaret({ col, line })
    }
  }

  onkeyup (e) {
    this.keys.delete(e.key.toLowerCase())
    this.keys.delete(e.key.toUpperCase())
    this.keys.delete(e.key)
    this.keys.delete(e.which)
    this.keys.delete(e.char)
    if (e.key === this.key) {
      this.key = null
    }
  }

  onblur () {
    this.keys.clear()
  }

  onfocus () {
    this.keys.clear()
  }

  onresize () {
    // TODO
  }

  setScale ({ scale: s }) {
    // if (s > 0) {
    this.scale += s * 0.01
    // } else {
      // this.scale -= s
    // }
    // this.scale = Math.round(this.scale)
    // this.scale = Math.round(this.scale - (this.scale % 2))
    // console.log(this.scale)
    // this.canvas.width = this.canvas.width + s
    // this.canvas.height = this.canvas.height + s
    this.draw()
  }
}
// loadFonts()
const editor = new Editor()
onmessage = ({ data }) => editor[data.call](data)
