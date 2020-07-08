const colors = {
  back: '#000',
  text: '#fff',
  gutter: '#333',
  lineNumbers: '#888'
}

const lines = text => text.split(/\n/g)

class Editor {
  constructor () {
    this.pos = { x: -601, y: -67 }
  }

  async setup (data) {
    const { pixelRatio } = data
    const { width, height } = data.outerCanvas

    this.canvas = { width, height, pixelRatio, padding: 10 }
    this.canvas.outer = data.outerCanvas
    this.canvas.gutter = new OffscreenCanvas(width, height)
    this.canvas.text = new OffscreenCanvas(width, height)

    this.ctx = {}
    this.ctx.outer = this.canvas.outer.getContext('2d')
    this.ctx.gutter = this.canvas.gutter.getContext('2d')
    this.ctx.text = this.canvas.text.getContext('2d')

    this.applyFont()
    this.char = {}
    this.char.metrics = this.ctx.text.measureText('M')
    this.char.width = this.char.metrics.width
    this.char.height = this.char.metrics.emHeightDescent

    this.gutter = { padding: 5 }

    this.line = { padding: 2 }
    this.line.height = this.char.height + this.line.padding

    this.setText(this.setup.toString())

    this.animationFrame(() => {
      this.drawText()
      this.clear()
      this.draw()
    })
  }

  setText (text) {
    this.text = text
    this.lines = lines(this.text)

    this.longestLineLength = Math.max(...this.lines.map(line => line.length))

    this.canvas.overscrollHeight = -(
      -(this.lines.length - 1)
      * this.line.height
      - this.canvas.padding
      + this.line.padding
    ) * this.canvas.pixelRatio

    this.gutter.size = this.lines.length.toString().length
    this.gutter.width = this.gutter.size * this.char.width + this.gutter.padding

    this.canvas.text.width = (
      this.longestLineLength
    * this.char.width
    + this.gutter.width
    + this.gutter.padding
    + this.canvas.padding
    ) * this.canvas.pixelRatio
    this.canvas.text.height =
      (this.canvas.padding * 2)
    + (this.lines.length * this.line.height)
    * this.canvas.pixelRatio

    this.canvas.gutter.width = (this.gutter.width + this.canvas.padding) * this.canvas.pixelRatio
    this.canvas.gutter.height = this.canvas.text.height + this.canvas.overscrollHeight
    this.ctx.gutter.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
    this.ctx.text.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
  }

  applyFont () {
    this.ctx.gutter.textBaseline =
    this.ctx.text.textBaseline = 'top'
    this.ctx.gutter.font =
    this.ctx.text.font = 'normal 9pt Liberation Mono'
  }

  drawText () {
    const { gutter, text } = this.ctx
    gutter.fillStyle = colors.gutter
    gutter.fillRect(0, 0, this.canvas.gutter.width, this.canvas.gutter.height)
    text.fillStyle = '#f00'
    text.fillRect(0, 0, this.canvas.text.width, this.canvas.text.height)

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
        this.canvas.padding + this.gutter.width + this.gutter.padding,
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
    console.log(this.pos)
    // draw text
    this.ctx.outer.drawImage(
      this.canvas.text,
      -this.pos.x,
      -this.pos.y,
      this.canvas.width,
      this.canvas.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    )

    // draw gutter
    // this.ctx.outer.drawImage(
    //   this.canvas.gutter,
    //   0,
    //   -this.pos.y,
    //   this.canvas.gutter.width,
    //   this.canvas.gutter.height,
    //   0,
    //   0,
    //   this.canvas.gutter.width,
    //   this.canvas.gutter.height
    // )
  }

  onmousewheel ({ deltaX, deltaY }) {
    this.pos.x += deltaX * 300
    this.pos.y -= deltaY * 650

    this.pos.x = Math.min(0, this.pos.x)

    this.pos.y = Math.max(
      -this.canvas.overscrollHeight,
      Math.min(0, this.pos.y)
    )

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
          ((clientY - ((this.pos.y/2) + this.canvas.padding)))
        / this.line.height
        + 1
        )
      )
    )
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
