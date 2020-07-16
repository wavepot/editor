import clip from '/dsp/softclip/index.js'
import { sin } from '/dsp/osc/index.js'
import arp from '/dsp/arp.js'
import envelope from '/dsp/envelope/index.js'

export default async (context) => {
  const hihat = await Hihat(context)
  const bass = await Bass(context)
  return t =>
    + kick(t)
    + hihat(t)
    + bass(t)
}

export const kick = t => {
  var kick =
    + sin(t, 19.5) * arp(t, 1/4, 37, 31, 13)
    + (arp(t, 1/4, 38.5, 48, 40)
    + arp(t, 1/4, 35, 49, 40))
    * envelope(t, 1/4, 42, 42, 20) * 1
  kick = clip(kick, 1)
  return kick * .8
}

// import arp from '/dsp/arp.js'
// import envelope from '/dsp/envelope/index.js'
// import clip from '/dsp/softclip/index.js'
import Wavetable from '/dsp/wavetable-osc/index.js'

export const Hihat = async (context) => {
  var hihat = 0
  var hihat_osc = Wavetable(context, 'noise', 5000, true)
  var hihat_delay = Array(100).fill(0)

  return t => {
    hihat = hihat_osc(2)
    hihat *= arp(t, 1/16, 5200, 20, 70)
    //hihat *= envelope(t+1/16, 1/16, 100, 3.8, 8, 70)
    hihat = clip(hihat, .61)
    hihat *= arp(t, 1/4, 10100, 17, 1)
    hihat_delay.push(-hihat)
    hihat_delay.shift()
    return (
      + hihat
      + hihat_delay[98] * .8
      + hihat_delay[69] * .7
      - hihat_delay[25] * .5
      - hihat_delay[72] * .7
    ) * .3
  }
}

`BASS`



import note from '/dsp/note/index.js'
// import arp from '/dsp/arp.js'
// import clip from '/dsp/softclip/index.js'
// import { sin } from '/dsp/osc/index.js'
// import Wavetable from '/dsp/wavetable-osc/index.js'

export var bassline = [
  'c1','c1','f#1','b0',
  'c1','c1','f#1','b0',
  // 'd#0','d#0','f1','b2',
  // 'd#1','d#1','f4','b3',
  // 'e0','e0','a0','c0',
].map(note)//.reverse()

var bass_synth = (t, osc, hz) => {
  hz *= 1
  var out = (
    + osc(hz) * .78
      // + saw(t, hz*1.6) * .33
      // + saw(t, hz*1.004) * .42
      // + saw(t, hz/2) * .62
      // + sin(t, hz) * .3
  )
  out = out * (arp(t+1.5, 1/16, .5, 30 + sin(t, .05) * 20, 4) * arp(t+1.5, 1/4, 2, 6, 2))
  return out
}

export const Bass = async (context) => {
  var bass = 0
  var bass_osc = Wavetable(context, 'saw', 120, true)
  var bass_delay = Array(60).fill(0)

  return t => {
    var bass_hz = bassline[Math.floor( (t*4) % 8 )]*2
    bass = bass_synth(t, bass_osc, bass_hz)
    bass_delay.push(-bass)
    bass_delay.shift()

    return clip(0
      + bass
      - bass_delay[2+Math.floor(t%5)]
      - bass_delay[Math.floor(t%18)]
      + bass_delay[56] * .7
      // - bass_delay[10]
      - bass_delay[22] * .2
      + bass_delay[48] * .4
      // - bass_delay[46]
      // - bass_delay[34]
      // - bass_delay[44]
      , .18) * .13
  }
}
