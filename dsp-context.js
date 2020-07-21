import render from './dsp-render.js'
// export default class Context {
//   constructor (data) {
//     this.n = 0
//     this.put(data)
//   }

//   get t () { // time is sample position divided by samples in beat
//     return (1 + this.n) / this.lengths.beat
//   }

//   get canvas () {
//     this.canvasAccessed = true
//     return this._canvas
//   }

//   get input () {
//     this.inputAccessed = true
//     return this._input
//   }

//   put (data) {
//     Object.assign(this, data)
//   }

//   valueOf () {
//     return this.t
//   }
// }
const proto = {
  n: {
    value: 0,
    enumerable: true,
    writable: true
  },
  t: {
    enumerable: true,
    get () {
      return (1 + this.n) / this.lengths.beat
    },
    set () {
      // noop
    }
  },
  input: {
    enumerable: true,
    get () {
      return this.output[0][this.n % this.output[0].length]
    },
    set () {
      // noop
    }
  },
  put: {
    value (data) {
      return Object.assign(this, data)
    }
  },
  toJSON: {
    value () {
      const obj = {}
      for (const key in this) {
        obj[key] = this[key]
      }
      return obj
    }
  },
  valueOf: {
    value () {
      return this.t
    }
  }
}

const Context = (data) => {
  let context = data
  const mix = (...fns) => {
    const n = data.n
    mix.handle = true
    for (const fn of fns) {
      context = Context(data).put(context)
      context.handle = false
      render(fn, context)
    }
  }

  Object.defineProperties(mix, proto)
  Object.assign(mix, data)

  return mix
}

export default Context
