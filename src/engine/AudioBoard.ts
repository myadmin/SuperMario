/**
 * AudioBoard.ts — ported verbatim from upstream `public/js/AudioBoard.js`.
 */
export default class AudioBoard {
  buffers = new Map<string, AudioBuffer>()

  addAudio(name: string, buffer: AudioBuffer) {
    this.buffers.set(name, buffer)
  }

  playAudio(name: string, context: AudioContext) {
    const source = context.createBufferSource()
    source.connect(context.destination)
    source.buffer = this.buffers.get(name)!
    source.start(0)
  }
}
