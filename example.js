import Editor, { registerEvents } from './editor.js'

const main = async () => {
  const value = await (await fetch('./history.js')).text()

  for (let i = 0; i < 5; i++) {
    const editor = new Editor({
      id: 'foo' + i,
      title: 'foo' + i,
      value, //: 'bar',
      width: 300,
      height: 330,
    })

    container.appendChild(editor.canvas)
    editor.parent = document.body
    editor.rect = editor.canvas.getBoundingClientRect()
  }

  registerEvents(document.body)
}

main()
