export default (buffer, n) => buffer[(n|0) % buffer.length]
