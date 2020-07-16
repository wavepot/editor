export default class SharedBuffer {
  constructor (channels, length) {
    this.buffer = Array(channels).fill().map(() =>
      new SharedArrayBuffer(
        length * Float32Array.BYTES_PER_ELEMENT
      )
    )

    this.output = Array(channels).fill().map((_, i) =>
      new Float32Array(this.buffer[i], 0, length)
    )
  }
}
