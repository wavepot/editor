import Event from './buffer/event.js'
import debounce from '../lib/debounce.js'

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

History.prototype.toJSON = function () {
  return {
    log: this.log.map(commit => (commit ? {
      ...commit,
      editor: commit.editor.id,
      undo: {
        ...commit.undo,
        editor: commit.undo.editor.id
      },
      redo: {
        ...commit.redo,
        editor: commit.redo.editor.id
      }
    } : commit)),
    needle: this.needle,
    lastNeedle: this.lastNeedle
  }
}
//
History.prototype.setEditor = function (editor) {
  if (this.editor !== editor) {
    this.actuallySave(true)
  }
  this.editor = editor
}

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
  this.didSave = false
  if (this.editor.buffer.log.length) {
    this.didSave = true
    this.log = this.log.slice(0, this.lastNeedle)
    this.log.push(this.commit())

    this.needle = ++this.lastNeedle
    this.saveMeta()
    if (!noEmit) {
      this.emit('save')
      this.emit('change', this.editor)
    }
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
  return this.checkout('undo', needle)
}

History.prototype.redo = function (needle) {
  if (this.timeout !== false) this.actuallySave(true)

  if (needle < 1) return

  this.lastNeedle = this.needle = needle
  return this.checkout('redo', needle - 1)
}

History.prototype.checkout = function (type, n) {
  let commit = this.log[n]
  if (!commit) return

  let log = commit.log
  commit = this.log[n][type]
  commit.editor.markActive = commit.markActive
  commit.editor.mark.set(commit.mark.copy())
  commit.editor.setCaret(commit.caret.copy())

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
          commit.editor.buffer.remove(offsets, true)
        } else {
          commit.editor.buffer.insert(commit.editor.buffer.getOffsetPoint(offsets[0]), text, true)
        }
        break
      case 'remove':
        if ('undo' === type) {
          commit.editor.buffer.insert(commit.editor.buffer.getOffsetPoint(offsets[0]), text, true)
        } else {
          commit.editor.buffer.remove(offsets, true)
        }
        break
    }
  })

  if (this.didSave) {
    this.emit('save')
    this.didSave = false
  }
  this.emit('change', commit.editor)

  return commit.editor
}

History.prototype.commit = function () {
  var editor = this.meta.editor
  var log = editor.buffer.log
  editor.buffer.log = []
  return {
    editor,
    log: log,
    undo: this.meta,
    redo: {
      editor: editor,
      caret: editor.caret.pos.copy(),
      mark: editor.mark.copy(),
      markActive: editor.markActive
    }
  }
}

History.prototype.saveMeta = function () {
  this.meta = {
    editor: this.editor,
    caret: this.editor.caret.pos.copy(),
    mark: this.editor.mark.copy(),
    markActive: this.editor.markActive
  }
}
