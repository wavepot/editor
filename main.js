import Clock from './clock.js'
import Storage from './storage.js'
import Context from './dsp-context.js'
import SharedBuffer from './shared-buffer.js'
import singleGesture from './lib/single-gesture.js'
import readMethods from './read-methods.js'
import DynamicCache from './dynamic-cache.js'

DynamicCache.install()

const app = window.app = {
  bpm: 140,
  scripts: {},
  editors: {},
  targets: {},
  controlEditors: {},
  editorWidth: window.innerWidth - 170,
  editorHeight: window.innerHeight - 30,
  storage: new Storage,
  cache: new DynamicCache('wavepot', { 'Content-Type': 'application/javascript' }),
  start () {
    if (app.audio) return
    app.audio =
    app.context =
    app.audioContext = new AudioContext({
      numberOfChannels: 2,
      sampleRate: 44100
    })
    app.audio.onstatechange = e => {
      console.log('audio context state change:', app.audio.state)
    }
    app.audio.destination.addEventListener('bar', app.onbar)
    app.clock = new Clock
    app.clock.connect(app.audio.destination)
    app.clock.setBpm(app.bpm)
    app.clock.reset()
    app.clock.start()
    // app.analyser = app.audio.createAnalyser()
    // app.analyser.fftSize = 2 ** 13 // ^5..15
    // app.byteTimeDomainData = new Uint8Array(app.analyser.frequencyBinCount)
    // app.analyser.connect(app.audio.destination)
    app.gain = app.audio.createGain()
    app.gain.connect(app.audio.destination)
    app.buffer = app.audio.createBuffer(
      1,
      app.clock.lengths.bar,
      app.audio.sampleRate
    )
    app.source = app.audio.createBufferSource()
    app.source.buffer = app.buffer
    app.source.connect(app.gain)
    app.source.loop = true
    app.waveformsCanvas = new OffscreenCanvas(waves.width, waves.height)
    app.waves = waves.getContext('2d')
    app.waveforms = app.waveformsCanvas.getContext('2d')
    app.waveforms.scale(window.devicePixelRatio, window.devicePixelRatio)
  },
  resume () {
    app.audio.resume()
    cancelAnimationFrame(app.animFrame)
    app.animFrame = requestAnimationFrame(app.animTick)
  },
  suspend () {
    app.audio.suspend()
    cancelAnimationFrame(app.animFrame)
  },
  onbar () {
    // console.log('bar')
  },
  drawWaveForm (wave) {
    const ctx = app.waveforms
    const width = ctx.canvas.width*2 // window.devicePixelRatio + 1
    const height = 75
    ctx.save()
    ctx.fillStyle = '#000' //'#99ff00'
    ctx.fillRect(0, 0, width, height)
    // ctx.strokeStyle = '#a6e22e' //'#568208' //'#99ff00'
    const color = 'rgba(215,255,105,0.46)'
    const peak = '#f31'
    ctx.lineWidth = .5
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    const y = height
    const h = height / 2
    const s = 32
    ctx.moveTo(0, h)
    const w = Math.floor(wave.length / width)
    for (let x = 0; x < width; x++) {
      ctx.beginPath()
      let max = Math.abs(Math.max(...wave.slice(x*w, x*w+w)))
      if (max > 1) {
        ctx.strokeStyle = peak
        max = 1
      }
      else ctx.strokeStyle = color

      // let sum = 0
      // for (let i = x*w; i < x*w+w; i += s) {
        // sum += Math.abs(wave[i])
      // }
      // let avg = Math.min(1, (sum / (w / s) )) * h

      ctx.moveTo(x/2/2, h - (max * h))
      ctx.lineTo(x/2/2, h + (max * h))
      ctx.stroke()
    }
    ctx.lineTo(width, h)
    ctx.stroke()
    ctx.restore()
  },
  animTick () {
    app.animFrame = requestAnimationFrame(app.animTick)
    const ctx = app.waves
    ctx.drawImage(app.waveformsCanvas, 0, 0)
    ctx.save()
    ctx.beginPath()
    ctx.lineWidth = window.devicePixelRatio
    const x = ((app.clock.c.time % app.clock.t.bar) / app.clock.t.bar) * waves.width
    ctx.strokeStyle = '#a2a2b2'
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 150)
    ctx.stroke()
    ctx.restore()
  },
  // animTick () {
  //   app.animFrame = requestAnimationFrame(app.animTick)
  //   const ctx = app.waves
  //   app.analyser.getByteTimeDomainData(app.byteTimeDomainData)
  //   const width = ctx.canvas.width
  //   const height = 50
  //   ctx.clearRect(0, 0, width, height * 2)
  //   ctx.strokeStyle = '#a6e22e' //'#99ff00'
  //   ctx.lineWidth = 1.2
  //   ctx.beginPath()

  //   const sliceWidth = width / app.byteTimeDomainData.length / 2

  //   for(let i = 0, x = 0; i < app.byteTimeDomainData.length; i++) {

  //     let v = (app.byteTimeDomainData[i]) / 128.0
  //     let y = v * height

  //     if (i === 0) {
  //       ctx.moveTo(x, y)
  //     } else {
  //       ctx.lineTo(x, y)
  //     }

  //     x += sliceWidth
  //   }
  //   ctx.lineTo(width, height)
  //   ctx.stroke()
  // },
  async onchange (editor) {
    console.log('changed', editor)
    await app.storeEditor(editor)
    const filename = await app.saveEditor(editor)
    const methods = await readMethods(filename)
    if (!methods.default) {
      throw new Error('Render Error: no `export default` found')
    }
    editor = {
      ...editor,
      filename,
      method: methods.default,
      bars: 1,
      channels: 1
    }
    const worker = await app.renderEditor(editor)
    const { output } = worker.context
    for (const [i, data] of output.entries()) {
      app.buffer.getChannelData(i).set(data)
    }
    console.log(editor.title, ': render complete')
    if (app.scripts[editor.id].worker) {
      console.log(editor.title, ': terminate previous worker')
      app.scripts[editor.id].worker.terminate()
    }
    app.scripts[editor.id].worker = worker
    app.drawWaveForm(output[0])
  },
  async renderEditor (editor, bar = 0) {
    const worker = new Worker('./dsp-worker.js', { type: 'module' })

    worker.onerror = e => console.error(e)
    worker.onmessage = ({ data }) => app[data.call](worker, data)

    const ctx = worker.context = new Context({
      filename: editor.filename,
      method: editor.method,
      bars: editor.bars,
      channels: editor.channels,
      // _canvas: this.offscreenCanvas,
      length: app.clock.lengths.bar,
      lengths: app.clock.lengths,
      totalLength: app.clock.lengths.bar * editor.bars,
      sampleRate: app.audioContext.sampleRate
    })

    const script = app.scripts[editor.id]
    if (script && script.editor.channels === editor.channels) {
      worker.context.n = script.worker.context.n
      worker.context.output = script.worker.context.output
    } else {
      app.scripts[editor.id] = { editor }
      const sharedBuffer = new SharedBuffer(
        worker.context.channels,
        worker.context.length
      )
      worker.context.n = bar * length
      // worker.context._input = input
      worker.context.output = sharedBuffer.output
    }

    await app.setup(worker)
    await app.render(worker)
    return worker
  },
  render (worker) {
    return new Promise(resolve => {
      worker.renderResolve = output => {
        // if (input && !worker.context.inputAccessed) {
        //   for (let c = 0; c < Math.max(input.length, output.length); c++) {
        //     const channelIn = input[c % input.length]
        //     const channelOut = output[c % output.length]
        //     for (let i = 0; i < channelIn.length; i++) {
        //       channelOut[i] += channelIn[i]
        //     }
        //   }
        // }
        resolve(output)
        // worker.context._input = null
      }
      worker.postMessage({ call: 'render', context: worker.context })
    })
  },
  setup (worker) {
    worker.postMessage({ call: 'setup', context: worker.context })
    //, [this.offscreenCanvas])
    return new Promise((resolve, reject) => {
      worker.setupTimeout = setTimeout(() => {
        console.error('Worker setup timeout')
        console.dir(worker.context)
        reject()
      }, 10000)
      worker.setupResolve = resolve
    })
  },
  onsetup (worker, { context }) {
    clearTimeout(worker.setupTimeout)
    worker.context.put(context)
    worker.setupResolve()
  },
  onrender (worker, e) {
    worker.context.put(e.context)
    worker.renderResolve(e.context.output)
  },
  async saveEditor (editor) {
    app.editors[editor.id] = editor
    return await app.cache.put(editor.controlEditor.title + '/' + editor.title, editor.value)
  },
  async storeEditor (editor) {
    app.editors[editor.id] = editor
    await app.storage.setItem('editor_' + editor.id, JSON.stringify({
      id: editor.id,
      title: editor.title,
      value: editor.value,
      controlEditor: {
        id: editor.controlEditor.id,
        title: editor.controlEditor.title
      }
    }))
    await app.storage.setItem('editors', JSON.stringify(Object.keys(app.editors)))
  },
  async restoreState () {
    // restore all editors
    const editors = JSON.parse(await app.storage.getItem('editors'))
    for (const id of editors.values()) {
      const editor = JSON.parse(await app.storage.getItem('editor_' + id))
      app.editors[id] = editor
      await app.saveEditor(editor)
    }

    // restore control editors
    const controlEditors = app.controlEditors = {}
    for (const editor of Object.values(app.editors)) {
      if (!(editor.controlEditor.id in controlEditors)) {
        controlEditors[editor.controlEditor.id] = await createEditor(app.editors[editor.controlEditor.id])
      }
    }
    // restore subeditors
    for (const editor of Object.values(app.editors)) {
      if (editor.id !== editor.controlEditor.id) {
        controlEditors[editor.controlEditor.id].worker.postMessage({
          call: 'addSubEditor',
          ...app.editors[editor.id]
        })
      }
    }

    // restore history
    for (const id in controlEditors) {
      const history = JSON.parse(await app.storage.getItem('history_' + id))
      if (!history) continue
      controlEditors[id].worker.postMessage({
        call: 'restoreHistory',
        ...history
      })
      controlEditors[id].undoCurrentHistory()
      Object.assign(controlEditors[id].history, history)
      controlEditors[id].updateHistory()
    }

    for (const id in controlEditors) {
      app.onchange(controlEditors[id])
    }
  },
  async storeHistory (controlEditor, history) {
    await app.storage.setItem('history_' + controlEditor.id, JSON.stringify(history))
  },
}

const isWithin = (e, { left, top, right, bottom }) => {
  left -= canvases.scrollLeft
  right -= canvases.scrollLeft
  top -= canvases.scrollTop
  bottom -= canvases.scrollTop
  if ((e.clientX ?? e.pageX) >= left && (e.clientX ?? e.pageX) <= right
  && (e.clientY ?? e.pageY) >= top && (e.clientY ?? e.pageY) <= bottom) {
    return true
  }
}

const createEventsHandler = parent => {
  const targets = {}

  const handlerMapper = (target, type) => eventName => {
    const handler = e => {
      if (type === 'key') {
        if (eventName === 'onkeydown') {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            return app.audio.state === 'running'
              ? app.suspend()
              : app.resume()
          }
        }
      }
      if (type === 'mouse') {
        if (eventName === 'onmouseup') targets.forceWithin = null
        if (eventName === 'onmousedown') targets.forceWithin = targets.hover
        if (targets.forceWithin) {
          return targets.forceWithin.handleEvent(type, eventName, e)
        }
        if (targets.hover && isWithin(e, targets.hover)) {
          return targets.hover.handleEvent(type, eventName, e)
        }
      } else if (targets.focus) {
        return targets.focus.handleEvent(type, eventName, e)
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

const createEditor = async (data = {}) => {
  data.id = data.id ?? (Math.random() * 10e6 | 0).toString(36)
  data.title = data.title ?? 'untitled'
  data.value = data.value ?? ''
  let onready
  let textarea
  let selectionText = ''
  let history = { log: [null], needle: 1, lastNeedle: 1 }
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
          app.storeHistory(controlEditor, history)
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
  canvas.width = app.editorWidth * pixelRatio
  canvas.height = app.editorHeight * pixelRatio
  canvas.style.width = `${app.editorWidth}px`
  canvas.style.height = `${app.editorHeight}px`
  canvases.appendChild(canvas)

  const worker = new Worker('./editor-worker.js', { type: 'module' })
  worker.onerror = e => console.error(e)

  let resolveReady

  const methods = {
    onready () {
      const pos = canvas.getBoundingClientRect().toJSON()
      const outerCanvas = canvas.transferControlToOffscreen()
      worker.postMessage({
        call: 'setup',
        ...data,
        pos,
        outerCanvas,
        pixelRatio
      }, [outerCanvas])
      resolveReady()
    },
    onchange (e) {
      app.onchange(e)
    },
    onhistory (_history) {
      const lastNeedle = history.needle

      history.log = _history.log
      history.needle = _history.needle
      history.lastNeedle = _history.lastNeedle

      if (textarea && _history.needle !== lastNeedle) {
        textarea.select()
        document.execCommand('insertText', false, _history.needle)
      }

      app.storeHistory(controlEditor, history)
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

  const updateHistory = () => {
    if (textarea) {
      textarea.focus()
      ignore = true
      for (var i = 1; i <= history.log.length; i++) {
        textarea.select()
        document.execCommand('insertText', false, i)
      }
      for (var i = history.needle; i < history.log.length; i++) {
        document.execCommand('undo', false)
      }
      ignore = false
      textarea.selectionStart = -1
      textarea.selectionEnd = -1
    }
  }

  const undoCurrentHistory = () => {
    if (textarea) {
      ignore = true
      textarea.focus()
      for (var i = 1; i <= history.needle; i++) {
        document.execCommand('undo', false)
      }
      ignore = false
      textarea.selectionStart = -1
      textarea.selectionEnd = -1
    }
  }

  eventHandlers.window = eventMapper((e, eventName) => {
    if (eventName === 'onfocus') {
      removeTextArea()
      createTextArea(e)
      updateHistory()
    }
    if (eventName === 'onblur') {
      undoCurrentHistory()
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

  const controlEditor = {
    ...data,
    canvas,
    worker,
    history,
    handleEvent,
    updateHistory,
    undoCurrentHistory,
    ...canvas.getBoundingClientRect().toJSON()
  }

  const readyPromise = new Promise(resolve =>
    resolveReady = () => resolve(controlEditor)
  )

  return readyPromise
}

const events = createEventsHandler(window)

// const editors = []

// const create = (width, height, withSubs) => {
//   const editor = createEditor(width, height)
//   editor.setup(withSubs)
//   editors.push(editor)
// }

waves.width = 170 * window.devicePixelRatio
waves.height = window.innerHeight * window.devicePixelRatio
waves.style.height = window.innerHeight + 'px'
// waves.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio)

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
// create(window.innerWidth-170, window.innerHeight-30, true)
// create(window.innerWidth/3, window.innerHeight-30, true)
// create(window.innerWidth/3, window.innerHeight-30, true)
// create(window.innerWidth/3, window.innerHeight-30, true)
// create(window.innerWidth/3, window.innerHeight-30, true)
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
// waves.style.width = '170px'

// const targets = editors.map(editor => ({
//   el: editor,
//   ...editor.canvas.getBoundingClientRect().toJSON()
// }))

const targetHandler = type => e => {
  let _target = null
  Object.values(app.controlEditors).forEach(target => {
    if (isWithin(e, target)) _target = target
  })
  events.setTarget(type, _target, e)
}

const focusTargetHandler = targetHandler('focus')
const hoverTargetHandler = targetHandler('hover')

window.addEventListener('mousedown', focusTargetHandler, { passive: false })
window.addEventListener('mousewheel', hoverTargetHandler, { passive: false })
window.addEventListener('mousemove', hoverTargetHandler, { passive: false })

const start = async () => {
  app.start()
  singleGesture(() => {
    app.resume()
    app.source.start(app.clock.sync.bar)
  })

  await app.storage.init()
  try {
    await app.restoreState()
  } catch (err) {
    console.error('Error restoring state')
    console.error(err)
    console.log('Starting new session')
    const demo = await (await fetch('/demo.js')).text()
    const controlEditor = await createEditor({ title: 'demo', value: demo })
    controlEditor.controlEditor = controlEditor
    await app.storeEditor(controlEditor)
    app.controlEditors[controlEditor.id] = controlEditor
    await app.onchange(controlEditor)
  }
}

start()
