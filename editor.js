import PseudoWorker from './worker.js'
import ask from './lib/prompt.js'

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const pixelRatio = window.devicePixelRatio

let ignore = false
let selectionText = ''
let textarea

export const editors = {}

export default class Editor {
  constructor (data) {
    this.onchange(data)

    editors[this.id] = this

    this.canvas = document.createElement('canvas')
    this.canvas.width = data.width * pixelRatio
    this.canvas.height = data.height * pixelRatio
    this.canvas.style.width = data.width + 'px'
    this.canvas.style.height = data.height + 'px'

    if (!this.pseudoWorker) {
      const workerUrl = new URL('worker.js', import.meta.url).href
      this.worker = new Worker(workerUrl, { type: 'module' })
      this.worker.onerror = error => this.onerror(error)
      this.worker.onmessage = ({ data }) => this[data.call](data)
    } else {
      this.setupPseudoWorker()
    }
  }

  async setupPseudoWorker () {
    this.worker = new PseudoWorker()
    this.worker.onerror = error => this.onerror(error)
    this.worker.onmessage = ({ data }) => this[data.call](data)
    this.worker.setupFonts()
  }

  onerror (error) {
    console.error(error)
  }

  onready () {
    const outerCanvas = this.pseudoWorker ? this.canvas : this.canvas.transferControlToOffscreen()
    this.worker.postMessage({
      call: 'setup',
      id: this.id,
      title: this.title,
      value: this.value,
      fontSize: this.fontSize,
      autoResize: this.autoResize,
      padding: this.padding,
      outerCanvas,
      pixelRatio,
    }, [outerCanvas])
  }

  async onchange (data) {
    Object.assign(this, data)
    if (this.cache) {
      this.filename = await this.cache.put(this.projectName + '/' + this.title, this.value)
      console.log('put in cache:', this.filename)
    }
  }

  onhistory (history) {
    this.history = history
  }

  onfocus () {
  }

  onselection ({ text }) {
    if (textarea) {
      if (text.length) {
        textarea.select()
      } else {
        textarea.selectionStart = -1
        textarea.selectionEnd = -1
      }
    }
    selectionText = text
  }

  onresize () {
    this.parent = this.parent ?? this.canvas.parentNode
    const rect = this.canvas.getBoundingClientRect()
    rect.y += window.pageYOffset
    rect.x += window.pageXOffset
    this.rect = rect
  }

  handleEvent (type, eventName, e = {}) {
    const data = eventHandlers[type](e, eventName, this)
    if (!data) return false
    // if (ignore) return false

    if (!(data.cmdKey && data.key === 'x')) {
      e.preventDefault?.()
      e.stopPropagation?.()
    }

    if ((data.ctrlKey || data.metaKey) && data.key === 'm') {
      e.preventDefault()
      ask('Change name', `Type a new name for "${this.title}"`, this.title).then(async (result) => {
        if (!result) return
        this.title = result.value
        this.worker
          .postMessage({
            call: 'renameEditor',
            id: this.id,
            title: this.title
          })
      })
      return false
    }

    this.worker.postMessage({ call: eventName, ...data })
  }
}

export const registerEvents = (parent) => {
  textarea = document.createElement('textarea')
  textarea.style.position = 'fixed'
  // textarea.style.left = (e.clientX ?? e.pageX) + 'px'
  // textarea.style.top = (e.clientY ?? e.pageY) + 'px'
  textarea.style.width = '100px'
  textarea.style.height = '100px'
  textarea.style.marginLeft = '-50px'
  textarea.style.marginTop = '-50px'
  textarea.style.opacity = 0
  textarea.style.visibility = 'none'
  textarea.style.resize = 'none'
  textarea.autocapitalize = 'none'
  textarea.autocomplete = 'off'
  textarea.spellchecking = 'off'
  textarea.value = 0

  document.body.appendChild(textarea)

  // create undo/redo capability
  textarea.select()
  document.execCommand('insertText', false, 1)
  textarea.select()
  document.execCommand('insertText', false, 2)
  document.execCommand('undo', false)
  textarea.selectionStart = -1
  textarea.selectionEnd = -1

  textarea.oncut = e => {
    e.preventDefault()
    e.clipboardData.setData('text/plain', selectionText)
    selectionText = ''
    events.targets?.focus?.worker.postMessage({ call: 'onkeydown', cmdKey: true, key: 'x' })
    textarea.selectionStart = -1
    textarea.selectionEnd = -1
  }

  textarea.oncopy = e => {
    e.preventDefault()
    e.clipboardData.setData('text/plain', selectionText)
  }

  textarea.onpaste = e => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    events.targets?.focus?.worker.postMessage({ call: 'onpaste', text })
  }

  textarea.oninput = e => {
    if (ignore) return

    ignore = true
    const editor = events.targets.focus
    const needle = +textarea.value
    if (needle === 0) { // is undo
      document.execCommand('redo', false)
      if (editor?.history) {
        if (editor.history.needle > 1) {
          editor.history.needle--
          editor.worker.postMessage({
            call: 'onhistory',
            needle: editor.history.needle
          })
        }
      }
    } else if (needle === 2) { // is redo
      document.execCommand('undo', false)
      if (editor?.history) {
        if (editor.history.needle < editor.history.log.length) {
          editor.history.needle++
          editor.worker.postMessage({
            call: 'onhistory',
            needle: editor.history.needle
          })
        }
      }
    }
    ignore = false
    // if (needle !== history.needle) {
    //   if (needle >= 1) {
    //     history.needle = needle
    //     textarea.selectionStart = -1
    //     textarea.selectionEnd = -1
    //     events.targets?.focus?.postMessage({ call: 'onhistory', needle })
    //     // app.storeHistory(editor, history)
    //   } else {
    //     document.execCommand('redo', false)
    //   }
    // }
    // document.execCommand('redo', false)

    textarea.selectionStart = -1
    textarea.selectionEnd = -1
  }

  const targetHandler = (e, type) => {
    if (ignore) return
    let _target = null
    for (const target of Object.values(editors)) {
      if (events.isWithin(e, target)) {
        _target = target
        break
      }
    }
    events.setTarget(type, _target, e)
  }

  const events = {
    ignore: false,
    targets: {},
    setTarget (type, target, e) {
      const previous = this.targets[type]

      let noBlur = false

      // enable overlayed items to handle their own events
      // so as far as we are concerned, the target is null
      if (target
      && e.target !== textarea
      && e.target !== target.canvas
      && e.target !== target.parent
      ) {
        target = null
        type = 'hover'
        noBlur = true
      }

      this.targets[type] = target

      if (previous !== target) {
        const focus = type === 'focus'
        if (previous && !noBlur) {
          previous.handleEvent(
            focus ? 'window' : 'mouse',
            focus ? 'onblur' : 'onmouseout',
            e
          )
        }
        if (target) {
          target.handleEvent(
            focus ? 'window' : 'mouse',
            focus ? 'onfocus' : 'onmouseenter',
            e
          )
          target.handleEvent('mouse', 'on' + e.type, e)
        }
      }
    },
    isWithin (e, { rect, parent }) {
      let { left, top, right, bottom } = rect
      left -= parent.scrollLeft //+ window.pageXOffset
      right -= parent.scrollLeft //+ window.pageXOffset
      top -= parent.scrollTop //+ window.pageYOffset
      bottom -= parent.scrollTop //+ window.pageYOffset
      if ((e.pageX ?? e.clientX) >= left && (e.pageX ?? e.clientX) <= right
      && (e.pageY ?? e.clientY) >= top && (e.pageY ?? e.clientY) <= bottom) {
        return true
      }
    },
    destroy () {
      const handlers = [
        ...mouseEventHandlers,
        ...keyEventHandlers,
        ...windowEventHandlers
      ]

      for (const [target, eventName, fn] of handlers.values()) {
        target.removeEventListener(eventName, fn)
      }

      window.removeEventListener('mousedown', focusTargetHandler, { capture: true, passive: false })
      window.removeEventListener('mousewheel', hoverTargetHandler, { capture: true, passive: false })
      window.removeEventListener('mousemove', hoverTargetHandler, { capture: true, passive: false })

      document.body.removeChild(textarea)
      textarea.oncut =
      textarea.oncopy =
      textarea.onpaste =
      textarea.oninput = null
      textarea = null
    }
  }

  const handlerMapper = (target, type) => eventName => {
    const handler = e => {
      let targets = events.targets

      if (!targets.forceWithin) {
        if (eventName === 'onmousedown') {
          targetHandler(e, 'focus')
        } else if (eventName === 'onmousewheel' || eventName === 'onmousemove') {
          targetHandler(e, 'hover')
        }
      }

      if (type === 'key') {
      }
      if (type === 'mouse') {
        if (eventName === 'onmouseup') {
          targets.forceWithin = null
        }
        if (eventName === 'onmousedown' && !targets.forceWithin) {
          targets.forceWithin = targets.hover
        }
        if (targets.forceWithin) {
          return targets.forceWithin.handleEvent?.(type, eventName, e)
        }
        if (targets.hover && events.isWithin(e, targets.hover)) {
          return targets.hover.handleEvent?.(type, eventName, e)
        }
      } else if (targets.focus) {
        return targets.focus.handleEvent?.(type, eventName, e)
      }
      if (type === 'window') {
        if (eventName === 'onfocus') {
          return targets.focus?.handleEvent?.(type, eventName, e)
        } else {
          for (const editor of Object.values(editors)) {
            editor.handleEvent?.(type, eventName, e)
          }
        }
      }
    }
    target.addEventListener(
      eventName.slice(2),
      handler,
      { passive: false }
    )
    return [target, eventName.slice(2), handler]
  }

  const mouseEventHandlers = [
    'onmousewheel',
    'onmousedown',
    'onmouseup',
    'onmouseover',
    'onmousemove',
  ].map(handlerMapper(parent, 'mouse'))

  const keyEventHandlers = [
    'onkeydown',
    'onkeyup',
  ].map(handlerMapper(parent, 'key'))

  const windowEventHandlers = [
    'onblur',
    'onfocus',
    'onresize',
    'oncontextmenu',
  ].map(handlerMapper(window, 'window'))

  return events
}

const eventHandlers = {
  window (e, eventName, editor) {
    if (eventName === 'oncontextmenu') {
      return
    }
    if (eventName === 'onfocus') {
  //     console.log('on focus', editor.id)

  //     if (!editor.history) return

  //     ignore = true

  //     textarea.focus()
  //     textarea.select()

  //     document.execCommand('undo', false)
  //     document.execCommand('undo', false)
  // console.log('here')
  //     textarea.select()
  //     if (editor.history.needle > 1) {
  //       document.execCommand('insertText', false, editor.history.needle)
  //     }
  //     if (editor.history.needle < editor.history.log.length) {
  //       document.execCommand('insertText', false, editor.history.needle)
  //       document.execCommand('undo', false)
  //     }
  //     console.log('focus...')

  //     ignore = false


      // return
      // ignore = true
      // textarea.focus()
      // textarea.select()
      // document.execCommand('insertText', false, 1)
      // ignore = false
      // return
      // removeTextArea()
      // createTextArea(e)
      // updateHistory()
    }
    if (eventName === 'onblur') {
      // undoCurrentHistory()
      // removeTextArea()
      // return
    }
    if (eventName === 'onresize') {
      // app.updateSizes()
      return {
        width: editor.width * pixelRatio,
        height: editor.height * pixelRatio
      }
    }
    return {/* todo */}
  },
  mouse (e, eventName, editor) {
    if (textarea) {
      if (eventName === 'onmouseenter') {
        textarea.style.pointerEvents = 'all'
        textarea.focus()
      } else if (eventName === 'onmouseout') {
        textarea.style.pointerEvents = 'none'
        textarea.blur()
      }
    }
    const rect = editor.rect
    const clientX = e.pageX
    const clientY = e.pageY
    const deltaX = (e.deltaX || 0) / 1000
    const deltaY = (e.deltaY || 0) / 1000
    if (textarea) {
      textarea.style.left = e.clientX + 'px'
      textarea.style.top = e.clientY + 'px'
    }
    return {
      clientX: clientX - rect.x,
      clientY: clientY - rect.y,
      deltaX,
      deltaY,
      left: e.which === 1,
      middle: e.which === 2,
      right: e.which === 3
    }
  },
  key (e, eventName) {
    const {
      key,
      which,
      altKey,
      shiftKey,
      ctrlKey,
      metaKey
    } = e
    const cmdKey = isMac ? metaKey : ctrlKey
    if (cmdKey && key === 'r') return false
    if (cmdKey && key === 'z') return false
    if (cmdKey && key === 'y') return false
    if (cmdKey && key === 'c') return false
    if (cmdKey && key === 'x') return false
    if (cmdKey && (key === 'v' || key === 'V')) return false
    if (cmdKey && shiftKey && key === 'J') return false
    return {
      key,
      which,
      char: String.fromCharCode(which),
      altKey,
      shiftKey,
      ctrlKey,
      metaKey,
      cmdKey
    }
  }
}
