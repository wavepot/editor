const outer = document.getElementById('outer')
const pixelRatio = window.devicePixelRatio
const width = 200
const height = 100
outer.width = width * pixelRatio
outer.height = height * pixelRatio
outer.style.width = `${width}px`
outer.style.height = `${height}px`
const outerCanvas = outer.transferControlToOffscreen()
const worker = new Worker('./editor-worker.js')

worker.postMessage({ call: 'setup', outerCanvas, pixelRatio }, [outerCanvas])

const mouseEvent = e => {
  const clientX = e.clientX
  const clientY = e.clientY
  const deltaX = (e.deltaX || 0) / 1000
  const deltaY = (e.deltaY || 0) / 1000
  return {
    clientX,
    clientY,
    deltaX,
    deltaY,
    left: e.which === 1,
    middle: e.which === 2,
    right: e.which === 3
  }
}

const mouseEventHandlers = [
  'onmousewheel',
  'onmousedown'
].map(eventName => {
  const handler = e => {
    e.preventDefault()
    e.stopPropagation()
    worker.postMessage({
      call: eventName,
      ...mouseEvent(e)
    })
  }
  window.addEventListener(
    eventName.slice(2),
    handler,
    { passive: false }
  )
  return handler
})
