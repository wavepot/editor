const isWithin = (e, { left, top, right, bottom }) => {
  if (e.clientX >= left && e.clientX <= right
  && e.clientY >= top && e.clientY <= bottom) {
    return true
  }
}
const createEventsHandler = parent => {
  let focusTarget
  let hoverTarget

  let lastMoveEvent

  const handlerMapper = (target, type) => eventName => {
    const handler = e => {
      if (type === 'MouseEvent') {
        if (eventName === 'onmousemove') {
          lastMoveEvent = e
        }
        if (hoverTarget && isWithin(lastMoveEvent, hoverTarget)) {
          return hoverTarget.el['handle' + type](eventName, e)
        }
      } else if (focusTarget) {
        return focusTarget.el['handle' + type](eventName, e)
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
    'onmousemove',
  ].map(handlerMapper(parent, 'MouseEvent'))

  const keyEventHandlers = [
    'onkeydown',
    'onkeyup',
  ].map(handlerMapper(parent, 'KeyEvent'))

  const windowEventHandlers = [
    'onblur',
    'onfocus',
    'onresize',
  ].map(handlerMapper(window, 'WindowEvent'))

  return {
    setHoverTarget (target, e) {
      const previous = hoverTarget
      hoverTarget = target
      if (previous !== hoverTarget) {
        if (previous) {
          previous.el.handleMouseEvent('onmouseout', e)
        }
        if (hoverTarget) {
          hoverTarget.el.handleMouseEvent('onmouseenter', e)
        }
      }
    },
    setFocusTarget (target, e) {
      const previous = focusTarget
      focusTarget = target
      if (previous !== focusTarget) {
        if (previous) {
          previous.el.handleWindowEvent('onblur', e)
        }
        if (focusTarget) {
          focusTarget.el.handleWindowEvent('onfocus', e)
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
  let textarea
  let selectionText = ''
  let historyCount = 1
  let historyPointer = 1
  let ignore = true

  const createTextArea = e => {
    textarea = document.createElement('textarea')
    textarea.style.position = 'absolute'
    textarea.style.left = e.clientX + 'px'
    textarea.style.top = e.clientY + 'px'
    textarea.style.width = '100px'
    textarea.style.height = '100px'
    textarea.style.marginLeft = '-50px'
    textarea.style.marginTop = '-50px'
    textarea.style.opacity = 0
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
      const count = +textarea.value
      if (count !== historyPointer) {
        historyPointer = count
        textarea.selectionStart = -1
        textarea.selectionEnd = -1
        worker.postMessage({ call: 'onhistory', count })
      }
      textarea.selectionStart = -1
      textarea.selectionEnd = -1
    }
  }

  const canvas = document.createElement('canvas')
  const pixelRatio = window.devicePixelRatio
  canvas.width = width * pixelRatio
  canvas.height = height * pixelRatio
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const outerCanvas = canvas.transferControlToOffscreen()
  const worker = new Worker('./editor-worker.js', { type: 'module' })
  worker.postMessage({ call: 'setup', outerCanvas, pixelRatio }, [outerCanvas])

  const methods = {
    onhistory ({ count }) {
      textarea.select?.()
      historyCount = count
      historyPointer = count
      document.execCommand('insertText', false, count)
    },
    onselection ({ text }) {
      if (text.length) {
        textarea.select?.()
      } else {
        textarea.selectionStart = -1
        textarea.selectionEnd = -1
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
  const handleWindowEvent = eventMapper((e, eventName) => {
    if (eventName === 'onfocus') {
      removeTextArea()
      createTextArea(e)
      textarea.focus()
      ignore = true
      for (var i = 1; i <= historyCount; i++) {
        textarea.select()
        document.execCommand('insertText', false, i)
      }
      for (var i = historyPointer; i < historyCount; i++) {
        document.execCommand('undo', false)
      }
      ignore = false
      textarea.selectionStart = -1
      textarea.selectionEnd = -1
    }
    if (eventName === 'onblur') {
      // if (ignore) return
      ignore = true
      for (var i = 1; i <= historyPointer; i++) {
        document.execCommand('undo', false)
      }
      removeTextArea()
    }
    return {/* todo */}
  })
  const handleMouseEvent = eventMapper((e, eventName) => {
    if (eventName === 'onmouseenter') {
      if (textarea) {
        textarea.style.pointerEvents = 'all'
      }
    } else if (eventName === 'onmouseout') {
      if (textarea) {
        textarea.style.pointerEvents = 'none'
      }
    }
    const clientX = e.clientX
    const clientY = e.clientY
    const deltaX = (e.deltaX || 0) / 1000
    const deltaY = (e.deltaY || 0) / 1000
    if (textarea) {
      textarea.style.left = clientX + 'px'
      textarea.style.top = clientY + 'px'
    }
    return {
      clientX,
      clientY,
      deltaX,
      deltaY,
      left: e.which === 1,
      middle: e.which === 2,
      right: e.which === 3
    }
  })
  const handleKeyEvent = eventMapper(e => {
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
    handleKeyEvent,
    handleMouseEvent,
    handleWindowEvent
  }
}

const events = createEventsHandler(window)

const editors = []

const create = (width, height) => {
  const editor = createEditor(width, height)
  document.body.appendChild(editor.canvas)
  editors.push(editor)
}

// create(window.innerWidth - 260, 200)
// create(window.innerWidth, 200)
// create(200, 200)
create(300, window.innerHeight)
create(300, window.innerHeight)
create(300, window.innerHeight)
// create(window.innerWidth, window.innerHeight)
// for (let i = 0; i < 40; i++) create(70, 70)


const targets = editors.map(editor => ({
  el: editor,
  ...editor.canvas.getBoundingClientRect().toJSON()
}))

window.addEventListener('mousedown', e => {
  let _target = null
  targets.forEach(target => {
    if (isWithin(e, target)) _target = target
  })
  events.setFocusTarget(_target, e)
})

window.addEventListener('mousemove', e => {
  let _target = null
  targets.forEach(target => {
    if (isWithin(e, target)) _target = target
  })
  events.setHoverTarget(_target, e)
})
