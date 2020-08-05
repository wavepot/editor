let audio

export default () => {
  if (audio) return audio

  audio = new AudioContext({
    numberOfChannels: 2,
    sampleRate: 44100,
    latencyHint: 'playback' // without this audio glitches
  })

  audio.onstatechange = e => {
    console.log('audio context state change:', audio.state)
  }

  audio.gain = audio.createGain()
  audio.gain.gain.value = 0.3
  audio.gain.connect(audio.destination)

  return audio
}
