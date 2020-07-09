const colors = {
  back: '#000',
  text: '#fff',
  caret: '#77f',
  gutter: '#333',
  scrollbar: '#555',
  lineNumbers: '#888'
}

const lines = text => text.split(/\n/g)
const NONSPACE = /[^\s]/g
const WORD = /[\s]{2,}|[./\\\(\)"'\-:,.;<>~!@#$%^&*\|\+=\[\]{}`~\?\b ]{1}/g
const parse = (regexp, text) => {
  regexp.lastIndex = 0
  let word
  const words = []
  while (word = regexp.exec(text)) words.push(word)
  return words
}

class Editor {
  constructor () {
    this.pos = { x: 0, y: 0 }
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

    this.key = null
    this.keys = new Set

    this.applyFont(this.ctx.text)
    this.char = {}
    this.char.metrics = this.ctx.text.measureText('M')
    this.char.width = this.char.metrics.width
    this.char.height = this.char.metrics.emHeightDescent

    this.gutter = { padding: 3 }

    this.line = { padding: 2 }
    this.line.height = this.char.height + this.line.padding
    this.line.page = Math.floor(this.canvas.height / this.canvas.pixelRatio / this.line.height)

    this.caret = {
      width: 2,
      height: this.line.height + this.line.padding / 2 + 2
    }

    this.text = ''
    this.lines = []

    this.setText(this.setup.toString())
    // this.setCaret({ col: this.lines[27].length, line: 55, align: 0 })
    this.setCaret({ col: 0 /*this.lines[27].length*/, line: 27, align: 0 })
    this.keepCaretInView()
    this.draw()
  }

  keepCaretInView () {
    const { col, line } = this.caret

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
    : x + (this.gutter.width + this.gutter.padding + this.char.width) > right ? right - (x + this.gutter.width + this.gutter.padding + this.char.width)
    : 0

    const dy =
      y < top ? top - y
    : y + this.line.height + this.line.padding > bottom ? bottom - (y + this.line.height + this.line.padding)
    : 0

    if (dx) this.pos.x += dx * this.canvas.pixelRatio
    if (dy) this.pos.y += dy * this.canvas.pixelRatio

    if (dx || dy) this.draw()
  }

  setCaret ({ col, line, align }) {
    this.caret.col = col
    this.caret.line = line
    this.caret.align = align
    this.caret.x = col * this.char.width + this.gutter.padding - 1
    this.caret.y = line * this.line.height + this.canvas.padding - this.line.padding - 1
  }

  setText (text) {
    const prevLinesLength = this.lines.length

    this.text = text
    this.lines = lines(this.text)

    this.longestLineLength = Math.max(...this.lines.map(line => line.length))

    this.gutter.size = this.lines.length.toString().length
    this.gutter.width = this.gutter.size * this.char.width + this.gutter.padding

    this.canvas.text.width = (
      this.longestLineLength
    * this.char.width
    + this.gutter.padding
    ) * this.canvas.pixelRatio

    this.canvas.text.height =
      (this.canvas.padding * this.canvas.pixelRatio)
    + (this.lines.length * this.line.height)
    * this.canvas.pixelRatio

    if (prevLinesLength !== this.lines.length) {
      this.canvas.overscrollHeight =
        this.canvas.text.height
      - (this.line.height + this.line.padding) * this.canvas.pixelRatio

      this.canvas.gutter.width =
        (this.gutter.width + this.canvas.padding)
      * this.canvas.pixelRatio

      this.canvas.gutter.height =
        this.canvas.overscrollHeight + this.canvas.height

      this.ctx.gutter.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
      this.updateGutter()
    }

    this.canvas.overscrollWidth =
      Math.max(
        0,
        this.canvas.text.width
      - this.canvas.width
      + this.canvas.gutter.width
      + this.char.width * 2 * this.canvas.pixelRatio
      )

    this.ctx.text.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
    this.updateText()
  }

  applyFont (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = 'normal 9pt Liberation Mono'
  }

  updateGutter () {
    const { gutter } = this.ctx

    this.applyFont(gutter)
    gutter.fillStyle = colors.gutter
    gutter.fillRect(0, 0, this.canvas.gutter.width, this.canvas.gutter.height)
    gutter.fillStyle = colors.lineNumbers

    for (let i = 0, y = 0; i < this.lines.length; i++) {
      y = this.canvas.padding + i * this.line.height
      gutter.fillText(
        (1 + i).toString().padStart(this.gutter.size),
        this.canvas.padding,
        y
      )
    }
  }

  updateText () {
    const { text } = this.ctx

    this.applyFont(text)
    text.clearRect(0, 0, this.canvas.text.width, this.canvas.text.height)
    text.fillStyle = colors.text

    let y = 0
    for (const [i, lineText] of this.lines.entries()) {
      y = this.canvas.padding + i * this.line.height

      text.fillText(
        lineText,
        this.gutter.padding,
        y
      )
    }
  }

  clear () {
    // clear
    this.ctx.outer.fillStyle = colors.back
    this.ctx.outer.fillRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    )
  }

  drawText () {
    // draw text layer
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
  }

  drawCaret () {
    // draw caret
    this.ctx.outer.fillStyle = colors.caret
    this.ctx.outer.fillRect(
      this.pos.x - 1
    + (this.caret.x
    + this.gutter.width
    + this.canvas.padding) * this.canvas.pixelRatio,
      this.pos.y + this.caret.y * this.canvas.pixelRatio,
      this.caret.width * this.canvas.pixelRatio,
      this.caret.height * this.canvas.pixelRatio
    )
  }

  drawScrollbars () {
    // draw scrollbars
    const scrollbar = { width: 40 }
    scrollbar.margin = scrollbar.width / 2 / 2

    this.ctx.outer.strokeStyle = colors.scrollbar
    this.ctx.outer.lineWidth = scrollbar.width
    // this.ctx.outer.lineCap = 'round'

    const view = {
      height: this.canvas.height,
      width: this.canvas.width - this.canvas.gutter.width
    }

    const area = {
      width:
        this.canvas.text.width
      + this.char.width * 2 * this.canvas.pixelRatio,
      height:
        this.canvas.text.height
    }

    const scale = {
      width: view.width / area.width,
      height: view.height / area.height
    }

    scrollbar.horiz = scale.width * view.width
    scrollbar.vert = scale.height * view.height

    const x =
    - (this.pos.x / (this.canvas.overscrollWidth || 1))
    * ((view.width - scrollbar.horiz) || 1) || 0

    const y =
    - (this.pos.y / ((this.canvas.text.height - this.canvas.height) || 1))
    * ((view.height - scrollbar.vert) || 1)

    if (x + view.width - scrollbar.horiz > 12) {
      this.ctx.outer.beginPath()
      this.ctx.outer.moveTo(this.canvas.gutter.width + x, this.canvas.height - scrollbar.margin)
      this.ctx.outer.lineTo(this.canvas.gutter.width + x + scrollbar.horiz + 1, this.canvas.height - scrollbar.margin)
      this.ctx.outer.stroke()
    }

    if ((scale.height >= 1 && y > 2) || scale.height < 1) {
      this.ctx.outer.beginPath()
      this.ctx.outer.moveTo(this.canvas.width - scrollbar.margin, y)
      this.ctx.outer.lineTo(this.canvas.width - scrollbar.margin, y + scrollbar.vert)
      this.ctx.outer.stroke()
    }
  }

  drawGutter () {
    // draw gutter layer
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

  draw () {
    cancelAnimationFrame(this.animFrame)
    this.animFrame = requestAnimationFrame(() => {
      this.clear()
      this.drawScrollbars()
      this.drawText()
      this.drawCaret()
      this.drawGutter()
    })
  }

  onmousewheel ({ deltaX, deltaY }) {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      this.pos.x += deltaX * 280
      this.pos.x = Math.max(
        -this.canvas.overscrollWidth,
        Math.min(0, this.pos.x)
      )
    } else {
      this.pos.y -= deltaY * 600
      this.pos.y = Math.max(
        -this.canvas.overscrollHeight,
        Math.min(0, this.pos.y)
      )
    }
    this.draw()
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
    return keys.split(' ').every(key => this.keys.has(key))
  }

  alignCol (line) {
    return Math.min(this.caret.align, this.lines[line]?.length ?? 0)
  }

  onkeydown (e) {
    this.keys.delete(e.key.toLowerCase())
    this.keys.delete(e.key.toUpperCase())
    this.keys.add(e.key)
    this.keys.add(e.which)
    this.keys.add(e.char)
    this.key = e.key.length === 1 ? e.key : null

    // navigation
    let { col, line, align } = this.caret
    let prevCol = col
    const alignCol = () => Math.min(align, this.lines[line]?.length ?? 0)
    if (e.cmdKey && e.key === 'ArrowRight') {
      col =
        parse(WORD, this.lines[line])
        .find(word => word.index > col)
        ?.index
        ?? this.lines[line].length
      if (prevCol === col) col = Infinity
    } else if (e.cmdKey && e.key === 'ArrowLeft') {
      col = this.lines[line].length - col
      col =
        parse(WORD, [...this.lines[line]].reverse().join``)
        .find(word => word.index > col)
        ?.index
        ?? this.lines[line].length
      col = this.lines[line].length - col
      if (prevCol === col) col = -Infinity
    } else if (e.key === 'Home') {
      NONSPACE.lastIndex = 0
      align = col = NONSPACE.exec(this.lines[line])?.index ?? 0
      if (prevCol === col) align = col = 0
    } else if (e.key === 'End') {
      align = col = this.lines[line].length
    } else if (e.key === 'PageUp') {
      line -= this.line.page
      this.pos.y = -Math.max(
        0,
      - this.pos.y
      - (this.line.height
      * this.line.page
      * this.canvas.pixelRatio)
      )
      col = this.alignCol(line)
    } else if (e.key === 'PageDown') {
      line += this.line.page
      this.pos.y = -Math.min(
        Math.max(
          0,
          this.canvas.text.height
        - this.canvas.height
        + this.canvas.padding
        * this.canvas.pixelRatio
        ),
      - this.pos.y
      + (this.line.height
      * this.line.page
      * this.canvas.pixelRatio)
      )
      col = this.alignCol(line)
    } else if (e.key === 'ArrowLeft') {
      col--
    } else if (e.key === 'ArrowUp') {
      line--
      col = this.alignCol(line)
    } else if (e.key === 'ArrowRight') {
      col++
    } else if (e.key === 'ArrowDown') {
      line++
      col = this.alignCol(line)
    }
    // navigation boundaries
    if (col < 0) {
      line--
      if (line < 0) {
        col = 0
        line = 0
      } else {
        col = this.lines[line].length
      }
    } else if (col > this.lines[line]?.length) {
      line++
      col = 0
    }
    if (line < 0) {
      line = 0
    } else if (line > this.lines.length - 1) {
      line = this.lines.length - 1
      col = this.lines[line].length
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      align = col
    }

    if (col !== this.caret.col || line !== this.caret.line) {
      this.setCaret({ col, line, align })
      this.keepCaretInView()
      this.draw()
    } else {
      this.keepCaretInView()
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
}

const editor = new Editor()
onmessage = ({ data }) => editor[data.call](data)
