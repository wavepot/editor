
// bit operations for FFT
function revBit(k, n0) {
  const s1 = ((n0 & 0xaaaaaaaa) >>> 1) | ((n0 & 0x55555555) << 1);
  const s2 = ((s1 & 0xcccccccc) >>> 2) | ((s1 & 0x33333333) << 2);
  const s3 = ((s2 & 0xf0f0f0f0) >>> 4) | ((s2 & 0x0f0f0f0f) << 4);
  const s4 = ((s3 & 0xff00ff00) >>> 8) | ((s3 & 0x00ff00ff) << 8);
  const s5 = ((s4 & 0xffff0000) >>> 16) | ((s4 & 0x0000ffff) << 16);
  return s5 >>> (32 - k);
}

// FFT: Cooley-Tukey FFT
function fftc(N, c, T) {
  const k = Math.log2(N);
  const r = new Float64Array(N * 2);
  for (let i = 0; i < N; i++) {
    const i2 = i * 2, rbi2 = revBit(k, i) * 2;
    r[i2] = c[rbi2], r[i2 + 1] = c[rbi2 + 1];
  }
  for (let Nh = 1; Nh < N; Nh *= 2) {
    T /= 2;
    for (let s = 0; s < N; s += Nh * 2) {
      for (let i = 0; i < Nh; i++) {
        const li2 = (s + i) * 2, ri2 = li2 + Nh * 2;
        const are = r[ri2], aim = r[ri2 + 1];
        const bre = Math.cos(T * i), bim = Math.sin(T * i);
        const rre = are * bre - aim * bim, rim = are * bim + aim * bre;
        const lre = r[li2], lim = r[li2 + 1];
        r[li2] = lre + rre, r[li2 + 1] = lim + rim;
        r[ri2] = lre - rre, r[ri2 + 1] = lim - rim;
      }
    }
  }
  return r;
}
export default function fft(N, f) {
  return fftc(N, f, -2 * Math.PI);
}
function ifft(N, F) {
  const r = fftc(N, F, 2 * Math.PI);
  for (let i = 0; i < r.length; i++) r[i] /= N;
  return r;
}
