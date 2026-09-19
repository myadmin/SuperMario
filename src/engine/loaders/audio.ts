/**
 * loaders/audio.ts — ported verbatim from upstream `public/js/loaders/audio.js`.
 * Sound specs are fetched from /sounds/<name>.json and decoded into AudioBuffers.
 */
import AudioBoard from '../AudioBoard'
import { loadJSON } from './loaders'

type AudioSheet = { fx: Record<string, { url: string }> }

export function loadAudioBoard(name: string, audioContext: AudioContext): Promise<AudioBoard> {
  const loadAudio = createAudioLoader(audioContext)
  return loadJSON<AudioSheet>(`/sounds/${name}.json`).then((audioSheet) => {
    const audioBoard = new AudioBoard()
    const fx = audioSheet.fx
    return Promise.all(
      Object.keys(fx).map((fxName) => {
        return loadAudio(fx[fxName].url).then((buffer) => {
          audioBoard.addAudio(fxName, buffer)
        })
      }),
    ).then(() => {
      return audioBoard
    })
  })
}

export function createAudioLoader(context: AudioContext) {
  return function loadAudio(url: string): Promise<AudioBuffer> {
    return fetch(url)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
  }
}
