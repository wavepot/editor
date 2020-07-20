import toFinite from './lib/to-finite.js'

export default (fn, context) => {
  const { output } = context

  context.renderStartTime = performance.now() / 1000

  const result = fn(context)

  try {
    if (result instanceof Float32Array) {
      context.handle = true
      // output[0].set(result)
    } else if (result?.[0] instanceof Float32Array) {
      context.handle = true
      for (let c = 0; c < result.length; c++) {
        // output[c].set(result[c])
      }
    } else if (result == null) {
      context.handle = true
    }
  } catch (err) {
    context.handle = true
    console.error(err)
  }

  if (context.handle) {
    context.n += output[0].length
  } else {
    context.n++

    if (Array.isArray(result)) {
      for (let c = 0; c < result.length; c++) {
        output[c][0] = toFinite(result[c])
      }
      renderMulti(fn, context)
    } else {
      output[0][0] = toFinite(result)
      renderMono(fn, context)
    }
  }

  context.renderDuration = performance.now() / 1000 - context.renderStartTime
}

const renderMono = (fn, context) => {
  const { output } = context
  const length = output[0].length

  for (let i = 1;
    i < length; // render one length
    i++,
    context.n++ // increment sample position
  ) {
    output[0][i] = toFinite(fn(context))
  }
}

const renderMulti = (fn, context) => {
  const { output } = context
  const length = output[0].length
  const channels = output.length

  for (let i = 1,
    channel = 0,
    sample = [];
    i < length; // render one length
    i++,
    context.n++ // increment sample position
  ) {
    sample = fn(context)
    for (channel = 0; channel < channels; channel++) {
      output[channel][i] = toFinite(sample[channel])
    }
  }
}
