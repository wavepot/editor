const isWorker = typeof window === 'undefined' && typeof postMessage !== 'undefined'

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
  mark: '#43b',
  caret: '#f4f4f4',
  gutter: '#333',
  scrollbar: '#555',
  lineNumbers: '#888',
  titlebar: '#000',
  title: '#557',
}

const theme = {
  ...colors,
  ...themes['wavepot'].highlights
}

const Open = {
  '{': 'curly',
  '[': 'square',
  '(': 'parens'
}

const Close = {
  '}': 'curly',
  ']': 'square',
  ')': 'parens'
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

export default class PseudoWorker {
  constructor () {
    this.editor = new Editor()
    this.editor.postMessage = data => this.onmessage({ data })
    setTimeout(() => {
      this.onmessage({ data: { call: 'onready' } })
    })
  }

  postMessage (data) {
    this.editor[data.call](data)
  }
}

class Editor {
  constructor (data = {}) {
    this.postMessage = self?.postMessage.bind(self)
    this.id = data.id ?? (Math.random() * 10e6 | 0).toString(36)
    this.title = data.title ?? 'untitled (ctrl+m to rename)'
    this.value = data.value
    this.fontSize = data.fontSize ?? '8.4pt'
    this.pos = new Point
    this.color = theme.variable
    this.block = new Area
    this.scroll = { pos: new Point, target: new Point }
    this.offsetTop = 0
    this.realOffsetTop = 0
    this.subEditors = []
    this.controlEditor = this
    this.focusedEditor = null
    this.buffer = new Buffer
    this.syntax = new Syntax
    this.drawSync = this.drawSync.bind(this)
    this.highlightBlock = this.highlightBlock.bind(this)
    // this.scrollAnim = { speed: 165, isRunning: false, animFrame: null }
    // this.scrollAnim.threshold = { tiny: 9, near: .35, mid: 1.9, far: 1 }
    // this.scrollAnim.scale = { tiny: .296, near: .42, mid: .815, far: 2.85 }
    this.scrollAnim = { speed: 166, isRunning: false, animFrame: null }
    this.scrollAnim.threshold = { tiny: 21, near: .29, mid: 1.9, far: .1 }
    this.scrollAnim.scale = { tiny: .425, near: .71, mid: .802, far: 2.65 }
    this.animScrollStart = this.animScrollStart.bind(this)
    this.animScrollTick = this.animScrollTick.bind(this)

    // uncomment below for verbose debugging
    // this.verboseDebug()
  }

  verboseDebug () {
    Object.getOwnPropertyNames(this.constructor.prototype)
      .forEach(key => {
        const method = this[key]
        const err = {}
        this[key] = (...args) => {
          Error.captureStackTrace(err)
          const parts = err.stack.split('\n').slice(0, 3).pop().trim().split(' ')
          console.log((key + `(${JSON.stringify(args[0] ?? '')})`).padEnd(30), parts[1]?.padEnd(20), parts[2]?.split(':')?.slice(-2)[0])
          return method.call(this, ...args)
        }
      })
  }

  update () {
    this.postMessage({
      call: 'onupdate',
      ...this.controlEditor.focusedEditor.toJSON()
    })
  }

  toJSON () {
    return {
      controlEditor: { id: this.controlEditor.id },
      id: this.id,
      title: this.title,
      value: this.buffer.toString(),
    }
  }

  async setup (data, controlEditor) {
    const { pos, pixelRatio } = data
    const { width, height } = data.outerCanvas

    this.id = data.id ?? this.id
    this.title = data.title ?? this.title
    this.extraTitle = data.extraTitle ?? ''
    this.value = data.value ?? this.value
    this.font = data.font
    this.fontSize = data.fontSize ?? this.fontSize
    this.autoResize = data.autoResize ?? this.autoResize

    try {
      const { groups: { color } } = /(?:color\(')(?<color>[^']+)/gi.exec(this.value)
      if (color) {
        this.color = color
      }
    } catch (err) {}

    this.controlEditor = controlEditor ?? this.controlEditor
    this.isSubEditor = !!this.controlEditor && this.controlEditor !== this
    this.isLastEditor = true

    this.buffer.on('update', () => {
      this.controlEditor.history.setEditor(this)
      this.controlEditor.history.save()
      this.updateText()
    })
    this.buffer.on('before update', () => {
      this.controlEditor.history.setEditor(this)
      this.controlEditor.history.save()
      this.updateText()
    })

    this.pos = pos

    if (!controlEditor) {
      const fontFace = new FontFace(
        'mono',
        `local('mono'),
         url('${this.font}') format('woff2')`,
      )
      if (isWorker) {
        self.fonts.add(fontFace)
      } else {
        document.fonts.add(fontFace)
      }
      await fontFace.load()
    }

    this.canvas = { pos, width, height, pixelRatio, padding: data.padding ?? 3 }
    this.canvas.outer = this.canvas.outerCanvas = data.outerCanvas
    this.canvas.gutter = new OffscreenCanvas(width, height)
    this.canvas.title = new OffscreenCanvas(width, height)
    this.canvas.mark = new OffscreenCanvas(width, height)
    this.canvas.back = new OffscreenCanvas(width, height)
    this.canvas.text = new OffscreenCanvas(width, height)
    this.canvas.debug = new OffscreenCanvas(width, height)
    this.canvas.scroll = { width: this.canvas.width, height: this.canvas.height }

    this.ctx = {}
    this.ctx.outer = this.canvas.outer.getContext('2d')
    this.ctx.gutter = this.canvas.gutter.getContext('2d')
    this.ctx.title = this.canvas.title.getContext('2d')
    this.ctx.mark = this.canvas.mark.getContext('2d')
    this.ctx.back = this.canvas.back.getContext('2d')
    this.ctx.text = this.canvas.text.getContext('2d')
    this.ctx.debug = this.canvas.debug.getContext('2d')
    // this.ctx.debug.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)

    this.key = null
    this.keys = new Set

    this.applyFont(this.ctx.text)
    this.char = {}
    this.char.offsetTop = .5
    this.char.metrics = this.ctx.text.measureText('M')
    this.char.width = this.char.metrics.width
    this.char.height =
      (this.char.metrics.actualBoundingBoxDescent
      - this.char.metrics.actualBoundingBoxAscent)
      * 1.15 //.96 //1.68
    // this.char.metrics.emHeightDescent
    this.gutter = { padding: 7, width: 0, height: 0 }

    this.line = { padding: 4 }
    this.line.height = this.char.height + this.line.padding

    this.char.px = {
      width: this.char.width * this.canvas.pixelRatio,
      height: this.line.height * this.canvas.pixelRatio
    }

    this.padding = { width: 0, height: this.char.px.height }

    this.sizes = { loc: -1, longestLineLength: -1 }

    this.hasFocus = false

    this.tabSize = 2

    this.titlebar = { height: data.titlebarHeight ? data.titlebarHeight * pixelRatio : this.char.px.height + 2.5 }
    this.canvas.title.height = Math.max(1, this.titlebar.height)

    this.scrollbar = { width: 6 }
    this.scrollbar.margin = Math.ceil(this.scrollbar.width / 2)
    this.scrollbar.view = { width: 0, height: this.canvas.height - this.titlebar.height }
    this.scrollbar.area = { width: 0, height: 0 }
    this.scrollbar.scale = { width: 0, height: 0 }

    this.view = {
      left: 0,
      top: this.titlebar.height,
      width: this.canvas.width,
      height: this.canvas.height - this.titlebar.height
    }

    this.page = {}
    this.page.lines = Math.floor(this.view.height / this.char.px.height)
    this.page.height = this.page.lines * this.char.px.height

    this.caret = {
      pos: new Point,
      px: new Point,
      align: 0,
      width: 10,
      height: this.line.height + this.line.padding / 2 + 2
    }

    this.markActive = false
    this.mark = new Area({
      begin: new Point({ x: -1, y: -1 }),
      end: new Point({ x: -1, y: -1 })
    })

    if (!this.isSubEditor) {
      this.history = new History(this)
      this.history.on('save', () => {
        // this.postMessage({
        //   call: 'onhistory',
        //   ...this.history.toJSON()
        // })
      })
      this.history.on('change', editor => {
        this.postMessage({
          call: 'onchange',
          ...editor.toJSON()
        })
      })
    }

    // this.title = this.title || 'drawText'
    // this.setText('')
    // this.setText('/*""*/\n//hello\nfoo(\'hello\').indexOf(\'\\t\') // foo\nhi"hello"\n// yo')
    // this.setText(this[this.title].toString()) //getPointTabs.toString()) // + this.setup.toString())
    if (this.value) {
      this.buffer.setText(this.value)
      this.updateSizes()
      this.updateText()
    } else {
      this.updateSizes()
    }
    this.setCaret({ x: 0, y: 0 })
    // this.mark.set({ begin: { x: 5, y: 6 }, end: { x: 5, y: 10 }})
    // this.markActive = true
    // this.updateMark()
    this.draw()
    // setTimeout(() => this.scrollBy(0, -6400), 10)
    // setTimeout(() => this.scrollBy(0, -27400), 10)
    // if (!this.isSubEditor && data.withSubs) {
    //   // const second = new Editor()
    //   await this.addSubEditor(new Editor('erase'))
    //   await this.addSubEditor(new Editor('addSubEditor'))
    //   await this.addSubEditor(new Editor('insert'))
    //   await this.addSubEditor(new Editor('moveByChars'))
    //   await this.addSubEditor(new Editor('onmousedown'))
    //   // this.onfocus()
    //   this.draw()
    // } else {
    //   this.draw()
    // }
    if (!controlEditor) this.postMessage({ call: 'onsetup' })
  }

  async addSubEditor (data) {
    const editor = new Editor(data)
    this.isLastEditor = false
    this.subEditors.forEach(editor => {
      editor.isLastEditor = false
      editor.updateSizes(true)
      editor.updateText()
    })
    await editor.setup({
      ...data,
      outerCanvas: this.canvas.outer,
      pixelRatio: this.canvas.pixelRatio,
      height: 1
    }, this)
    this.subEditors.push(editor)
    this.updateSizes(true)
    this.updateText()
    this.draw()
    this.postMessage({ ...editor.toJSON(), call: 'onadd' })
  }

  setColor ({ color }) {
    if (color !== this.focusedEditor.color) {
      this.focusedEditor.color = color
      this.focusedEditor.updateText()
      this.controlEditor.draw()
    }
  }

  setEditorById ({ id }) {
    if (id === this.id) {
      this.setFocusedEditor(this)
    } else {
      const editor = this.subEditors.find(editor => editor.id === id)
      if (editor) {
        this.setFocusedEditor(editor)
      }
    }
  }

  setTitle (title) {
    this.title = title
    this.updateTitle()
    this.updateSizes(true)
    this.updateText()
    this.draw()
  }

  deleteEditor ({ id }) {
    let data
    if (id === this.id) {
      data = this.toJSON()
      if (this.subEditors.length) {
        const editor = this.subEditors.shift()
        this.id = editor.id
        this.title = editor.title
        this.setText(editor.value)
      } else {
        data = null
        this.setText('')
      }
    } else {
      const subEditor = data = this.subEditors
        .find(editor => editor.id === id)
      this.subEditors.splice(this.subEditors.indexOf(subEditor), 1)
      data = data.toJSON()
    }
    this.updateSizes(true)
    this.updateText()
    this.draw()
    if (data) this.postMessage({ ...data, call: 'onremove' })
  }

  renameEditor ({ id, title }) {
    let data, prevTitle
    if (id === this.id) {
      prevTitle = this.title
      this.title = title
      this.updateTitle()
      data = this.toJSON()
    } else {
      const subEditor = this.subEditors
        .find(editor => editor.id === id)
      prevTitle = subEditor.title
      subEditor.title = title
      subEditor.updateTitle()
      data = subEditor.toJSON()
    }
    this.updateSizes(true)
    this.updateText()
    this.draw()
    if (data) this.postMessage({ ...data, prevTitle, call: 'onrename' })
  }

  restoreHistory (history) {
    const editors = {}
    editors[this.id] = this
    this.subEditors.forEach(editor => {
      editors[editor.id] = editor
    })
    history.log.forEach(item => {
      if (item) {
        item.editor = editors[item.editor]

        item.undo.editor = editors[item.undo.editor]
        item.undo.caret = new Point(item.undo.caret)
        item.undo.mark = new Area(item.undo.mark)

        item.redo.editor = editors[item.redo.editor]
        item.redo.caret = new Point(item.redo.caret)
        item.redo.mark = new Area(item.redo.mark)
      }
    })
    this.history.log = history.log
    this.history.needle = history.needle
    this.history.lastNeedle = history.lastNeedle
  }

  setFile (file) {
    this.id = file.id
    this.title = file.title
    this.setText(file.value)
    this.postMessage({
      call: 'onchange',
      ...this.toJSON()
    })
  }

  erase (moveByChars = 0) {
    if (this.markActive && !this.mark.isEmpty()) {
      this.controlEditor.history.setEditor(this)
      this.controlEditor.history.save(true)
      const area = this.mark.get()
      this.moveCaret(area.begin)
      this.buffer.removeArea(area)
      this.markClear(true)
    } else {
      this.markClear(true)
      this.controlEditor.history.setEditor(this)
      this.controlEditor.history.save()
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
    this.keepCaretInView('ease', false)
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

  insert (text, noRules = false) {
    if (this.markActive && !this.mark.isEmpty()) this.delete()
    this.markClear()
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
    let hasMatchSymbol = hasRightSymbol && (text === right && matchSymbol[left] === right)

    let indent = 0
    let hasLeftSymbol

    // apply indent on enter
    if (!noRules && NEWLINE.test(text)) {
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

    if (!noRules) {
      if (hasLeftSymbol && hasRightSymbol) {
        this.buffer.insert(this.caret.pos, '\n' + ' '.repeat(indent - 2))
      }
    }

    let length = 1

    if (noRules || (!(hasMatchSymbol))) {
      length = this.buffer.insert(this.caret.pos, text, null, true)
      this.updateSizes()
    }

    this.moveByChars(length)

    // if ('{' === text) this.buffer.insert(this.caret.pos, '}')
    // else if ('(' === text) this.buffer.insert(this.caret.pos, ')')
    // else if ('[' === text) this.buffer.insert(this.caret.pos, ']')
    // else if ('\'' === text) this.buffer.insert(this.caret.pos, '\'')
    // else if ('"' === text) this.buffer.insert(this.caret.pos, '"')
    // else if ('`' === text) this.buffer.insert(this.caret.pos, '`')

    this.updateSizes()
    this.updateText()
    this.keepCaretInView()
    this.draw()
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

    this.postMessage({ call: 'onselection', text: '' })

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

  highlightBlock () {
    this.block.begin.set({ x: -1, y: -1 })
    this.block.end.set({ x: -1, y: -1 })

    const offset = this.buffer.getPoint(this.caret.pos).offset

    const result = this.buffer.tokens.getByOffset('blocks', offset)
    if (!result) return

    const length = this.buffer.tokens.getCollection('blocks').length

    let char = this.buffer.charAt(result)

    let open
    let close

    let i = result.index
    let openOffset = result.offset
    if (i === 0 && offset < openOffset) return

    char = this.buffer.charAt(openOffset)

    let count = openOffset >= offset - 1 && Close[char] ? 0 : 1

    let limit = 200

    while (i >= 0) {
      open = Open[char]
      if (Close[char]) count++
      if (!--limit) return

      if (open && !--count) break

      openOffset = this.buffer.tokens.getByIndex('blocks', --i)
      char = this.buffer.charAt(openOffset)
    }

    if (count) return

    count = 1

    let closeOffset

    while (i < length - 1) {
      closeOffset = this.buffer.tokens.getByIndex('blocks', ++i)
      char = this.buffer.charAt(closeOffset)
      if (!--limit) return

      close = Close[char]
      if (Open[char] === open) count++
      if (open === close) count--

      if (!count) break
    }

    if (count) return

    var begin = this.buffer.getOffsetPoint(openOffset)
    var end = this.buffer.getOffsetPoint(closeOffset)

    this.block.begin.set(this.getCharPxFromPoint(begin))
    this.block.end.set(this.getCharPxFromPoint(end))
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
    return this.moveCaret({ x, y })
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
    return this.moveCaret({ x, y })
  }

  moveBeginOfLine ({ isHomeKey = false } = {}) {
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
    return this.setCaret({ x, y })
  }

  scrollIntoView (target) {

  }

  getCaretPxDiff (centered = false) {
    let editor = this.controlEditor.focusedEditor
    if (!editor) {
      this.controlEditor.setFocusedEditor(this)
      editor = this
    }

    let left = this.canvas.gutter.width
    let top = this.titlebar.height
    let right = (left + (this.view.width - this.scrollbar.width - this.char.px.width))
    let bottom = this.view.height - this.char.px.height

    // if (centered) {
    //   left = right / 2
    //   right = right / 2
    //   top = bottom / 2
    //   bottom = bottom / 2
    // }
    // this.controlEditor.ctx.debug.clearRect(0, 0, this.canvas.width, this.canvas.height)
    // this.controlEditor.ctx.debug.fillStyle = 'rgba(255,0,0,.5)'
    // this.controlEditor.ctx.debug.fillRect(left, top, right-left, bottom-top)
    // this.drawSync()

    const x = (editor.caret.px.x * this.canvas.pixelRatio + this.canvas.gutter.width - this.scroll.pos.x)
    const y = (editor.caret.px.y * this.canvas.pixelRatio + this.titlebar.height + editor.offsetTop - editor.scroll.pos.y)

    let dx = Math.floor(
      x < left ? left - x
    : x
    > right
    ? right - x
    : 0)

    let dy = Math.floor(
      y < top ? top - y
    : y
    > bottom
    ? bottom - y
    : 0)

    if (dx !== 0 && centered) {
      left = right / 2
      right = right / 2
      dx =
        x < left ? left - x
      : x
      > right
      ? right - x
      : 0
    }

    if (dy !== 0 && centered) {
      top = bottom / 2
      bottom = bottom / 2
      dy =
        y < top ? top - y
      : y
      > bottom
      ? bottom - y
      : 0
    }

    return new Point({ x: dx, y: dy })
  }

  getCharPxFromPoint (point) {
    const { tabs } = this.getPointTabs(point)
    return new Point({
      x: this.char.width * (
        (point.x - tabs)
      + (tabs * this.tabSize))
      + this.gutter.padding,
      y: this.line.height
      * point.y
      + this.canvas.padding
      - this.line.padding
    })
  }

  setCaret (pos) {
    const prevCaretPos = this.caret.pos.copy()
    this.caret.pos.set(Point.low({ x:0, y:0 }, pos))
    const px = this.getCharPxFromPoint(this.caret.pos)
    const { tabs } = this.getPointTabs(this.caret.pos)
    this.caret.px.set({
      x: px.x,
      y: px.y
    })
    queueMicrotask(this.highlightBlock)
    return prevCaretPos.minus(this.caret.pos)
  }

  setCaretByMouse ({ clientX, clientY }) {
    const y = Math.max(
      0,
      Math.min(
        this.sizes.loc,
        Math.floor(
          (clientY - (
          - this.scroll.pos.y / this.canvas.pixelRatio
          + this.offsetTop / this.canvas.pixelRatio
          + this.canvas.padding
          + this.titlebar.height / this.canvas.pixelRatio
          ))
        / this.line.height
        )
      )
    )

    let x = Math.max(
      0,
      Math.round(
        (clientX - (-this.scroll.pos.x + this.canvas.gutter.width + this.gutter.padding) / this.canvas.pixelRatio)
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
    this.keepCaretInView()
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
      this.view.height = this.canvas.height
      this.scrollbar.view.height = this.canvas.height - this.titlebar.height

      this.gutter.size = (1 + this.sizes.loc).toString().length
      this.gutter.width = this.gutter.size * this.char.width + this.gutter.padding

      this.canvas.back.height =
      this.canvas.text.height =
        (this.canvas.padding * this.canvas.pixelRatio) * 2
      + ((1 + this.sizes.loc) * this.char.px.height)// line.height)
      // * this.canvas.pixelRatio

      if (!isWorker && this.autoResize && !this.isSubEditor) {
        this.view.height
          = this.canvas.height
          = this.canvas.outer.height
          = this.canvas.text.height
          + this.titlebar.height
          + this.canvas.padding * this.canvas.pixelRatio
        this.page.lines = Math.floor(this.view.height / this.char.px.height)
        this.canvas.outer.style.height = (this.canvas.outer.height/this.canvas.pixelRatio) + 'px'
        this.postMessage({ call: 'onresize' })
      }

      this.subEditorsHeight =
        (this.subEditors.reduce((p, n) => p + n.canvas.text.height + this.titlebar.height, 0))

      this.canvas.scroll.height = Math.floor(
        this.subEditorsHeight
      + (!isWorker && this.autoResize
      ? 0
      : this.canvas.text.height)
      - (this.canvas.padding
      + this.caret.height
      - this.line.padding)
      * this.canvas.pixelRatio)
      // + 4 // TODO: this shouldn't be needed

      // + (this.subEditors.length - 2)

      this.canvas.gutter.width =
        (this.gutter.width + this.canvas.padding)
      * this.canvas.pixelRatio

      this.canvas.gutter.height = // TODO
        !this.isLastEditor
        ? this.canvas.text.height
        : this.canvas.scroll.height + this.view.height

      this.scrollbar.view.width =
        this.canvas.width - this.canvas.gutter.width

      this.view.left = this.canvas.gutter.width
      this.view.width = this.canvas.width - this.canvas.gutter.width

      this.padding.width = (
        this.gutter.width
      + this.gutter.padding
      + this.char.width
      ) * this.canvas.pixelRatio

      this.ctx.gutter.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
      this.updateGutter()
    }

    if (longestLineLength !== this.sizes.longestLineLength || force) {
      changed = true
      this.sizes.longestLineLength = longestLineLength

      this.canvas.back.width =
      this.canvas.text.width = (
        this.sizes.longestLineLength
      * this.char.width
      + this.gutter.padding
      ) * this.canvas.pixelRatio

      this.canvas.mark.width =
        this.canvas.text.width
      + this.char.px.width / 2

      this.canvas.scroll.width =
        Math.max(
          0,
          this.canvas.text.width
        - this.canvas.width
        + this.canvas.gutter.width
        + this.char.px.width * 2
        )
    }

    if (changed) {
      this.scrollbar.area.width =
        this.canvas.text.width
      + this.char.px.width * 2

      this.scrollbar.area.height = this.canvas.scroll.height

      this.scrollbar.scale.width = this.scrollbar.view.width / this.scrollbar.area.width
      this.scrollbar.scale.height = this.scrollbar.view.height / this.scrollbar.area.height

      this.scrollbar.horiz = this.scrollbar.scale.width * this.scrollbar.view.width
      this.scrollbar.vert = this.scrollbar.scale.height * this.scrollbar.view.height

      this.ctx.text.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
      this.ctx.back.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)

      this.canvas.title.width = this.canvas.width
      this.updateTitle()

      if (this.isSubEditor) {
        this.controlEditor.updateSizes(true)
        this.controlEditor.updateText()
      }

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
    ctx.font = `normal ${this.fontSize} mono`
  }

  updateGutter () {
    const { gutter } = this.ctx

    // this.applyFont(gutter)
    gutter.textBaseline = 'top'
    gutter.font = `normal ${parseFloat(this.fontSize)+'pt'} mono`

    gutter.fillStyle = theme.gutter
    gutter.fillRect(0, 0, this.canvas.gutter.width, this.canvas.gutter.height)
    gutter.fillStyle = theme.lineNumbers

    for (let i = 0, y = 0; i <= this.sizes.loc; i++) {
      y = this.canvas.padding + i * this.line.height + this.char.offsetTop
      gutter.fillText(
        (1 + i).toString().padStart(this.gutter.size),
        this.canvas.padding,
        y
      )
    }
  }

  updateText () {
    const { text, back } = this.ctx

    theme.variable = this.color

    this.applyFont(text)
    back.clearRect(0, 0, this.canvas.text.width, this.canvas.text.height)
    text.clearRect(0, 0, this.canvas.text.width, this.canvas.text.height)
    text.fillStyle = theme.text

    const code = this.buffer.toString()
    const pieces = this.syntax.highlight(code)

    const AnyChar = /\S/
    const fh = this.line.height //Math.ceil(this.line.height)
    let i = 0, x = 0, y = 0, lastNewLine = 0, idx = 0
    // text.fillStyle = '#000'
    // for (const line of code.split('\n')) {
    //   y = this.canvas.padding + i * this.line.height

    //   for (let sx = 1; sx <= 2; sx++) {
    //     for (let sy = 1; sy <= 2; sy ++) {
    //       // text.fillText(string, x+sx, y)
    //       // text.fillText(string, x-sx, y)
    //       text.fillText(line, x+sx, y+sy)
    //       text.fillText(line, x+sx, y-sy)

    //       // text.fillText(string, x, y+sy)
    //       // text.fillText(string, x, y-sy)
    //       text.fillText(line, x-sx, y+sy)
    //       text.fillText(line, x-sx, y-sy)
    //     }
    //   }

    //   i++
    // }

    // i = 0, x = 0, y = 0, lastNewLine = 0
    const queue = []
    for (const [type, string, index] of pieces.values()) {
      y = this.canvas.padding + i * this.line.height

      idx = index

      if (type === 'newline') {
        back.fillStyle = 'rgba(0,0,0,.7)'
        back.fillRect(0, y-1.5, this.char.width * (index - lastNewLine) + 8, fh)

        for (const [type, string, x, y] of queue) {
          text.fillStyle = theme[type]
          text.fillText(string, x, y + this.char.offsetTop)
        }
        queue.length = 0

        lastNewLine = index + 1

        // AnyChar.lastIndex = 0

        i++
        continue
      }

      x = (index - lastNewLine) * this.char.width + this.gutter.padding

      queue.push([type, string, x, y])
      // // AnyChar.lastIndex = 0

      // text.fillStyle = 'rgba(0,0,0,.65)'
      // text.fillRect(x + (AnyChar.exec(string)?.index * this.char.width), y, this.char.width * string.trim().length, fh)

      // text.fillStyle = theme[type]
      // text.fillText(string, x, y)
    }

    if (queue.length) {
      back.fillStyle = 'rgba(0,0,0,.7)'
      back.fillRect(0, y-1.5, this.char.width * (idx - lastNewLine + queue[queue.length-1][1].length) + 8, fh)
      // text.fillRect(0, y, this.char.width * string.length + 4, fh)
      for (const [type, string, x, y] of queue) {
        text.fillStyle = theme[type]
        text.fillText(string, x, y)
      }
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

    if (area.isEmpty()) return

    mark.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)

    mark.fillStyle = theme.mark
    const r = this.canvas.pixelRatio
    const xx = this.gutter.padding
    const yy = 0 //this.canvas.padding / r / 2
    let ax = 0, bx = 0, ay = 0, by = 0
    const drawMarkArea = ({ begin, end }, eax = 0, ebx = 0) => {
      ax = begin.x * this.char.width
      bx = (end.x - begin.x) * this.char.width
      ay = begin.y * this.line.height
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

    this.postMessage({ call: 'onselection', text: this.buffer.getAreaText(this.mark.get()) })
  }

  updateTitle () {
    this.ctx.title.save()
    this.ctx.title.fillStyle = theme.titlebar
    this.ctx.title.fillRect(
      0, 0,
      this.canvas.title.width,
      this.canvas.title.height
    )
    this.applyFont(this.ctx.title)
    this.ctx.title.font = `normal 9.6pt mono`
    // this.ctx.title.textAlign = `center`
    this.ctx.title.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
    this.ctx.title.fillStyle = theme.title
    this.ctx.title.fillText(
      (this.extraTitle ?? '') + this.title,
      39,
      7.5 //5.4
    )
    this.ctx.title.restore()
  }

  setOffsetTop (offsetTop, realOffsetTop) {
    this.offsetTop = offsetTop
    this.realOffsetTop = realOffsetTop

    this.isVisible = !this.isSubEditor ||
      this.offsetTop
      + this.scroll.pos.y
      < this.canvas.height
      && this.offsetTop
      + this.scroll.pos.y
      + this.canvas.gutter.height
      + this.titlebar.height
      > 0
  }

  clear () {
    // clear
    // this.ctx.outer.fillStyle = 'transparent' //theme.background
    // this.ctx.outer.fillRect(
    //   0,
    //   0,
    //   this.canvas.width,
    //   this.canvas.height
    // )
    Object.assign(this.canvas.outer, {
      width: this.canvas.width,
      height: this.canvas.height
    })
    // this.canvas.outer.width = this.canvas.width
    // this.canvas.outer.height = this.canvas.height

    // this.ctx.outer.clearRect(
    //   0,
    //   0,
    //   this.canvas.width,
    //   this.canvas.height
    // )
  }

  drawTitle () {
    if (this.titlebarHeight === 0) return
    // this.ctx.outer.save()
    this.ctx.outer.fillStyle = theme.titlebar

    this.ctx.outer.drawImage(
      this.canvas.title,
      0,
      Math.max(0, this.offsetTop),
      // this.canvas.width,
      // this.titlebar.height
    )
    // this.applyFont(this.ctx.outer)
    // this.ctx.outer.scale(this.canvas.pixelRatio, this.canvas.pixelRatio)
    // this.ctx.outer.fillStyle = theme.title
    // this.ctx.outer.fillText(
    //   this.title,
    //   5,
    //   2.5 + Math.max(0, this.offsetTop / this.canvas.pixelRatio)
    // )
    // this.ctx.outer.restore()
  }

  drawBack () {
    // draw back layer

    const clipTop = Math.max(0, -this.offsetTop)

    this.ctx.outer.drawImage(
      this.canvas.back,

      this.scroll.pos.x, // sx
      this.scroll.pos.y + clipTop, // - this.offsetTop, // - this.offsetTop, // sy
      this.view.width, // sw
      this.view.height - this.offsetTop - clipTop, // sh

      this.view.left, // dx
      Math.max(0, this.view.top + this.offsetTop + clipTop), // dy
      this.view.width, // dw
      this.view.height - this.offsetTop - clipTop // dh
    )
  }

  drawText () {
    // draw text layer

    const clipTop = Math.max(0, -this.offsetTop)

    this.ctx.outer.drawImage(
      this.canvas.text,

      this.scroll.pos.x, // sx
      this.scroll.pos.y + clipTop, // - this.offsetTop, // - this.offsetTop, // sy
      this.view.width, // sw
      this.view.height - this.offsetTop - clipTop, // sh

      this.view.left, // dx
      Math.max(0, this.view.top + this.offsetTop + clipTop), // dy
      this.view.width, // dw
      this.view.height - this.offsetTop - clipTop // dh
    )
  }

  drawGutter () {
    // draw gutter layer

    const clipTop = Math.max(0, -this.offsetTop)

    this.ctx.outer.drawImage(
      this.canvas.gutter,

      0, // sx
      this.scroll.pos.y + clipTop, // sy
      this.canvas.gutter.width, // sw
      this.view.height - this.offsetTop - clipTop, // sh

      0, // dx
      Math.max(0, this.view.top + this.offsetTop + clipTop), // dy
      this.canvas.gutter.width, // dw
      this.view.height - this.offsetTop - clipTop// dh
    )
  }

  drawMark () {
    // draw mark layer
    if (this.mark.isEmpty()) return

    const { begin } = this.mark.get()
    const y = begin.y * this.char.px.height

    const clipTop = Math.max(0,
    -(y + this.offsetTop - this.scroll.pos.y
    + this.canvas.padding * this.canvas.pixelRatio))

    const posTop =
    (-this.scroll.pos.y + this.offsetTop + y + clipTop)
    + this.titlebar.height
    + this.canvas.padding * this.canvas.pixelRatio

    const height = this.canvas.mark.height - clipTop

    // this.controlEditor.ctx.debug.clearRect(0, 0, this.canvas.width, this.canvas.height)
    // this.controlEditor.ctx.debug.fillStyle = 'rgba(255,0,0,.5)'
    // this.controlEditor.ctx.debug.fillRect(0, posTop, 10, height)

    this.ctx.outer.drawImage(
      this.canvas.mark,

      this.scroll.pos.x, // sx
      clipTop, // sy
      this.canvas.mark.width,// sw
      height, // sh

      this.canvas.gutter.width, // dx
      posTop - 3, // dy
      this.canvas.mark.width, // dw
      height // dh
    )
  }

  drawCaret () {
    // draw caret
    this.ctx.outer.fillStyle = theme.caret

    this.ctx.outer.fillRect(
    - this.scroll.pos.x
    + (this.caret.px.x
    + this.gutter.width
    + this.canvas.padding) * this.canvas.pixelRatio, // dx

    - this.scroll.pos.y
    + this.caret.px.y
    * this.canvas.pixelRatio
    + this.titlebar.height
    + this.offsetTop, // dy
      this.caret.width * this.canvas.pixelRatio, // dw
      this.caret.height * this.canvas.pixelRatio // dh
    )
  }

  drawBlock () {
    // draw block highlight
    this.ctx.outer.fillStyle = '#fff' //theme.caret

    if (this.block.isEmpty()) return

    this.ctx.outer.fillRect(
    - this.scroll.pos.x
    + (this.block.begin.x
    + this.gutter.width
    + this.canvas.padding) * this.canvas.pixelRatio,

    - this.scroll.pos.y
    + this.block.begin.y
    * this.canvas.pixelRatio
    + this.titlebar.height
    + this.offsetTop
    + this.char.px.height + 1, // dy

      this.char.px.width, // dw
      2 // dh
    )

    this.ctx.outer.fillRect(
    - this.scroll.pos.x
    + (this.block.end.x
    + this.gutter.width
    + this.canvas.padding) * this.canvas.pixelRatio,

    - this.scroll.pos.y
    + this.block.end.y
    * this.canvas.pixelRatio
    + this.titlebar.height
    + this.offsetTop
    + this.char.px.height + 1, // dy

      this.char.px.width, // dw
      2 // dh
    )
  }

  drawVertScrollbar () {
    this.ctx.outer.strokeStyle = theme.scrollbar
    this.ctx.outer.lineWidth = this.scrollbar.width
    // this.ctx.outer.lineCap = 'round'

    const y =
      (this.scroll.pos.y / (
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
      (this.scroll.pos.x / (this.canvas.scroll.width || 1))
    * ((this.scrollbar.view.width - this.scrollbar.horiz) || 1) || 0

    const y = Math.min(
      this.canvas.gutter.height
    + this.offsetTop
    - this.scroll.pos.y
    + this.titlebar.height
    - this.scrollbar.margin,

      this.canvas.height
    - this.scrollbar.margin
    )

    if (y > this.titlebar.height - this.scrollbar.width + this.scrollbar.margin
    && this.offsetTop + this.titlebar.height < this.canvas.height
    && x + this.scrollbar.view.width - this.scrollbar.horiz > 12) {
      this.ctx.outer.beginPath()
      this.ctx.outer.moveTo(this.canvas.gutter.width + x, y)
      this.ctx.outer.lineTo(this.canvas.gutter.width + x + this.scrollbar.horiz + 1, y)
      this.ctx.outer.stroke()
    }
  }

  drawSync (noDelegate = false) {
    if (this.isSubEditor && !noDelegate) {
      this.controlEditor.drawSync()
      return
    }
    if (!this.isSubEditor) this.setOffsetTop(0, 0)
    let offsetTop = -this.scroll.pos.y + this.canvas.gutter.height + this.titlebar.height
    let realOffsetTop = this.canvas.gutter.height + this.titlebar.height
    this.subEditors.forEach(editor => {
      editor.setOffsetTop(offsetTop, realOffsetTop)
      offsetTop += editor.canvas.gutter.height + editor.titlebar.height
      realOffsetTop += editor.canvas.gutter.height + editor.titlebar.height
    })
    if (!this.isSubEditor) {
      this.clear()
      this.drawHorizScrollbar()
      this.subEditors.forEach(editor => editor.isVisible && editor.drawHorizScrollbar())
    }
    this.drawBack()
    if (this.markActive) this.drawMark()
    if (this.controlEditor.focusedEditor === this && this.hasFocus) {
      this.drawCaret()
      this.drawBlock()
    }
    if (!this.isSubEditor && this.isVisible) this.drawTitle()
    this.subEditors.forEach(editor => editor.isVisible && editor.drawTitle())
    if (!this.isSubEditor) this.drawVertScrollbar()
    this.drawText()
    this.drawGutter()
    this.subEditors.forEach(editor => editor.isVisible && editor.drawSync(true))

    if (!this.isSubEditor) {
      this.ctx.outer.drawImage(
        this.canvas.debug,
        0, 0
        // this.c
      )
      this.postMessage({ call: 'ondraw' })
    }
  }

  draw () {
    if (this.isSubEditor) {
      this.controlEditor.draw()
    } else {
      cancelAnimationFrame(this.drawAnimFrame)
      this.drawAnimFrame = requestAnimationFrame(this.drawSync)
    }
  }

  scrollTo (pos) {
    this.animScrollCancel()
    this.scroll.pos.set(Point.clamp(this.canvas.scroll, pos))
    this.scroll.target.set(this.scroll.pos)
    this.drawSync()
  }

  scrollBy (d, animType, clamp=false) {
    this.scroll.target.set(
      Point.clamp(clamp
        ? {
          begin: {
            x: this.canvas.scroll.width,
            y: this.controlEditor.focusedEditor.realOffsetTop,
          },
          end: {
            x: this.canvas.scroll.width,
            y: this.controlEditor.focusedEditor.realOffsetTop + this.controlEditor.focusedEditor.canvas.text.height-this.view.height + this.titlebar.height,
          }
        }
        : this.canvas.scroll,
        this.scroll.pos.add(d)
      )
    )
    if (!animType) {
      this.scrollTo(this.scroll.target)
    } else {
      this.animScrollStart(animType)
    }
  }

  animScrollCancel () {
    this.scrollAnim.isRunning = false
    cancelAnimationFrame(this.scrollAnim.animFrame)
  }

  animScrollStart (animType = 'ease') {
    this.scrollAnim.type = animType
    if (this.scrollAnim.isRunning) return

    this.scrollAnim.isRunning = true
    this.scrollAnim.animFrame = requestAnimationFrame(this.animScrollTick)

    const s = this.scroll.pos
    const t = this.scroll.target
    if (s.equal(t)) return this.animScrollCancel()

    const d = t.minus(s)

    d.x = Math.sign(d.x) * 5
    d.y = Math.sign(d.y) * 5

    this.scroll.pos.set(Point.clamp(this.canvas.scroll, this.scroll.pos.add(d)))
    this.drawSync()
  }

  animScrollTick () { // TODO: branchless
    const { scale, threshold } = this.scrollAnim
    let { speed } = this.scrollAnim
    const d = this.scroll.target.minus(this.scroll.pos)
    const a = d.abs()

    if (a.y > this.canvas.height * threshold.far) {
      speed *= scale.far
    }

    if (a.x < .5 && a.y < .5) {
      this.scrollTo(this.scroll.target)
    } else if (this.scroll.pos.equal(this.scroll.target)) {
      this.animScrollCancel()
    } else {
      this.scrollAnim.animFrame = requestAnimationFrame(this.animScrollTick)
      switch (this.scrollAnim.type) {
        case 'linear':
          if (a.x < speed * threshold.mid) d.x = d.x
            * (a.x < speed * threshold.near
              ? a.x < threshold.tiny
              ? scale.tiny
              : scale.near
              : scale.mid)

          else d.x = Math.sign(d.x) * speed

          if (a.y < speed * threshold.mid) d.y = d.y
            * (a.y < speed * threshold.near
              ? a.y < threshold.tiny
              ? scale.tiny
              : scale.near
              : scale.mid)

          else d.y = Math.sign(d.y) * speed
        break

        case 'ease':
          // d.x *= 0.26
          // d.y *= 0.26
          d.x = Math[d.x > 0 ? 'min' : 'max'](d.x, Math.sign(d.x)*90)
          d.y = Math[d.y > 0 ? 'min' : 'max'](d.y, Math.sign(d.y)*90)
        break
      }

      this.scroll.pos.set(
        Point.clamp(
          this.canvas.scroll,
          this.scroll.pos.add(d)
        )
      )
      this.drawSync()
    }
  }

  maybeDelegateMouseEvent (eventName, e) {
    if (this.isSubEditor) return false

    for (const editor of this.subEditors.values()) {
      if (e.clientY*this.canvas.pixelRatio > editor.offsetTop
      && e.clientY*this.canvas.pixelRatio < editor.offsetTop
      + editor.canvas.gutter.height
      + editor.titlebar.height
      ) {
        if (eventName === 'onmousedown') {
          this.controlEditor.setFocusedEditor(editor, false)
        }
        editor[eventName](e)
        return true
      }
    }

    if (this.controlEditor.focusedEditor !== this) {
      this.controlEditor.setFocusedEditor(this, false)
    }

    return false
  }

  maybeDelegateEvent (eventName, e) {
    if (this.isSubEditor) return false

    if (this.focusedEditor && this.focusedEditor !== this) {
      this.focusedEditor?.[eventName](e)
      return true
    }

    return false
  }

  oncontextmenu () {}

  onmouseenter () {}
  onmouseover () {}
  onmouseout () {}

  onmousewheel (e) {
    let { deltaX, deltaY } = e
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (!this.maybeDelegateMouseEvent('onmousewheel', e)) {
        deltaX *= 700
        this.scrollBy({ x: deltaX, y: 0 }, 'linear')
      }
    } else {
      deltaY *= 770
      this.scrollBy({ x: 0, y: deltaY }, 'linear')
    }
  }

  onmouseup () {}

  onmousedown (e) {
    if (!this.maybeDelegateMouseEvent('onmousedown', e)) {
      this.usedMouseRight = false
      if (e.left) {
        this.markClear()
        this.updateMark()
        this.setCaretByMouse(e)
        this.markBegin()
        this.draw()
      } else if (e.right) {
        // this prevents clicking away from context menu
        // to create a selection
        this.usedMouseRight = true
      }
    }
  }

  onmousemove (e) {
    if (!this.maybeDelegateEvent('onmousemove', e)) {
      if (e.left && !this.usedMouseRight) {
        this.setCaretByMouse(e)
        this.markSet()
        // if (!this.keepCaretInView()) {
        this.drawSync()
        // }
      }
    }
  }

  keepCaretInView (animType, centered, clamp) {
    const caretPxDiff = this.getCaretPxDiff(centered)
    if (this.controlEditor === this) {
      this.scrollBy({ x: -caretPxDiff.x, y: -caretPxDiff.y }, animType, clamp)
    } else {
      if (caretPxDiff.x !== 0) this.scrollBy({ x: -caretPxDiff.x, y: 0 }, animType)
      if (caretPxDiff.y !== 0) this.controlEditor.scrollBy({ x: 0, y: -caretPxDiff.y }, animType, clamp)
    }
  }

  applyCaretDiff (diff, jump = false) {
    const diffPx = new Point(diff).mul(this.char.px)
    const caretPxDiff = this.getCaretPxDiff()
    if (caretPxDiff.x !== 0) this.scrollBy({ x: -caretPxDiff.x, y: 0 })
    if (caretPxDiff.y !== 0) {
      if (jump) {
        this.controlEditor.scrollBy({ x: 0, y: -(diffPx.y || caretPxDiff.y) }, 'ease', true)
      } else {
        this.controlEditor.scrollBy({ x: 0, y: -caretPxDiff.y }, 'ease')
      }
    }
  }

  onkeydown (e) {
    if (this.maybeDelegateEvent('onkeydown', e)) return

    this.keys.delete(e.key.toLowerCase())
    this.keys.delete(e.key.toUpperCase())
    this.keys.add(e.key)
    this.keys.add(e.which)
    this.keys.add(e.char)
    this.key = e.key.length === 1 ? e.key : null

    if (!e.cmdKey && this.key) return this.insert(this.key)
    if (!e.cmdKey && e.key === 'Enter') return this.insert('\n')
    if (!e.cmdKey && e.key === 'Backspace') return this.backspace()
    if (!e.cmdKey && !e.shiftKey && e.key === 'Delete') return this.delete()

    this.pressed = [e.cmdKey && 'Cmd', e.altKey && 'Alt', e.key].filter(Boolean).join(' ')

    // navigation
    if (e.shiftKey && e.key !== 'Shift') this.markBegin()
    else if (e.key !== 'Delete' && !e.cmdKey && e.key !== 'Tab') this.markClear()

    switch (this.pressed) {
      case 'Cmd z': {
        const editor = this.controlEditor.history.undo(this.controlEditor.history.needle-1)
        if (editor) this.setFocusedEditor(editor)
        this.draw()
      }
      break
      case 'Cmd y': {
        const editor = this.controlEditor.history.redo(this.controlEditor.history.needle+1)
        if (editor) this.setFocusedEditor(editor)
        this.draw()
      }
      break
      case 'Tab': {
        const tab = ' '.repeat(this.tabSize)

        let add
        let area
        let text

        let prevArea = this.mark.copy()

        let clear = false
        let caret = this.caret.pos.copy()
        let align = this.caret.align

        let matchIndent = false

        if (!this.markActive) {
          this.insert(tab)
          break
        } else {
          area = this.mark.get()
          area.end.y += area.end.x > 0 ? 1 : 0
          area.begin.x = 0
          area.end.x = 0
          text = this.buffer.getAreaText(area)
          matchIndent = true
        }

        if (e.shiftKey) {
          add = -2
          text = text.replace(/^ {1,2}(.+)/gm, '$1') // TODO: use tabSize
        } else {
          add = +2
          text = text.replace(/^([\s]*)(.+)/gm, `$1${tab}$2`)
        }

        this.mark.set(area)
        this.insert(text)
        this.mark.set(prevArea)
        this.mark.begin.x += this.mark.begin.x > 0 ? add : 0
        this.mark.end.x += this.mark.end.x > 0 ? add : 0
        this.markActive = !clear

        this.caret.align = align

        if (matchIndent) {
          caret.x += add
          this.caret.align += add
        }
        this.setCaret(caret)
        this.updateMark()
        this.draw()
      }
      break
      case 'Cmd Alt /':
      case 'Cmd ?': {
        if (!this.markActive || e.key === '?') {
          let y = this.caret.pos.y
          while (y > 0 && this.buffer.getLineLength(y) > 0) y--
          let startY = y
          y = this.caret.pos.y
          while (y <= this.sizes.loc && this.buffer.getLineLength(y) > 0) y++
          let endY = y
          this.mark.set({
            begin: { x:0, y:startY },
            end: { x:0, y:endY }
          })
          this.markActive = true
          this.updateMark()
          this.draw()
          if (!e.altKey) {
            break
          }
        }
      }
      // break
      case 'Cmd /': {
        let add
        let area
        let text

        let prevArea = this.mark.copy()

        let clear = false
        let caret = this.caret.pos.copy()
        let align = this.caret.align

        let matchIndent = false

        if (!this.markActive) {
          clear = true
          this.markClear()
          this.moveBeginOfLine()
          this.markBegin()
          this.moveEndOfLine()
          this.markSet()
          area = this.mark.get()
          text = this.buffer.getAreaText(area)
          matchIndent = text.match(/\S/)?.index < caret.x
        } else {
          area = this.mark.get()
          area.end.y += area.end.x > 0 ? 1 : 0
          area.begin.x = 0
          area.end.x = 0
          text = this.buffer.getAreaText(area)
          matchIndent = true
        }

        //TODO: should check if last line has // also
        if (text.trimLeft().substr(0,2) === '//') {
          add = -2
          text = text.replace(/^(.*?)\/\/(.+)?/gm, '$1$2')
        } else {
          add = +2
          text = text.replace(/^(.+)/gm, '//$1')
        }

        this.mark.set(area)
        this.insert(text)
        this.mark.set(prevArea)
        this.mark.begin.x += this.mark.begin.x > 0 ? add : 0
        this.mark.end.x += this.mark.end.x > 0 ? add : 0
        this.markActive = !clear

        this.caret.align = align

        if (matchIndent) {
          caret.x += add
          this.caret.align += add
        }
        this.setCaret(caret)
        this.updateMark()
        this.draw()
        if (e.altKey) {
          this.postMessage({ call: 'onblockcomment' })
        }
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
        this.keepCaretInView('ease')
        this.draw()
      }
      return

      case 'Delete': case 'Cmd x':
        if (!this.mark.isEmpty()) {
          this.delete()
        } else {
          this.markClear(true)
          this.moveBeginOfLine()
          this.markBegin()
          const diff = this.moveByLines(+1)
          // only delete content below
          if (diff.y !== 0 || diff.x !== 0) {
            this.markSet()
            this.delete()
          } else {
            this.markClear(true)
          }
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
            this.applyCaretDiff(this.moveByLines(-1))
            this.updateMark()
          }
        } else {
          this.scrollBy({ x: 0, y: -this.char.px.height }, 'ease')
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
            this.applyCaretDiff(this.moveByLines(+1))
            this.updateMark()
          }
        } else {
          this.scrollBy({ x: 0, y: +this.char.px.height }, 'ease')
        }
      break

      case 'ArrowLeft':
        this.applyCaretDiff(this.moveByChars(-1))
        if (e.shiftKey) this.markSet()
      break
      case 'ArrowRight':
        this.applyCaretDiff(this.moveByChars(+1))
        if (e.shiftKey) this.markSet()
      break
      case 'ArrowUp':
        this.applyCaretDiff(this.moveByLines(-1))
        if (e.shiftKey) this.markSet()
      break
      case 'ArrowDown':
        this.applyCaretDiff(this.moveByLines(+1))
        if (e.shiftKey) this.markSet()
      break

      case 'Alt PageUp':
        this.controlEditor.moveByEditors(-1)
      break
      case 'Alt PageDown':
        this.controlEditor.moveByEditors(+1)
      break

      case 'PageUp': {
        const caretPos = this.caret.pos.copy()
        this.applyCaretDiff(this.moveByLines(-this.page.lines), true)
        if (e.shiftKey) this.markSet()
        else {
          if (caretPos.equal(this.caret.pos)) {
            this.controlEditor.moveByEditors(-1)
          }
        }
      }
      break
      case 'PageDown': {
        const caretPos = this.caret.pos.copy()
        this.applyCaretDiff(this.moveByLines(+this.page.lines), true)
        if (e.shiftKey) this.markSet()
        else {
          if (caretPos.equal(this.caret.pos)) {
            this.controlEditor.moveByEditors(+1)
          }
        }
      }
      break

      case 'Home':
        this.applyCaretDiff(this.moveBeginOfLine({ isHomeKey: true }))
        if (e.shiftKey) this.markSet()
      break
      case 'End':
        this.applyCaretDiff(this.moveEndOfLine())
        if (e.shiftKey) this.markSet()
      break
    }

    this.draw()
  }

  moveByEditors (y) {
    const editors = [this, ...this.subEditors]
    let index = editors.indexOf(this.focusedEditor)
    let prev = index
    index += y
    if (index > editors.length - 1) index = 0
    if (index < 0) index = editors.length - 1
    if (prev === index) return
    const editor = editors[index]
    if (y > 0) editor.setCaret({ x:0, y:0 })
    else editor.setCaret({ x:editor.buffer.getLineLength(editor.sizes.loc), y:editor.sizes.loc })
    this.setFocusedEditor(editor)
  }

  onkeyup (e) {
    if (this.maybeDelegateEvent('onkeyup', e)) return

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
    if (this.maybeDelegateEvent('onpaste', { text })) return
    this.insert(text, true)
  }

  onhistory ({ needle }) {
    if (needle !== this.history.needle) {
      let editor
      if (needle < this.history.needle) {
        editor = this.history.undo(needle)
      } else if (needle > this.history.needle) {
        editor = this.history.redo(needle)
      }
      if (editor) {
        this.setFocusedEditor(editor)
      }
    }
  }

  setFocusedEditor (editor, animType = 'ease', centered = true) {
    const hasFocus = this.focusedEditor?.hasFocus
    if (editor !== this.focusedEditor) {
      this.focusedEditor?.onblur()
      this.focusedEditor = editor
      if (hasFocus) {
        this.postMessage({
          call: 'onfocus',
          id: editor.id,
          title: editor.title
        })
      }
    }
    if (hasFocus) {
      editor.onfocus()
    }
    editor.updateSizes()
    editor.updateText()
    editor.updateMark()
    if (animType !== false) editor.keepCaretInView(animType, centered, true)
    editor.draw()
  }

  onblur () {
    if (this.controlEditor.focusedEditor) {
      this.controlEditor.focusedEditor.hasFocus = false
      this.controlEditor.focusedEditor.keys.clear()
    }
    this.controlEditor.draw()
  }

  onfocus () {
    if (this.controlEditor.focusedEditor) {
      this.controlEditor.focusedEditor.hasFocus = true
      this.controlEditor.focusedEditor.keys.clear()
    } else {
      this.controlEditor.focusedEditor = this
      this.controlEditor.hasFocus = true
    }
    this.postMessage({
      call: 'onfocus',
      id: this.controlEditor.focusedEditor.id,
      title: this.controlEditor.focusedEditor.title
    })
    this.controlEditor.draw()
  }

  onresize ({ width, height }) {
    this.canvas.width = this.canvas.outer.width = width
    this.canvas.height = this.canvas.outer.height = height
    this.subEditors.forEach(editor => {
      editor.canvas.width = editor.canvas.outer.width = width
      editor.canvas.height = editor.canvas.outer.height = height
      editor.updateSizes(true)
      editor.updateText()
    })
    this.updateSizes(true)
    this.updateText()
    this.drawSync()
    postMessage({ call: 'onresize' })
  }
}

if (isWorker) {
  const editor = new Editor()
  onmessage = ({ data }) => {
    if (!(data.call in editor)) {
      console.error(data.call + ' is not a method')
    }
    editor[data.call](data)
  }
  postMessage({ call: 'onready' })
}
