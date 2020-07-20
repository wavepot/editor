import dateId from './lib/date-id.js'
import randomId from './lib/random-id.js'
import Clock from './clock.js'
import Storage from './storage.js'
import Context from './dsp-context.js'
import SharedBuffer from './shared-buffer.js'
import singleGesture from './lib/single-gesture.js'
import readMethods from './read-methods.js'
import DynamicCache from './dynamic-cache.js'

DynamicCache.install()

let ignore = true

const app = window.app = {
  bpm: 140,
  scripts: {},
  editors: {},
  controlEditors: {},
  editorWidth: window.innerWidth - 170,
  editorHeight: window.innerHeight - 30,
  storage: new Storage,
  cache: new DynamicCache('wavepot', { 'Content-Type': 'application/javascript' }),
  updateSizes () {
    app.editorWidth = ((window.innerWidth - 170) / Math.max(1, Math.min(2, Object.keys(app.controlEditors).length)))
    app.editorHeight = window.innerHeight - 30
    for (const editor of Object.values(app.controlEditors)) {
      editor.canvas.style.width = app.editorWidth + 'px'
      editor.canvas.style.height = app.editorHeight + 'px'
      const rect = editor.canvas.getBoundingClientRect().toJSON()
      rect.left += canvases.scrollLeft
      rect.right += canvases.scrollLeft
      rect.top += canvases.scrollTop
      rect.bottom += canvases.scrollTop
      Object.assign(editor, rect)
      editor.worker.postMessage({
        call: 'onresize',
        width: app.editorWidth * window.devicePixelRatio,
        height: app.editorHeight * window.devicePixelRatio,
      })
    }
  },
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

    app.waveformWorker = new Worker('./waveform-worker.js', { type: 'module' })
    app.waveformWorker.onerror = e => console.error(e)
    const waveformCanvasOffscreen = waves.transferControlToOffscreen()
    const linesCanvasOffscreen = lines.transferControlToOffscreen()
    app.waveformSharedClockTime = new SharedBuffer(1, 1)
    app.waveformWorker.postMessage({
      call: 'setup',
      canvas: waveformCanvasOffscreen,
      lines: linesCanvasOffscreen,
      clock: { time: app.waveformSharedClockTime.output[0], bar: app.clock.t.bar },
      pixelRatio: window.devicePixelRatio
    }, [waveformCanvasOffscreen, linesCanvasOffscreen])
  },
  resume () {
    app.audio.resume()
    cancelAnimationFrame(app.animFrame)
    app.animFrame = requestAnimationFrame(app.animTick)
    app.waveformWorker.postMessage({ call: 'resume' })
  },
  suspend () {
    app.audio.suspend()
    cancelAnimationFrame(app.animFrame)
    app.waveformWorker.postMessage({ call: 'suspend' })
  },
  onbar () {
    // console.log('bar')
  },
  redrawWaves () {
    app.waveformWorker.postMessage({ call: 'redrawWaves' })
    app.animTick(false)
  },
  animTick (animate) {
    cancelAnimationFrame(app.animFrame)
    if (animate !== false) app.animFrame = requestAnimationFrame(app.animTick)
    app.waveformSharedClockTime.output[0][0] = app.clock.c.time
    // app.waveformWorker.postMessage({ call: 'setClock', time: app.clock.c.time })
    // ctx.restore()
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
    editor = Object.assign(app.controlEditors[editor.id], editor)
    editor.changes++
    app.waveformWorker.postMessage({ call: 'createWaveform', id: editor.id })
    await app.storeEditor(editor)
    const filename = await app.saveEditor(editor)
    const methods = await readMethods(filename)
    if (!methods.default) {
      throw new Error('Render Error: no `export default` found')
    }

    let prevAudio
    if (editor.buffer && (
      (methods.bars && editor.bars !== Number(methods.bars?.value))
    || (methods.channels && editor.channels !== Number(methods.channels?.value))
    )) {
      prevAudio = editor.audio
      editor.buffer = null
      editor.audio = null
    }

    Object.assign(editor, {
      filename,
      method: methods.default,
      bars: Number(methods.bars?.value ?? 1),
      channels: Number(methods.channels?.value ?? 1)
    })

    let newAudio
    if (!editor.buffer) {
      newAudio = true

      editor.buffer = app.audio.createBuffer(
        editor.channels,
        editor.bars * app.clock.lengths.bar,
        app.audio.sampleRate
      )

      editor.audio = app.audio.createBufferSource()
      editor.audio.buffer = editor.buffer
      editor.audio.connect(app.gain)
      editor.audio.loop = true

      editor.sharedBuffer = new SharedBuffer(
        editor.channels,
        editor.buffer.length
      )

      if (editor.renderWorker) {
        console.log(editor.title, ': terminate previous worker')
        editor.renderWorker.terminate()
      }
      delete editor.renderWorker
    }

    const worker = await app.renderEditor(editor)
    const { output } = worker.context
    for (const [i, data] of output.entries()) {
      editor.buffer.getChannelData(i).set(data)
    }
    const syncTime = app.clock.sync.bar
    if (prevAudio) {
      try {
        prevAudio.stop(syncTime)
      } catch (err) {
        console.error(err)
      }
    }
    if (newAudio) {
      editor.syncTime = syncTime
      editor.audio.start(syncTime)
    }
    app.waveformWorker.postMessage({
      call: 'drawWaveform',
      id: editor.id,
      syncTime: editor.syncTime,
      bars: editor.bars,
      data: output[0]
    })
    console.log(editor.title, ': render complete')
    if (editor.renderWorker) {
      console.log(editor.title, ': terminate previous worker')
      editor.renderWorker.terminate()
    }
    editor.renderWorker = worker
    editor.changes--
  },
  async renderEditor (editor, bar = 0) {
    const worker = new Worker('./dsp-worker.js', { type: 'module' })

    worker.onerror = e => console.error(e)
    worker.onmessage = ({ data }) => app[data.call](worker, data)

    const ctx = worker.context = Context({
      filename: editor.filename,
      method: editor.method,
      bars: editor.bars,
      channels: editor.channels,
      // _canvas: this.offscreenCanvas,
      lengths: app.clock.lengths,
      totalLength: app.clock.lengths.bar * editor.bars,
      sampleRate: app.audioContext.sampleRate,
      output: editor.sharedBuffer.output
    })

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
      worker.postMessage({ call: 'render', context: worker.context.toJSON() })
    })
  },
  setup (worker) {
    worker.postMessage({ call: 'setup', context: worker.context.toJSON() })
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
    ignore = true

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

    await Promise.all(
      Object
        .values(controlEditors)
        .map(editor => app.onchange(editor)
    ))

    ignore = false
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
      let targets = events.targets
      if (type === 'key') {
        if (eventName === 'onkeydown') {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            if (app.audio.state === 'running') {
              app.suspend()
            } else {
              app.resume()
            }
            return false
          } else if ((e.ctrlKey || e.metaKey) && e.key === '=') {
            e.preventDefault()
            addNewEditor().then(() => app.updateSizes())
            return false
          } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
            e.preventDefault()
            const editor = events.targets.focus
            if (confirm('Delete track "' + editor.id + '" ?')) {
              editor.destroy()
              delete app.controlEditors[editor.id]
              delete app.editors[editor.id]
              if (!Object.keys(app.controlEditors).length) {
                addNewEditor().then(() => app.updateSizes())
              }
              events.targets = {}
              // app.waves.clearRect(0, 0, waves.width, waves.height)
              // app.waveforms.clearRect(0, 0, app.waveformsCanvas.width, app.waveformsCanvas.height)
              app.updateSizes()
              app.redrawWaves()
              app.storage.setItem('editors', JSON.stringify(Object.keys(app.editors)))
            }
            return false
          } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault()
            const allEditors = Object.fromEntries(Object.values(app.editors).map(editor => {
              const key = 'editor_' + editor.id
              return [key, localStorage.getItem(key)]
            }))
            const allHistory = Object.fromEntries(Object.values(app.editors).map(editor => {
              const key = 'history_' + editor.id
              return [key, localStorage.getItem(key)]
            }))
            const fullStateJson = JSON.stringify({
              editors: localStorage.editors,
              ...allEditors,
              ...allHistory
            }, null, 2)
            const filename = dateId(Object.values(app.controlEditors)[0].title) + '.json'
            const file = new File([fullStateJson], filename, { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(file)
            a.download = filename
            a.click()
          } else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault()
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.json'
            input.onchange = e => {
              const file = e.target.files[0]
              const projectName = file.name.split('.json')[0]
              const reader = new FileReader()
              reader.readAsText(file, 'utf-8')
              reader.onload = async e => {
                const fullState = JSON.parse(e.target.result)
                for (const [key, value] of Object.entries(fullState)) {
                  await app.storage.setItem(key, value)
                }
                for (const editor of Object.values(app.controlEditors)) {
                  editor.destroy()
                }
                app.controlEditors = {}
                app.editors = {}
                events.targets = {}
                await app.restoreState()
                // for (const editor of Object.values(app.controlEditors)) {
                //   editor.audio.start(app.clock.sync.bar)
                // }
              }
            }
            input.click()
            return false
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
      if (type === 'window') {
        for (const editor of Object.values(app.editors)) {
          editor.handleEvent(type, eventName, e)
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
  ].map(handlerMapper(window, 'window'))

  return {
    targets,
    setTarget (type, target, e) {
      const previous = this.targets[type]
      this.targets[type] = target
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
          app.storeHistory(editor, history)
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

  app.updateSizes()

  const worker = new Worker('./editor-worker.js', { type: 'module' })
  worker.onerror = e => console.error(e)
  const canvas = document.createElement('canvas')
  const pixelRatio = window.devicePixelRatio
  canvas.width = app.editorWidth * pixelRatio
  canvas.height = app.editorHeight * pixelRatio
  canvas.style.width = `${app.editorWidth}px`
  canvas.style.height = `${app.editorHeight}px`
  canvases.appendChild(canvas)

  let resolveReady

  const methods = {
    onready () {
      const pos = canvas.getBoundingClientRect().toJSON()
      pos.left += canvases.scrollLeft
      pos.right += canvases.scrollLeft
      pos.top += canvases.scrollTop
      pos.bottom += canvases.scrollTop
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

      app.storeHistory(editor, history)
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
      if (history.log.length > 1) {
        for (var i = 1; i <= history.log.length; i++) {
          textarea.select()
          document.execCommand('insertText', false, i)
        }
      }
      if (history.needle < history.log.length) {
        for (var i = history.needle; i < history.log.length; i++) {
          document.execCommand('undo', false)
        }
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
      if (history.needle > 1) {
        for (var i = 1; i <= history.needle; i++) {
          document.execCommand('undo', false)
        }
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
    if (eventName === 'onresize') {
      app.updateSizes()
      return {
        width: app.editorWidth * window.devicePixelRatio,
        height: app.editorHeight * window.devicePixelRatio
      }
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

  const rect = canvas.getBoundingClientRect().toJSON()
  rect.left += canvases.scrollLeft
  rect.right += canvases.scrollLeft
  rect.top += canvases.scrollTop
  rect.bottom += canvases.scrollTop

  const editor = {
    ...data,
    changes: 0,
    canvas,
    worker,
    history,
    handleEvent,
    updateHistory,
    undoCurrentHistory,
    ...rect
  }

  editor.destroy = () => {
    try { editor.worker.terminate() } catch (err) {
      console.error('Error terminating editor worker [' + editor.id + '] ' + editor.title)
    }
    try { editor.renderWorker.terminate() } catch (err) {
      console.error('Error terminating render worker [' + editor.id + '] ' + editor.title)
    }
    try { editor.audio.disconnect() } catch (err) {
      console.error('Error disconnecting audio [' + editor.id + '] ' + editor.title)
    }
    try { editor.undoCurrentHistory() } catch (err) {
      console.error('Error undoing history [' + editor.id + '] ' + editor.title)
    }
    try { canvases.removeChild(editor.canvas) } catch (err) {
      console.error('Error removing canvas [' + editor.id + '] ' + editor.title)
    }
  }

  const readyPromise = new Promise(resolve =>
    resolveReady = () => resolve(editor)
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
waves.style.width = 170 + 'px'
waves.style.height = window.innerHeight + 'px'

lines.width = 170 * window.devicePixelRatio
lines.height = window.innerHeight * window.devicePixelRatio
lines.style.width = 170 + 'px'
lines.style.height = window.innerHeight + 'px'
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
  if (ignore) return
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

const addNewEditor = async () => {
  const demo = await (await fetch('/demo.js')).text()
  const controlEditor = await createEditor({ title: 'untitled-' + randomId(), value: demo })
  controlEditor.controlEditor = controlEditor
  await app.storeEditor(controlEditor)
  app.controlEditors[controlEditor.id] = controlEditor
  // controlEditor.audio.start(app.clock.sync.bar)
  await app.onchange(controlEditor)
  return controlEditor
}

const start = async () => {
  app.start()
  app.suspend()
  singleGesture(() => {
    app.suspend()
    // for (const editor of Object.values(app.controlEditors)) {
      // editor.audio.start(app.clock.sync.bar)
    // }
  })

  await app.storage.init()
  try {
    await app.restoreState()
    app.updateSizes()
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
