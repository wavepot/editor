import freqToFloat from './freq-to-float.js'

export const Filter = async () => {
  let x = 0.0, x1 = 0.0, x2 = 0.0
  let y = 0.0, y1 = 0.0, y2 = 0.0

  return (t, [b0, b1, b2, a1, a2]) => {
    x = t.input

    y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2

    x2 = x1
    x1 = x

    y2 = y1
    y1 = y

    return y
  }
}

export const lowpass = ({ sampleRate }, { cut = 1000, res = .5 } = {}) => {
  cut = freqToFloat({ sampleRate }, cut)

  let b0 = 0.0, b1 = 0.0, b2 = 0.0
  let a1 = 0.0, a2 = 0.0

  if (cut >= 1) {
    b0 = 1
    b1 = b2 = a1 = a2 = 0
  } else if (cut <= 0) {
    b0 = b1 = b2 = a1 = a2 = 0
  } else {
    res = Math.max(0, res)
    const g = Math.pow(10.0, 0.05 * res)
    const d = Math.sqrt((4 - Math.sqrt(16 - 16 / (g * g))) * 0.5)

    const u = Math.PI * cut
    const s = 0.5 * d * Math.sin(u)
    const b = 0.5 * (1 - s) / (1 + s)
    const k = (0.5 + b) * Math.cos(u)
    const a = 0.25 * (0.5 + b - k)

    b0 = 2 * a
    b1 = 4 * a
    b2 = b0
    a1 = 2 * -k
    a2 = 2 * b
  }

  return [b0, b1, b2, a1, a2]
}

export const highpass = ({ sampleRate }, { cut = 1000, res = .5 } = {}) => {
  cut = freqToFloat({ sampleRate }, cut)

  let b0 = 0.0, b1 = 0.0, b2 = 0.0
  let a1 = 0.0, a2 = 0.0

  if (cut >= 1) {
    b0 = b1 = b2 = a1 = a2 = 0
  } else if (cut <= 0) {
    b0 = 1
    b1 = b2 = a1 = a2 = 0
  } else {
    res = Math.max(0, res)
    const g = Math.pow(10.0, 0.05 * res)
    const d = Math.sqrt((4 - Math.sqrt(16 - 16 / (g * g))) * 0.5)

    const u = Math.PI * cut
    const s = 0.5 * d * Math.sin(u)
    const b = 0.5 * (1 - s) / (1 + s)
    const k = (0.5 + b) * Math.cos(u)
    const a = 0.25 * (0.5 + b + k)

    b0 = 2 * a
    b1 = -4 * a
    b2 = b0
    a1 = 2 * -k
    a2 = 2 * b
  }

  return [b0, b1, b2, a1, a2]
}

export const bandpass = ({ sampleRate }, { cut = 1000, res = .5 } = {}) => {
  cut = freqToFloat({ sampleRate }, cut)

  let b0 = 0.0, b1 = 0.0, b2 = 0.0
  let a1 = 0.0, a2 = 0.0

  if (cut > 0 && cut < 1) {
    if (res > 0) {
      const u = Math.PI * cut
      const a = Math.sin(u) / (2 * res)
      const k = Math.cos(u)
      const ia0 = 1 / (1 + a)

      b0 = a * ia0
      b1 = 0
      b2 = -a * ia0
      a1 = -2 * k * ia0
      a2 = (1 - a) * ia0
    } else {
      b0 = b1 = b2 = a1 = a2 = 0
    }
  } else {
    b0 = b1 = b2 = a1 = a2 = 0
  }

  return [b0, b1, b2, a1, a2]
}

export const lowshelf = ({ sampleRate }, { cut = 1000, res = .5, slope = 1 } = {}) => {
  cut = freqToFloat({ sampleRate }, cut)

  let b0 = 0.0, b1 = 0.0, b2 = 0.0
  let a1 = 0.0, a2 = 0.0

  res = Math.max(0, res)
  const g = Math.pow(10.0, 0.05 * res)

  if (cut >= 1) {
    b0 = g*g
    b1 = b2 = a1 = a2 = 0
  } else if (cut <= 0) {
    b0 = 1
    b1 = b2 = a1 = a2 = 0
  } else {
    const u = Math.PI * cut
    const a = 0.5 * Math.sin(u) * Math.sqrt((g + 1 / g) * (1 / slope - 1) + 2)
    const k = Math.cos(u)
    const k2 = 2 * Math.sqrt(g) * a
    const g1 = g + 1
    const gm1 = g - 1
    const g1k = g1*k
    const gm1k = gm1*k

    const ia0 = 1 / (g1 + gm1 * k + k2)
    b0 = (g * (g1 - gm1k + k2)) * ia0
    b1 = (2 * g * (gm1 - g1k)) * ia0
    b2 = (g * (g1 - gm1k - k2)) * ia0
    a1 = (-2 * (gm1 + g1k)) * ia0
    a2 = (g1 + gm1k - k2) * ia0
  }

  return [b0, b1, b2, a1, a2]
}

export const highshelf = ({ sampleRate }, { cut = 1000, res = .5, slope = 1 } = {}) => {
  cut = freqToFloat({ sampleRate }, cut)

  let b0 = 0.0, b1 = 0.0, b2 = 0.0
  let a1 = 0.0, a2 = 0.0

  res = Math.max(0, res)
  const g = Math.pow(10.0, 0.05 * res)

  if (cut >= 1) {
    b0 = g*g
    b1 = b2 = a1 = a2 = 0
  } else if (cut <= 0) {
    b0 = 1
    b1 = b2 = a1 = a2 = 0
  } else {
    const u = Math.PI * cut
    const a = 0.5 * Math.sin(u) * Math.sqrt((g + 1 / g) * (1 / slope - 1) + 2)
    const k = Math.cos(u)
    const k2 = 2 * Math.sqrt(g) * a
    const g1 = g + 1
    const gm1 = g - 1
    const g1k = g1*k
    const gm1k = gm1*k

    const ia0 = 1 / (g1 - gm1 * k + k2)
    b0 = (g * (g1 + gm1k + k2)) * ia0
    b1 = (-2 * g * (gm1 + g1k)) * ia0
    b2 = (g * (g1 + gm1k - k2)) * ia0
    a1 = (2 * (gm1 - g1k)) * ia0
    a2 = (g1 - gm1k - k2) * ia0
  }

  return [b0, b1, b2, a1, a2]
}

export const peaking = ({ sampleRate }, { cut = 1000, res = .5 } = {}) => {
  cut = freqToFloat({ sampleRate }, cut)

  let b0 = 0.0, b1 = 0.0, b2 = 0.0
  let a1 = 0.0, a2 = 0.0

  if (cut > 0 && cut < 1) {
    res = Math.max(0, res)
    const g = Math.pow(10.0, 0.05 * res)

    if (res > 0) {
      const u = Math.PI * cut
      const a = Math.sin(u) / (2 * res)
      const k = Math.cos(u)
      const ia0 = 1 / (1 + a / g)

      b0 = (1 + a * g) * ia0
      b1 = (-2 * k) * ia0
      b2 = (1 - a * g) * ia0
      a1 = b1
      a2 = (1 - a / g) * ia0
    } else {
      b0 = g * g
      b1 = b2 = a1 = a2 = 0
    }
  } else {
    b0 = 1
    b1 = b2 = a1 = a2 = 0
  }

  return [b0, b1, b2, a1, a2]
}

export const allpass = ({ sampleRate }, { cut = 1000, res = .5 } = {}) => {
  cut = freqToFloat({ sampleRate }, cut)

  let b0 = 0.0, b1 = 0.0, b2 = 0.0
  let a1 = 0.0, a2 = 0.0

  if (cut > 0 && cut < 1) {
    res = Math.max(0, res)

    if (res > 0) {
      const u = Math.PI * cut
      const a = Math.sin(u) / (2 * res)
      const k = Math.cos(u)
      const ia0 = 1 / (1 + a)

      b0 = (1 - a) * ia0
      b1 = (-2 * k) * ia0
      b2 = (1 + a) * ia0
      a1 = b1
      a2 = b0
    } else {
      b0 = -1
      b1 = b2 = a1 = a2 = 0
    }
  } else {
    b0 = 1
    b1 = b2 = a1 = a2 = 0
  }

  return [b0, b1, b2, a1, a2]
}

export const notch = ({ sampleRate }, { cut = 1000, res = .5 } = {}) => {
  cut = freqToFloat({ sampleRate }, cut)

  let b0 = 0.0, b1 = 0.0, b2 = 0.0
  let a1 = 0.0, a2 = 0.0

  if (cut > 0 && cut < 1) {
    res = Math.max(0, res)

    if (res > 0) {
      const u = Math.PI * cut
      const a = Math.sin(u) / (2 * res)
      const k = Math.cos(u)
      const ia0 = 1 / (1 + a)

      b0 = ia0
      b1 = (-2 * k) * ia0
      b2 = ia0
      a1 = b1
      a2 = (1 - a) * ia0
    } else {
      b0 = b1 = b2 = a1 = a2 = 0
    }
  } else {
    b0 = 1
    b1 = b2 = a1 = a2 = 0
  }

  return [b0, b1, b2, a1, a2]
}
