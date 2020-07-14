import Regexp from './buffer/regexp.js'
import Area from './buffer/area.js'
import Point from './buffer/point.js'
import Buffer from './buffer/index.js'
import History from './history.js'
import Syntax from './syntax.js'
import themes from './themes.js'

const colors = {
  background: '#000',
  text: '#fff',
  mark: '#449',
  caret: '#77f',
  gutter: '#333',
  scrollbar: '#555',
  lineNumbers: '#888',
  titlebar: '#000',
  title: '#fff',
}

const theme = {
  ...colors,
  ...themes['wavepot'].highlights
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

const NEWLINE = Regexp.create(['newline'])
const WORDS = Regexp.create(['words'], 'g')

class Editor {
  constructor () {
    this.pos = { x: 0, y: 0 }
    this.scroll = { x: 0, y: 0 }
    this.offsetTop = 0
    this.subEditors = []
    this.buffer = new Buffer
    this.buffer.on('update', () => {
      this.history.save()
      this.updateText()
    })
    this.buffer.on('before update', () => {
      this.history.save()
      this.updateText()
    })
    this.syntax = new Syntax()
    this.drawSync = this.drawSync.bind(this)
    this.animationScrollBegin = this.animationScrollBegin.bind(this)
    this.animationScrollFrame = this.animationScrollFrame.bind(this)
  }

  async setup (data, isSubEditor) {
    const { pos, pixelRatio } = data
    const { width, height } = data.outerCanvas

    this.isSubEditor = isSubEditor
    this.isLastEditor = true

    this.pos = pos

    this.canvas = { pos, width, height, pixelRatio, padding: 3 }
    this.canvas.outer = this.canvas.outerCanvas = data.outerCanvas
    this.canvas.gutter = new OffscreenCanvas(width, height)
    this.canvas.mark = new OffscreenCanvas(width, height)
    this.canvas.text = new OffscreenCanvas(width, height)

    this.ctx = {}
    this.ctx.outer = this.canvas.outer.getContext('2d')
    this.ctx.gutter = this.canvas.gutter.getContext('2d')
    this.ctx.mark = this.canvas.mark.getContext('2d')
    this.ctx.text = this.canvas.text.getContext('2d')

    this.key = null
    this.keys = new Set

    this.applyFont(this.ctx.text)
    this.char = {}
    this.char.metrics = this.ctx.text.measureText('M')
    this.char.width = this.char.metrics.width
    this.char.height = this.char.metrics.emHeightDescent

    this.gutter = { padding: 3 }

    this.line = { padding: 3 }
    this.line.height = this.char.height + this.line.padding

    this.sizes = { loc: -1, longestLineLength: -1 }

    this.hasFocus = false

    this.tabSize = 2

    this.scrollbar = { width: 10 }
    this.scrollbar.margin = Math.ceil(this.scrollbar.width / 2)

    this.titlebar = { height: this.line.height * this.canvas.pixelRatio + 2.5 }

    this.view = {
      width: this.canvas.width,
      height: this.canvas.height - this.titlebar.height //* this.canvas.pixelRatio
    }

    this.page = {}
    this.page.lines = Math.floor(this.view.height / this.canvas.pixelRatio / this.line.height)
    this.page.height = this.line.height * this.page.lines * this.canvas.pixelRatio

    this.caret = {
      pos: new Point,
      px: new Point,
      align: 0,
      width: 2,
      height: this.line.height + this.line.padding / 2 + 2
    }

    this.markActive = false
    this.mark = new Area({
      begin: new Point({ x: -1, y: -1 }),
      end: new Point({ x: -1, y: -1 })
    })

    this.title = 'getPointTabs'

    this.history = new History(this)
    this.history.on('save', () => {
      postMessage({
        call: 'onhistory',
        length: this.history.log.length,
        needle: this.history.needle
      })
    })

    // this.setText('')
    // this.setText('/*""*/\n//hello\nfoo(\'hello\').indexOf(\'\\t\') // foo\nhi"hello"\n// yo')
    this.setText(this.getPointTabs.toString()) // + this.setup.toString())
    this.moveCaret({ x: 0, y: 0 })
    // setTimeout(() => this.scrollBy(0, -6400), 10)
    // setTimeout(() => this.scrollBy(0, -27400), 10)
    if (!this.isSubEditor && data.withSubs) {
      // const second = new Editor()
      await this.addSubEditor(new Editor())
      await this.addSubEditor(new Editor())
      await this.addSubEditor(new Editor())
      await this.addSubEditor(new Editor())
      this.draw()
    } else {
      this.draw()
    }
  }

  async addSubEditor (editor) {
    this.isLastEditor = false
    this.subEditors.forEach(editor => {
      editor.isLastEditor = false
      editor.updateSizes(true)
      editor.updateText()
    })
    await editor.setup(this.canvas, true)
    this.subEditors.push(editor)
    editor.setText(this.erase.toString())
    editor.title = 'erase'
    this.updateSizes(true)
    this.updateText()
    // this.draw()
  }

  erase (moveByChars = 0) {
    if (this.markActive) {
      this.history.save(true)
      const area = this.mark.get()
      this.moveCaret(area.begin)
      this.buffer.removeArea(area)
      this.markClear(true)
    } else {
      this.history.save()
      if (moveByChars) this.moveByChars(moveByChars)
      // const left = line[this.caret.pos.x]
      // let line = this.buffer.getLineText(this.caret.pos.y)
      // const hasLeftSymbol = ['{','[','(','\'','"','`'].includes(left)
      this.buffer.removeCharAtPoint(this.caret.pos)
      // line = this.buffer.getLineText(this.caret.pos.y)
      // const right = line[this.caret.pos.x]
      // const hasRightSymbol = ['\'','"','`','}',']',')'].includes(right)
      // if (hasLeftSymbol && hasRightSymbol) this.buffer.removeCharAtPoint(this.caret.pos)
    }

    this.updateSizes()
    this.updateText()
    this.keepCaretInView()
    this.draw()
  }

  align () {
    this.caret.align = this.caret.pos.x
  }

  delete () {
    if (this.isEndOfFile()) {
      if (this.markActive && !this.isBeginOfFile()) return this.backspace()
      return
    }
    this.erase()
  }

  backspace () {
    if (this.isBeginOfFile()) {
      if (this.markActive && !this.isEndOfFile()) return this.delete()
      return
    }
    this.erase(-1)
  }

  insert (text) {
    if (this.markActive) this.delete()

    // this.emit('input', text, this.caret.copy(), this.mark.copy(), this.mark.active);

    const matchSymbol = {
      '\'': '\'',
      '"': '"',
      '`': '`',
      '(': ')',
      '[': ']',
      '{': '}',
      ')': '(',
      ']': '[',
      '}': '{',
    }

    const line = this.buffer.getLineText(this.caret.pos.y)
    const right = line[this.caret.pos.x]
    let left = line[this.caret.pos.x - 1]
    const hasRightSymbol = ['\'','"','`','}',']',')'].includes(right)
    let hasMatchSymbol = hasRightSymbol && (matchSymbol[text] === left)

    let indent = 0
    let hasLeftSymbol

    // apply indent on enter
    if (NEWLINE.test(text)) {
      left = line.slice(0, this.caret.pos.x).trim().slice(-1)
      const isEndOfLine = this.caret.pos.x >= line.trim().length - 1
      hasLeftSymbol = ['{','[','('].includes(left)
      indent = line.match(/\S/)?.index ?? (line.length || 1) - 1
      const isBeforeIndent = this.caret.pos.x < indent

      if (hasLeftSymbol) indent += 2

      // if (isEndOfLine || hasLeftSymbol) {
      if (!isBeforeIndent) {
        text += ' '.repeat(indent)
      }
      // }
    }

    if (hasLeftSymbol && hasRightSymbol) {
      this.buffer.insert(this.caret.pos, '\n' + ' '.repeat(indent - 2))
    }

    let length = 1

    if (!(hasMatchSymbol && ['\'','"','`','}',']',')'].includes(text))) {
      length = this.buffer.insert(this.caret.pos, text, null, true)
      this.updateSizes()
    }

    this.moveByChars(length)

    if ('{' === text) this.buffer.insert(this.caret.pos, '}')
    else if ('(' === text) this.buffer.insert(this.caret.pos, ')')
    else if ('[' === text) this.buffer.insert(this.caret.pos, ']')
    else if ('\'' === text) this.buffer.insert(this.caret.pos, '\'')
    else if ('"' === text) this.buffer.insert(this.caret.pos, '"')
    else if ('`' === text) this.buffer.insert(this.caret.pos, '`')

    this.updateSizes()
    this.updateText()
    this.keepCaretInView()
    this.draw()
    // console.log('updated', this.buffer.toString())
  }

  markBegin (area) {
    if (!this.markActive) {
      this.markActive = true
      if (area) {
        this.mark.set(area)
      } else if (area !== false || this.mark.begin.x === -1) {
        this.mark.begin.set(this.caret.pos)
        this.mark.end.set(this.caret.pos)
      }
    }
  }

  markSet () {
    if (this.markActive) {
      this.mark.end.set(this.caret.pos)
      this.updateMark()
      this.draw()
    }
  }

  markSetArea (area) {
    this.markBegin(area)
    this.updateMark()
    this.draw()
  }

  markClear (force) {
    if (this.keys.has('Shift') && !force || !this.markActive) return

    postMessage({ call: 'onselection', text: '' })

    this.markActive = false
    this.mark.set({
      begin: new Point({ x: -1, y: -1 }),
      end: new Point({ x: -1, y: -1 })
    })
    this.draw()
  }

  getPointTabs ({ x, y }) {
    const line = this.buffer.getLineText(y)
    let remainder = 0
    let tabs = 0
    let tab
    let prev = 0
    while (~(tab = line.indexOf('\t', tab + 1))) {
      if (tab >= x) break
      remainder += (tab - prev) % this.tabSize
      tabs++
      prev = tab + 1
    }
    remainder += tabs
    return { tabs, remainder }
  }

  getCoordsTabs ({ x, y }) {
    const line = this.buffer.getLineText(y)

    const { tabSize } = this

    let displayIndex = 0
    let i = 0
    for (i = 0; i < line.length; i++) {
      if (displayIndex >= x) break
      if (line[i] === '\t') displayIndex += tabSize
      else displayIndex += 1
    }

    return i
  }

  moveByWords (dx) {
    let { x, y } = this.caret.pos
    const line = this.buffer.getLineText(y)

    if (dx > 0 && x >= line.length - 1) { // at end of line
      return this.moveByChars(+1) // move one char right
    } else if (dx < 0 && x === 0) { // at begin of line
      return this.moveByChars(-1) // move one char left
    }

    let words = parse(WORD, dx > 0 ? line : [...line].reverse().join``)
    let word

    if (dx < 0) x = line.length - x

    for (let i = 0; i < words.length; i++) {
      word = words[i]
      if (word.index > x) {
        x = dx > 0 ? word.index : line.length - word.index
        // this.caret.align = x
        return this.moveCaret({ x, y })
      }
    }

    // reached begin/end of file
    return dx > 0
      ? this.moveEndOfLine()
      : this.moveBeginOfLine()
  }

  moveByChars (dx) {
    let { x, y } = this.caret.pos

    if (dx < 0) { // going left
      x += dx // move left
      if (x < 0) { // when past left edge
        if (y > 0) { // and lines above
          y -= 1 // move up a line
          x = this.buffer.getLineLength(y) // and go to the end of line
        } else {
          x = 0
        }
      }
    } else if (dx > 0) { // going right
      x += dx // move right
      while (x - this.buffer.getLineLength(y) > 0) { // while past line length
        if (y === this.sizes.loc) { // on end of file
          x = this.buffer.getLineLength(y) // go to end of line on last line
          break // and exit
        }
        x -= this.buffer.getLineLength(y) + 1 // wrap this line length
        y += 1 // and move down a line
      }
    }

    this.caret.align = x
    this.moveCaret({ x, y })
  }

  moveByLines (dy) {
    let { x, y } = this.caret.pos

    if (dy < 0) { // going up
      if (y + dy > 0) { // when lines above
        y += dy // move up
      } else {
        if (y === 0) { // if already at top line
          x = 0 // move caret to begin of line
          return this.moveCaret({ x, y })
        }
        y = 0
      }
    } else if (dy > 0) { // going down
      if (y < this.sizes.loc - dy) { // when lines below
        y += dy // move down
      } else {
        if (y === this.sizes.loc) { // if already at bottom line
          x = this.buffer.getLineLength(y) // move caret to end of line
          return this.moveCaret({ x, y })
        }
        y = this.sizes.loc
      }
    }

    x = Math.min(this.caret.align, this.buffer.getLineLength(y))
    this.moveCaret({ x, y })
  }

  moveBeginOfLine (isHomeKey) {
    const y = this.caret.pos.y
    let x = 0
    if (isHomeKey) { // home key oscillates begin of visible text and begin of line
      const lineText = this.buffer.getLineText(y)
      NONSPACE.lastIndex = 0
      x = NONSPACE.exec(lineText)?.index ?? 0
      if (x === this.caret.pos.x) x = 0
    }
    this.caret.align = x
    return this.moveCaret({ x, y })
  }

  moveEndOfLine () {
    const y = this.caret.pos.y
    const x = this.buffer.getLine(y).length
    this.caret.align = Infinity
    return this.moveCaret({ x, y })
  }

  moveBeginOfFile () {
    this.caret.align = 0
    return this.moveCaret({ x: 0, y: 0 })
  }

  moveEndOfFile () {
    const y = this.sizes.loc
    const x = this.buffer.getLine(y).length
    this.caret.align = x
    return this.moveCaret({ x, y })
  }

  isBeginOfFile () {
    return this.caret.pos.x === 0 && this.caret.pos.y === 0
  }

  isEndOfFile () {
    const { x, y } = this.caret.pos
    const last = this.sizes.loc
    return y === last && x === this.buffer.getLineLength(last)
  }

  isBeginOfLine () {
    return this.caret.pos.x === 0
  }

  isEndOfLine () {
    return this.caret.pos.x === this.buffer.getLineLength(this.caret.pos.y)
  }

  moveCaret ({ x, y }) {
    this.setCaret({ x, y })
    // this.keepCaretInView()
    // this.draw()
  }

  keepCaretInView () {
    const target = this.animationRunning ? this.animationScrollTarget : this.scroll

    const p = this.caret.px

    const left = -(target.x / this.canvas.pixelRatio)
    const width =
      this.canvas.width / this.canvas.pixelRatio
    - (this.gutter.width / this.canvas.pixelRatio)
    const right = left + width
    const top = -(
      target.y / this.canvas.pixelRatio
    + this.canvas.padding
    )
    const height = this.view.height / this.canvas.pixelRatio
    const bottom = top + height

    const x = p.x //* this.char.width
    const y = p.y //* this.line.height - this.line.padding

    const dx =
      x < left ? left - x
    : x + (this.gutter.width + this.gutter.padding + this.char.width) > right ? right - (x + this.gutter.width + this.gutter.padding + this.char.width)
    : 0

    const dy =
      y < top ? top - y
    : y + this.line.height + this.line.padding > bottom ? bottom - (y + this.line.height + this.line.padding)
    : 0

    if (dx) target.x += dx * this.canvas.pixelRatio
    if (dy) target.y += dy * this.canvas.pixelRatio

    if (dx || dy) this.draw()
  }

  setCaret (point) {
    this.caret.pos.set(point)
    const { tabs } = this.getPointTabs(this.caret.pos)
    this.caret.px.set({
      x: this.char.width * (
        (this.caret.pos.x - tabs)
      + (tabs * this.tabSize))
      + this.gutter.padding
      - 1,
      y: this.line.height
      * this.caret.pos.y
      + this.canvas.padding
      - this.line.padding
      - .5
    })
  }

  setText (text) {
    this.buffer.setText(text)
    if (this.updateSizes()) this.updateText()
  }

  updateSizes (force = false) {
    let changed = false

    const loc = this.buffer.loc()
    const longestLine = this.buffer.getLongestLine(true)
    const { tabs, remainder } = this.getPointTabs({ x: longestLine.length, y: longestLine.lineNumber })
    const longestLineLength = longestLine.length + tabs + remainder

    if (loc !== this.sizes.loc || force) {
      changed = true
      this.sizes.loc = loc
      this.gutter.size = (1 + this.sizes.loc).toString().length
      this.gutter.width = this.gutter.size * this.char.width + this.gutter.padding

      this.canvas.text.height =
        (this.canvas.padding * this.canvas.pixelRatio)
      + ((1 + this.sizes.loc) * this.line.height)
      * this.canvas.pixelRatio

      this.subEditorsHeight =
        (this.subEditors.reduce((p, n) => p + n.canvas.text.height, 0)
      + this.titlebar.height * this.subEditors.length)

      this.canvas.overscrollHeight =
        // (this.subEditors.reduce((p, n) => p + n.canvas.text.height, 0)
      // + this.titlebar.height * this.subEditors.length)
        this.subEditorsHeight
      + this.canvas.text.height
      - (this.line.height + this.line.padding) * this.canvas.pixelRatio

      this.canvas.gutter.width =
        (this.gutter.width + this.canvas.padding)
      * this.canvas.pixelRatio

      this.canvas.gutter.height =
        !this.isLastEditor //subEditors.length > 0
        ? this.canvas.text.height //- this.titlebar.height * this.canvas.pixelRatio
        : this.canvas.overscrollHeight + this.view.height

      this.ctx.gutter.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
      this.updateGutter()
    }

    if (longestLineLength !== this.sizes.longestLineLength) {
      changed = true
      this.sizes.longestLineLength = longestLineLength

      this.canvas.text.width = (
        this.sizes.longestLineLength
      * this.char.width
      + this.gutter.padding
      ) * this.canvas.pixelRatio

      this.canvas.mark.width =
        this.canvas.text.width
      + this.char.width / 2 * this.canvas.pixelRatio

      this.canvas.overscrollWidth =
        Math.max(
          0,
          this.canvas.text.width
        - this.canvas.width
        + this.canvas.gutter.width
        + this.char.width * 2 * this.canvas.pixelRatio
        )
    }

    if (changed) {
      this.scrollbar.view = {
        width: this.canvas.width - this.canvas.gutter.width,
        height: this.canvas.height
      }

      this.scrollbar.area = {
        width:
          this.canvas.text.width
        + this.char.width * 2 * this.canvas.pixelRatio,
        height:
          this.canvas.text.height
        + this.subEditorsHeight
      }

      this.scrollbar.scale = {
        width: this.scrollbar.view.width / this.scrollbar.area.width,
        height: this.scrollbar.view.height / this.scrollbar.area.height
      }

      this.scrollbar.horiz = this.scrollbar.scale.width * this.scrollbar.view.width
      this.scrollbar.vert = this.scrollbar.scale.height * this.scrollbar.view.height

      this.ctx.text.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
      return true
    }
  }

  hasKeys (keys) {
    return keys.split(' ').every(key => this.keys.has(key))
  }

  getLineLength (line) {
    return this.buffer.getLine(line).length
  }

  alignCol (line) {
    return Math.min(this.caret.align, this.buffer.getLineLength(line))
  }

  applyFont (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = 'normal 9.5pt Space Mono'
  }

  updateGutter () {
    const { gutter } = this.ctx

    this.applyFont(gutter)
    gutter.fillStyle = theme.gutter
    gutter.fillRect(0, 0, this.canvas.gutter.width, this.canvas.gutter.height)
    gutter.fillStyle = theme.lineNumbers

    for (let i = 0, y = 0; i <= this.sizes.loc; i++) {
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
    text.fillStyle = theme.text

    const pieces = this.syntax.highlight(this.buffer.toString())

    let i = 0, x = 0, y = 0, lastNewLine = 0
    for (const [type, string, index] of pieces.values()) {
      y = this.canvas.padding + i * this.line.height

      if (type === 'newline') {
        lastNewLine = index + 1
        i++
        continue
      }

      text.fillStyle = theme[type]
      x = (index - lastNewLine) * this.char.width + this.gutter.padding

      text.fillText(string, x, y)
    }
  }

  updateMark () {
    const { mark } = this.ctx
    const area = this.mark.get()
    const Y = area.begin.y
    const { begin, end } = area.normalizeY()

    this.canvas.mark.height = (
      (1 + area.height) * this.line.height + this.line.padding
    ) * this.canvas.pixelRatio

    mark.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)

    mark.fillStyle = theme.mark
    const r = this.canvas.pixelRatio
    const xx = this.gutter.padding
    const yy = this.canvas.padding / r
    let ax = 0, bx = 0, ay = 0, by = 0
    const drawMarkArea = ({ begin, end }, eax = 0, ebx = 0) => {
      ax = begin.x * this.char.width
      bx = (end.x - begin.x) * this.char.width
      ay = begin.y * this.line.height - .5
      by = this.line.height + .5
      mark.fillRect(xx + ax + eax, yy + ay, bx - eax + ebx, by)
    }


    if (begin.y === end.y) {
      const { tabs: beginTabs } = this.getPointTabs({ x: begin.x, y: begin.y + Y })
      const { tabs: endTabs } = this.getPointTabs({ x: end.x, y: end.y + Y })
      begin.x += beginTabs * this.tabSize - beginTabs
      end.x += endTabs * this.tabSize - endTabs
      drawMarkArea({ begin, end })
    } else {
      for (let y = begin.y; y <= end.y; y++) {
        let lineLength = this.buffer.getLineLength(y + Y)
        const { tabs, remainder } = this.getPointTabs({ x: lineLength, y: y + Y })
        lineLength += tabs * this.tabSize - tabs

        if (y === begin.y) {
          const { tabs, remainder } = this.getPointTabs({ x: begin.x, y: begin.y + Y })
          begin.x += tabs * this.tabSize - tabs
          drawMarkArea({ begin, end: { x: lineLength } }, 0, this.char.width / 2)
        } else if (y === end.y) {
          const { tabs, remainder } = this.getPointTabs({ x: end.x, y: end.y + Y })
          end.x += tabs * this.tabSize - tabs
          drawMarkArea({ begin: { x: 0, y }, end }, -this.gutter.padding)
        } else {
          drawMarkArea({ begin: { x: 0, y }, end: { x: lineLength, y }}, -this.gutter.padding, this.char.width / 2)
        }
      }
    }

    postMessage({ call: 'onselection', text: this.buffer.getAreaText(this.mark.get()) })
  }

  clear () {
    // clear
    this.ctx.outer.fillStyle = theme.background
    this.ctx.outer.fillRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    )
  }

  drawTitle () {
    this.ctx.outer.save()
    this.ctx.outer.fillStyle = theme.titlebar
    this.ctx.outer.fillRect(
      0,
      Math.max(0, -this.offsetTop),
      this.canvas.width,
      this.titlebar.height
    )
    this.applyFont(this.ctx.outer)
    this.ctx.outer.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
    this.ctx.outer.fillStyle = theme.title
    this.ctx.outer.fillText(
      this.title,
      5,
      2.5 - Math.min(0, this.offsetTop / this.canvas.pixelRatio)
    )
    this.ctx.outer.restore()
  }

  drawText () {
    // draw text layer
    this.ctx.outer.drawImage(
      this.canvas.text,
      -this.scroll.x, // sx
      -this.scroll.y + this.offsetTop, // sy
      this.canvas.width, // sw
      this.canvas.height, // sh
      this.canvas.gutter.width, // dx
      this.titlebar.height, // dy
      this.canvas.width, // dw
      this.canvas.height // dh
    )
  }

  drawMark () {
    // draw mark layer
    const { begin } = this.mark.get()

    const y = begin.y * this.line.height * this.canvas.pixelRatio + this.offsetTop

    this.ctx.outer.drawImage(
      this.canvas.mark,
      -this.scroll.x, // sx
      -Math.min(0, (y + this.scroll.y)), //Math.max(0, y - this.scroll.y), // sy
      this.canvas.mark.width,// sw
      this.canvas.mark.height, // sh
      this.canvas.gutter.width, // dx
      Math.max(
        this.titlebar.height,
        y + this.titlebar.height + this.scroll.y
      ), // dy
      this.canvas.mark.width, // dw
      this.canvas.mark.height // dh
    )
  }

  drawCaret () {
    // draw caret
    this.ctx.outer.fillStyle = theme.caret
    this.ctx.outer.fillRect(
      this.scroll.x - 1
    + (this.caret.px.x
    + this.gutter.width
    + this.canvas.padding) * this.canvas.pixelRatio,
      this.scroll.y + this.caret.px.y * this.canvas.pixelRatio + this.titlebar.height + this.offsetTop,
      this.caret.width * this.canvas.pixelRatio,
      this.caret.height * this.canvas.pixelRatio
    )
  }

  drawVertScrollbar () {
    this.ctx.outer.strokeStyle = theme.scrollbar
    this.ctx.outer.lineWidth = this.scrollbar.width
    // this.ctx.outer.lineCap = 'round'

    const y =
    - (this.scroll.y / (
      (this.canvas.text.height + this.subEditorsHeight - this.canvas.height) || 1))
    * ((this.scrollbar.view.height - this.scrollbar.vert) || 1)


    if ((this.scrollbar.scale.height >= 1 && y > 2) || this.scrollbar.scale.height < 1) {
      this.ctx.outer.beginPath()
      this.ctx.outer.moveTo(this.canvas.width - this.scrollbar.margin, y)
      this.ctx.outer.lineTo(this.canvas.width - this.scrollbar.margin, y + this.scrollbar.vert)
      this.ctx.outer.stroke()
    }
  }

  drawHorizScrollbar () {
    this.ctx.outer.strokeStyle = theme.scrollbar
    this.ctx.outer.lineWidth = this.scrollbar.width

    const x =
    - (this.scroll.x / (this.canvas.overscrollWidth || 1))
    * ((this.scrollbar.view.width - this.scrollbar.horiz) || 1) || 0

    if (x + this.scrollbar.view.width - this.scrollbar.horiz > 12) {
      const wy = Math.min(
        this.canvas.gutter.height - this.offsetTop + this.scroll.y + this.titlebar.height
      - this.scrollbar.margin,
      )
      if (wy > this.titlebar.height - this.scrollbar.width + this.scrollbar.margin) {
        this.ctx.outer.beginPath()
        this.ctx.outer.moveTo(this.canvas.gutter.width + x, wy)
        this.ctx.outer.lineTo(this.canvas.gutter.width + x + this.scrollbar.horiz + 1, wy)
        this.ctx.outer.stroke()
      }
    }
  }

  drawGutter () {
    // draw gutter layer
    // console.log(this.scroll.y - this.offsetTop)
    this.ctx.outer.drawImage(
      this.canvas.gutter,
      0, // sx
      Math.max(0, this.offsetTop + this.scroll.y) - this.scroll.y, // sy
      this.canvas.gutter.width, // sw
      this.canvas.gutter.height, // sh
      0, // dx
      Math.max(this.titlebar.height, -this.offsetTop + this.titlebar.height), // dy
      this.canvas.gutter.width, // dw
      this.canvas.gutter.height // dh
    )
  }

  drawSync () {
    let offsetTop = this.scroll.y + this.canvas.text.height + this.titlebar.height
    this.subEditors.forEach(editor => {
      editor.offsetTop = -offsetTop
      offsetTop += editor.canvas.gutter.height + editor.titlebar.height
    })
    if (!this.isSubEditor) {
      this.clear()
      this.drawHorizScrollbar()
      this.drawTitle()
    } else {
      this.drawHorizScrollbar()
    }
    if (this.markActive) this.drawMark()
    if (this.hasFocus) this.drawCaret()
    this.subEditors.forEach(editor => editor.drawTitle())
    if (!this.isSubEditor) this.drawVertScrollbar()
    this.drawText()
    this.drawGutter()
    this.subEditors.forEach(editor => editor.drawSync())
  }

  draw () {
    cancelAnimationFrame(this.drawAnimFrame)
    this.drawAnimFrame = requestAnimationFrame(this.drawSync)
  }

  scrollBy (deltaX, deltaY, sync = false) {
    this.scroll.x += deltaX
    this.scroll.y += deltaY
    this.scroll.x = Math.max(
      -this.canvas.overscrollWidth,
      Math.min(0, this.scroll.x)
    )
    this.scroll.y = Math.max(
      -this.canvas.overscrollHeight,
      Math.min(0, this.scroll.y)
    )
    if (sync) this.drawSync()
    else this.draw()
  }

  animateScrollBy (dx, dy, type) {
    this.animationType = type ?? 'linear'

    if (!this.animationRunning) {
      this.animationRunning = true
      this.animationFrame = requestAnimationFrame(this.animationScrollBegin)
    }

    var s = this.animationScrollTarget ?? this.scroll
    this.animationScrollTarget = new Point({
      x: Math.max(-this.canvas.overscrollWidth, Math.min(0, s.x - dx)),
      y: Math.max(-this.canvas.overscrollHeight, Math.min(0, s.y - dy))
    })
  }

  animationScrollBegin () {
    this.animationFrame = requestAnimationFrame(this.animationScrollFrame)

    const s = this.scroll
    const t = this.animationScrollTarget
    if (!t) return cancelAnimationFrame(this.animationScrollFrame)

    let dx = t.x - s.x
    let dy = t.y - s.y

    dx = Math.sign(dx) * 5
    dy = Math.sign(dy) * 5

    this.scrollBy(dx, dy, true)
  }

  animationScrollFrame () {
    let speed = 165
    const s = this.scroll
    const t = this.animationScrollTarget
    if (!t) return cancelAnimationFrame(this.animationScrollFrame)

    let dx = t.x - s.x
    let dy = t.y - s.y

    const adx = Math.abs(dx)
    const ady = Math.abs(dy)

    if (ady >= this.canvas.height * 1.2) {
      speed *= 2.65
    }

    if ((adx < .5 && ady < .5) || !this.animationRunning) {
      this.animationRunning = false
      this.scroll.x = t.x
      this.scroll.y = t.y
      this.animationScrollTarget = null
      this.draw()
      return
    }

    this.animationFrame = requestAnimationFrame(this.animationScrollFrame)

    switch (this.animationType) {
      case 'linear':
        if (adx < speed * 1.9) dx = dx * (adx < speed * .65 ? adx < 9 ? .296 : .4 : .515)
        else dx = Math.sign(dx) * speed

        if (ady < speed * 1.9) dy = dy * (ady < speed * .65 ? ady < 9 ? .296 : .4 : .515)
        else dy = Math.sign(dy) * speed

        break
      case 'ease':
        dx *= 0.5
        dy *= 0.5
        break
    }

    this.scrollBy(dx, dy, true)
  }

  onmouseenter () {}
  onmouseover () {}
  onmouseout () {}

  onmousewheel ({ deltaX, deltaY }) {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
    deltaX *= 320
      this.animateScrollBy(deltaX, 0, 'linear')
    } else {
    deltaY *= 800
      this.animateScrollBy(0, deltaY, 'linear')
    }
  }

  setCaretByMouse ({ clientX, clientY }) {
    const y = Math.max(
      0,
      Math.min(
        this.sizes.loc,
        Math.floor(
          (clientY - (this.scroll.y / this.canvas.pixelRatio + this.canvas.padding + this.titlebar.height / this.canvas.pixelRatio))
        / this.line.height
        )
      )
    )

    let x = Math.max(
      0,
      Math.round(
        (clientX - (this.scroll.x + this.canvas.gutter.width + this.gutter.padding) / this.canvas.pixelRatio)
      / this.char.width
      )
    )

    const actualIndex = this.getCoordsTabs({ x, y })

    x = Math.max(
      0,
      Math.min(
        actualIndex,
        this.buffer.getLineLength(y)
      )
    )

    this.caret.align = x
    this.setCaret({ x, y })
  }

  onmouseup () {}

  onmousedown (e) {
    if (e.left) {
      this.markClear()
      this.updateMark()
      this.setCaretByMouse(e)
      this.markBegin()
      this.draw()
    }
  }

  onmousemove (e) {
    if (e.left) {
      this.setCaretByMouse(e)
      this.markSet()
      this.keepCaretInView()
      this.draw()
    }
  }

  onkeydown (e) {
    this.keys.delete(e.key.toLowerCase())
    this.keys.delete(e.key.toUpperCase())
    this.keys.add(e.key)
    this.keys.add(e.which)
    this.keys.add(e.char)
    this.key = e.key.length === 1 ? e.key : null

    if (!e.cmdKey && this.key) return this.insert(this.key)
    if (e.key === 'Enter') return this.insert('\n')
    if (e.key === 'Tab') return this.insert(' '.repeat(this.tabSize))
    if (!e.cmdKey && e.key === 'Backspace') return this.backspace()
    if (!e.cmdKey && !e.shiftKey && e.key === 'Delete') return this.delete()

    this.pressed = [e.cmdKey && 'Cmd', e.key].filter(Boolean).join(' ')

    // navigation
    if (e.shiftKey && e.key !== 'Shift') this.markBegin()
    else if (e.key !== 'Delete' && !e.cmdKey) this.markClear()

    switch (this.pressed) {
      case 'Cmd /': {

        let add;
        let area;
        let text;

        let prevArea = this.mark.copy()

        let clear = false;
        let caret = this.caret.pos.copy();
        let align = this.caret.align

        let matchIndent = false

        if (!this.markActive) {
          clear = true;
          this.markClear();
          this.moveBeginOfLine();
          this.markBegin();
          this.moveEndOfLine();
          this.markSet();
          area = this.mark.get();
          text = this.buffer.getAreaText(area);
          matchIndent = text.match(/\S/)?.index < caret.x
        } else {
          area = this.mark.get();
          area.end.y += area.end.x > 0 ? 1 : 0
          area.begin.x = 0
          area.end.x = 0
          // area.addBottom(area.end.x > 0 ? 1 : 0).setLeft(0, 0);
          text = this.buffer.getAreaText(area);
          matchIndent = true
        }

        //TODO: should check if last line has // also
        if (text.trimLeft().substr(0,2) === '//') {
          add = -3;
          text = text.replace(/^(.*?)\/\/ (.+)/gm, '$1$2');
        } else {
          add = +3;
          text = text.replace(/^([\s]*)(.+)/gm, '$1// $2');
        }

        this.mark.set(area)
        this.insert(text);
        this.mark.set(prevArea)
        this.mark.begin.x += this.mark.begin.x > 0 ? add : 0
        this.mark.end.x += this.mark.end.x > 0 ? add : 0
        // this.mark.set(prevArea.addRight(add))

        // this.mark.set(area.addRight(add));
        this.markActive = !clear;

        this.caret.align = align

        if (matchIndent) {
          caret.x += add
          this.caret.align += add
        }
        this.setCaret(caret);
        this.keepCaretInView()

        if (clear) {
          // this.markClear();
        }
        this.updateMark()
        this.draw()
      }
      return
      case 'Cmd D': {
        this.align()
        const area = this.mark.get()
        if (area.isEmpty()) {
          this.buffer.insert(
            { x: 0, y: this.caret.pos.y },
            this.buffer.getLineText(this.caret.pos.y)
          + (this.caret.pos.y === this.buffer.loc() ? '\n' : '')
          )
          this.updateSizes()
          this.updateText()
          this.moveByLines(+1)
          this.markClear(true)
        } else if (area.begin.y === area.end.y) {
          const text = this.buffer.getAreaText(area)
          this.buffer.insert(this.caret.pos, text)
          this.updateSizes()
          this.updateText()
          this.moveByChars(text.length)
          this.mark.addRight(text.length)
          this.updateMark()
        } else {
          let text = ''
          let addY = 0
          if (area.end.x > 0) {
            addY = 1
            text = '\n'
            area.end.x = this.buffer.getLineLength(area.end.y)
          }
          area.begin.x = 0
          text = text + this.buffer.getAreaText(area)
          this.buffer.insert(area.end, text)
          area.end.y += addY
          this.updateSizes()
          this.updateText()
          this.moveByLines(area.height)
          this.mark.shiftByLines(area.height)
          this.updateMark()
        }
      }
      return

      case 'Delete': case 'Cmd x':
        if (!this.mark.isEmpty()) {
          this.delete()
        } else {
          this.markClear(true)
          this.moveBeginOfLine()
          this.markBegin()
          this.moveByLines(+1)
          this.markSet()
          this.delete()
        }
        break
      case 'Cmd a'          : this.markClear(true); this.moveBeginOfFile(); this.markBegin(); this.moveEndOfFile(); this.markSet(); break
      case 'Cmd Backspace'  : this.markBegin(); e.shiftKey ? this.moveBeginOfLine() : this.moveByWords(-1); this.markSet(); this.delete(); break
      case 'Cmd Delete'     : this.markBegin(); e.shiftKey ? this.moveEndOfLine() : this.moveByWords(+1); this.markSet(); this.delete(); this.align(); break
      case 'Cmd ArrowLeft'  : this.moveByWords(-1); this.align(); break
      case 'Cmd ArrowRight' : this.moveByWords(+1); this.align(); break
      case 'Cmd ArrowUp':
        if (e.shiftKey) {
          this.align()
          this.markBegin(false)
          const area = this.mark.get()
          if (!area.isEmpty() && area.end.x === 0) {
            area.end.y = area.end.y - 1
            area.end.x = this.buffer.getLine(area.end.y).length
          }
          if (this.buffer.moveAreaByLines(-1, area)) {
            this.updateSizes()
            this.updateText()
            this.mark.shiftByLines(-1)
            this.moveByLines(-1)
            this.updateMark()
          }
        } else {
          this.scrollBy(0, (this.line.height) * this.canvas.pixelRatio)
        }
        break
      case 'Cmd ArrowDown':
        if (e.shiftKey) {
          this.align()
          this.markBegin(false)
          const area = this.mark.get()
          if (!area.isEmpty() && area.end.x === 0) {
            area.end.y = area.end.y - 1
            area.end.x = this.buffer.getLine(area.end.y).length
          }
          if (this.buffer.moveAreaByLines(+1, area)) {
            this.updateSizes()
            this.updateText()
            this.mark.shiftByLines(+1)
            this.moveByLines(+1)
            this.updateMark()
          }
        } else {
          this.scrollBy(0, -(this.line.height) * this.canvas.pixelRatio)
        }
        break
      case 'ArrowLeft'      : this.moveByChars(-1); break
      case 'ArrowRight'     : this.moveByChars(+1); break
      case 'ArrowUp'        : this.moveByLines(-1); break
      case 'ArrowDown'      : this.moveByLines(+1); break
      case 'PageUp'         : this.animateScrollBy(0, -this.page.height, 'ease'); this.moveByLines(-this.page.lines); break
      case 'PageDown'       : this.animateScrollBy(0, +this.page.height, 'ease'); this.moveByLines(+this.page.lines); break
      case 'Home'           : this.moveBeginOfLine(true); break
      case 'End'            : this.moveEndOfLine(); break
    }

    if (e.shiftKey) this.markSet()
    this.keepCaretInView()
    this.draw()
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

  onpaste ({ text }) {
    this.insert(text)
  }

  onhistory ({ needle }) {
    if (needle !== this.history.needle) {
      if (needle < this.history.needle) {
        this.history.undo(needle)
      } else if (needle > this.history.needle) {
        this.history.redo(needle)
      }
      this.updateSizes()
      this.updateText()
      this.updateMark()
      this.keepCaretInView()
      this.draw()
    }
  }

  onblur () {
    this.hasFocus = false
    this.keys.clear()
    this.draw()
  }

  onfocus () {
    this.hasFocus = true
    this.keys.clear()
    this.draw()
  }

  onresize () {
    // TODO
  }
}

const fontFace = new FontFace(
  'Space Mono',
  `local('Space Mono'),
   local('SpaceMono-Regular'),
   url('/fonts/SpaceMono-Regular.woff2') format('woff2')`,
);
// add it to the list of fonts our worker supports
self.fonts.add(fontFace);

// async function loadFonts() {
//   const font = new FontFace('myfont', 'url()');
//   // wait for font to be loaded
//   await font.load();
//   // add font to document
//   self.fonts.add(font);
//   // enable font with CSS class
//   // document.body.classList.add('fonts-loaded');
// }

fontFace.load().then(() => {
  // console.log('loaded')
  const editor = new Editor()
  onmessage = ({ data }) => editor[data.call](data)
  postMessage({ call: 'onready' })
})
