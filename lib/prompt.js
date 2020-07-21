export default (title, text, defaultValue) => {
  return new Promise(resolve => {
    const div = document.createElement('div')
    div.className = 'prompt'
    div.innerHTML = `
      <div class="inner">
        <div class="title">${title}</div>
        <div class="text">${text}</div>
        <input type="text" value="${defaultValue}">
        <div class="buttons">
          <button class="cancel">Cancel</button> <button class="ok">OK</button>
        </div>
      </div>
    `

    const keyListener = e => {
      e.stopPropagation()
      if (e.which === 13) ok()
      if (e.which === 27) cancel()
    }

    const prevent = e => {
      e.stopPropagation()
    }

    const preventEvents = [
      'keyup',
      'input',
      'keypress',
      'mousedown',
      'mouseup',
      'mousemove',
      'mousewheel'
    ]

    const cleanup = () => {
      window.removeEventListener('keydown', keyListener, { capture: true })
      preventEvents.forEach(event => {
        window.removeEventListener(event, prevent, { capture: true })
      })
      document.body.removeChild(div)
    }

    const ok = () => {
      cleanup()
      resolve({ value: div.querySelector('input').value })
    }

    const cancel = () => {
      cleanup()
      resolve(false)
    }

    div.querySelector('.ok').onclick = ok
    div.querySelector('.cancel').onclick = cancel

    window.addEventListener('keydown', keyListener, { capture: true })
    preventEvents.forEach(event => {
      window.addEventListener(event, prevent, { capture: true })
    })

    document.body.appendChild(div)

    div.querySelector('input').focus()
    div.querySelector('input').select()
  })
}
