const isWithin = (e, { left, top, right, bottom }) => {
  left -= container.scrollLeft
  right -= container.scrollLeft
  top -= container.scrollTop
  bottom -= container.scrollTop
  if ((e.clientX ?? e.pageX) >= left && (e.clientX ?? e.pageX) <= right
  && (e.clientY ?? e.pageY) >= top && (e.clientY ?? e.pageY) <= bottom) {
    return true
  }
}

const createEventsHandler = parent => {
  const targets = {}

  const handlerMapper = (target, type) => eventName => {
    const handler = e => {
      if (type === 'mouse') {
        if (eventName === 'onmouseup') targets.forceWithin = null
        if (eventName === 'onmousedown') targets.forceWithin = targets.hover
        if (targets.forceWithin) {
          return targets.forceWithin.el.handleEvent(type, eventName, e)
        }
        if (targets.hover && isWithin(e, targets.hover)) {
          return targets.hover.el.handleEvent(type, eventName, e)
        }
      } else if (targets.focus) {
        return targets.focus.el.handleEvent(type, eventName, e)
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
  ].map(handlerMapper(window, 'window'))

  return {
    setTarget (type, target, e) {
      const previous = targets[type]
      targets[type] = target
      if (previous !== target) {
        const focus = type === 'focus'
        if (previous) {
          previous.el.handleEvent(
            focus ? 'window' : 'mouse',
            focus ? 'onblur' : 'onmouseout',
            e
          )
        }
        if (target) {
          target.el.handleEvent(
            focus ? 'window' : 'mouse',
            focus ? 'onfocus' : 'onmouseenter',
            e
          )
        }
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
    }
  }
}

const createEditor = (width, height) => {
  let onready
  let textarea
  let selectionText = ''
  let history = { length: 1, needle: 1 }
  let ignore = true

  const createTextArea = e => {
    textarea = document.createElement('textarea')
    textarea.style.position = 'absolute'
    textarea.style.left = (e.clientX ?? e.pageX) + 'px'
    textarea.style.top = (e.clientY ?? e.pageY) + 'px'
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

    textarea.oncut = e => {
      e.preventDefault()
      e.clipboardData.setData('text/plain', selectionText)
      selectionText = ''
      worker.postMessage({ call: 'onkeydown', cmdKey: true, key: 'x' })
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
      worker.postMessage({ call: 'onpaste', text })
    }

    textarea.oninput = e => {
      if (ignore) return
      const needle = +textarea.value
      if (needle !== history.needle) {
        if (needle >= 1) {
          history.needle = needle
          textarea.selectionStart = -1
          textarea.selectionEnd = -1
          worker.postMessage({ call: 'onhistory', needle })
        } else {
          document.execCommand('redo', false)
        }
      }
      textarea.selectionStart = -1
      textarea.selectionEnd = -1
    }
  }

  const removeTextArea = () => {
    if (textarea) {
      document.body.removeChild(textarea)
      textarea.oncut =
      textarea.oncopy =
      textarea.onpaste =
      textarea.oninput = null
      textarea = null
    }
  }

  const canvas = document.createElement('canvas')
  const pixelRatio = window.devicePixelRatio
  canvas.width = width * pixelRatio
  canvas.height = height * pixelRatio
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const worker = new Worker('./editor-worker.js', { type: 'module' })
  worker.onerror = e => console.error(e)

  const methods = {
    onready () {
      onready() // TODO: don't use an ugly hack
    },
    onchange (e) {
      console.log('changed:', e)
    },
    onhistory ({ length, needle }) {
      const lastNeedle = history.needle
      history.length = length
      history.needle = needle
      if (textarea && needle !== lastNeedle) {
        textarea.select()
        document.execCommand('insertText', false, needle)
      }
    },
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
  }

  worker.onmessage = ({ data }) => methods[data.call](data)

  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const eventMapper = fn => (eventName, e) => {
    const data = fn(e, eventName)
    if (!data) return false

    // if (ignore) return false

    if (!(data.cmdKey && data.key === 'x')) {
      e.preventDefault?.()
      e.stopPropagation?.()
    }
    worker.postMessage({
      call: eventName,
      ...data
    })
  }
  const eventHandlers = {}
  const handleEvent = (type, eventName, e) => eventHandlers[type](eventName, e)
  eventHandlers.window = eventMapper((e, eventName) => {
    if (eventName === 'onfocus') {
      removeTextArea()
      createTextArea(e)
      textarea.focus()
      ignore = true
      for (var i = 1; i <= history.length; i++) {
        textarea.select()
        document.execCommand('insertText', false, i)
      }
      for (var i = history.needle; i < history.length; i++) {
        document.execCommand('undo', false)
      }
      ignore = false
      textarea.selectionStart = -1
      textarea.selectionEnd = -1
    }
    if (eventName === 'onblur') {
      ignore = true
      for (var i = 1; i <= history.needle; i++) {
        document.execCommand('undo', false)
      }
      removeTextArea()
    }
    return {/* todo */}
  })
  eventHandlers.mouse = eventMapper((e, eventName) => {
    if (textarea) {
      if (eventName === 'onmouseenter') {
        textarea.style.pointerEvents = 'all'
      } else if (eventName === 'onmouseout') {
        textarea.style.pointerEvents = 'none'
      }
    }
    const pos = canvas.getBoundingClientRect()
    const clientX = e.clientX ?? e.pageX
    const clientY = e.clientY ?? e.pageY
    const deltaX = (e.deltaX || 0) / 1000
    const deltaY = (e.deltaY || 0) / 1000
    if (textarea) {
      textarea.style.left = clientX + 'px'
      textarea.style.top = clientY + 'px'
    }
    return {
      clientX: clientX - pos.x,
      clientY: clientY - pos.y,
      deltaX,
      deltaY,
      left: e.which === 1,
      middle: e.which === 2,
      right: e.which === 3
    }
  })
  eventHandlers.key = eventMapper(e => {
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
  })
  return {
    canvas,
    worker,
    handleEvent,
    setup (withSubs = false) {
      onready = () => {
        const pos = canvas.getBoundingClientRect().toJSON()
        const outerCanvas = canvas.transferControlToOffscreen()
        worker.postMessage({ call: 'setup', pos, outerCanvas, pixelRatio, withSubs }, [outerCanvas])
      }
    }
  }
}

const events = createEventsHandler(window)

const editors = []

const create = (width, height, withSubs) => {
  const editor = createEditor(width, height)
  container.appendChild(editor.canvas)
  editor.setup(withSubs)
  editors.push(editor)
}

// document.fonts.ready.then((fontFaceSet) => {
  // console.log(fontFaceSet.size)
    // console.log(fontFaceSet.size, 'FontFaces loaded.');
    // document.getElementById('waitScreen').style.display = 'none';
  // create(window.innerWidth - 260, 200)
  // create(window.innerWidth, 200)
  // create(200, 200, true)
  // create(300, window.innerHeight)
  // create(300, window.innerHeight)
  // create(300, window.innerHeight)
create(window.innerWidth/3, window.innerHeight-30, true)
create(window.innerWidth/3, window.innerHeight-30, true)
create(window.innerWidth/3, window.innerHeight-30, true)
create(window.innerWidth/3, window.innerHeight-30, true)
create(window.innerWidth/3, window.innerHeight-30, true)
// create(window.innerWidth/4, window.innerHeight-30, true)
// create(window.innerWidth/4, window.innerHeight-30, true)
// create(window.innerWidth/4, window.innerHeight-30, true)
// create(window.innerWidth/4, window.innerHeight-30, true)
// create(window.innerWidth/4, window.innerHeight-30, true)
// create(window.innerWidth/4, window.innerHeight-30, true)
// create(window.innerWidth/5, window.innerHeight, true)
// create(window.innerWidth/5, window.innerHeight, true)
// create(window.innerWidth/5, window.innerHeight, true)
  // for (let i = 0; i < 40; i++) create(70, 70)
// });


const targets = editors.map(editor => ({
  el: editor,
  ...editor.canvas.getBoundingClientRect().toJSON()
}))

const targetHandler = type => e => {
  let _target = null
  targets.forEach(target => {
    if (isWithin(e, target)) _target = target
  })
  events.setTarget(type, _target, e)
}

const focusTargetHandler = targetHandler('focus')
const hoverTargetHandler = targetHandler('hover')

window.addEventListener('mousedown', focusTargetHandler, { passive: false })
window.addEventListener('mousewheel', hoverTargetHandler, { passive: false })
window.addEventListener('mousemove', hoverTargetHandler, { passive: false })
