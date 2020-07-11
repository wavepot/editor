import Event from './buffer/event.js'
import debounce from './lib/debounce.js'

export default function History(editor) {
  this.editor = editor
  this.log = [null]
  this.needle = 1
  this.lastNeedle = 1
  this.timeout = true
  this.timeStart = 0
  this.debouncedSave = debounce(this.actuallySave.bind(this), 700)
}

History.prototype.__proto__ = Event.prototype

History.prototype.save = function (force) {
  if (this.lastNeedle === this.needle) {
    this.needle++
    this.emit('save')
    this.saveMeta()
  }
  if (Date.now() - this.timeStart > 2000 || force) {
    this.actuallySave()
  }
  this.timeout = this.debouncedSave()
}

History.prototype.actuallySave = function (noEmit) {
  clearTimeout(this.timeout)
  if (this.editor.buffer.log.length) {
    this.log = this.log.slice(0, this.lastNeedle)
    this.log.push(this.commit())

    this.needle = ++this.lastNeedle
    this.saveMeta()
    if (!noEmit) this.emit('save')
  } else {
    this.saveMeta()
  }
  this.timeStart = Date.now()
  this.timeout = false
}

History.prototype.undo = function (needle) {
  if (this.timeout !== false) this.actuallySave(true)

  if (needle < 1) return

  this.lastNeedle = this.needle = needle
  this.checkout('undo', needle)
}

History.prototype.redo = function (needle) {
  if (this.timeout !== false) this.actuallySave(true)

  if (needle < 1) return

  this.lastNeedle = this.needle = needle
  this.checkout('redo', needle - 1)
}

History.prototype.checkout = function (type, n) {
  let commit = this.log[n]
  if (!commit) return

  let log = commit.log

  commit = this.log[n][type]
  this.editor.markActive = commit.markActive
  this.editor.mark.set(commit.mark.copy())
  this.editor.setCaret(commit.caret.copy())

  log = 'undo' === type
    ? log.slice().reverse()
    : log.slice()

  log.forEach(item => {
    var action = item[0]
    var offsets = item[1]
    var text = item[2]
    switch (action) {
      case 'insert':
        if ('undo' === type) {
          this.editor.buffer.remove(offsets, true)
        } else {
          this.editor.buffer.insert(this.editor.buffer.getOffsetPoint(offsets[0]), text, true)
        }
        break
      case 'remove':
        if ('undo' === type) {
          this.editor.buffer.insert(this.editor.buffer.getOffsetPoint(offsets[0]), text, true)
        } else {
          this.editor.buffer.remove(offsetRange, true)
        }
        break
    }
  })

  this.emit('change')
}

History.prototype.commit = function () {
  var log = this.editor.buffer.log
  this.editor.buffer.log = []
  return {
    log: log,
    undo: this.meta,
    redo: {
      caret: this.editor.caret.pos.copy(),
      mark: this.editor.mark.copy(),
      markActive: this.editor.markActive
    }
  }
}

History.prototype.saveMeta = function () {
  this.meta = {
    caret: this.editor.caret.pos.copy(),
    mark: this.editor.mark.copy(),
    markActive: this.editor.markActive
  }
}
