import toFinite from './lib/to-finite.js'
import Context from './dsp-context.js'
import render from './dsp-render.js'

const worker = self.worker = {
  fn: null,

  callbacks: {},

  callback ({ id, data }) {
    this.callbacks[id](data)
  },

  async setup ({ context }) {
    context = Context(context)
    const { filename, method, _canvas } = context

    this.canvas = _canvas

    const module = await import(filename)
    this.fn = module[method.name]

    if (method.type === 'AsyncFunction') {
      context.setupStartTime = performance.now() / 1000
      this.fn = await this.fn(context)
      context.setupDuration = performance.now() / 1000 - context.setupStartTime
    }

    postMessage({ call: 'onsetup', context: { ...context.toJSON(), _canvas: null }})
  },

  render ({ context }) {
    context = Context(context)
    render(this.fn, context)
    postMessage({ call: 'onrender', context: context.toJSON() })
  },

  draw ({ context }) {
    context = Context({ ...context.toJSON(), _canvas: this.canvas })
    setInterval(this.fn, 1000 / 60, context)
  }
}

onmessage = ({ data }) => worker[data.call](data)
