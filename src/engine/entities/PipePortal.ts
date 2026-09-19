/**
 * entities/PipePortal.ts — ported verbatim from upstream `public/js/entities/PipePortal.js`.
 * An invisible portal whose Pipe direction comes from the spec's `props.dir`.
 */
import { Direction } from '../math'
import Entity from '../Entity'
import Pipe from '../traits/Pipe'
import { loadAudioBoard } from '../loaders/audio'
import type AudioBoard from '../AudioBoard'

export function loadPipePortal(audioContext: AudioContext) {
  return Promise.all([loadAudioBoard('pipe-portal', audioContext)]).then(([audio]) => {
    return createFactory(audio)
  })
}

function createFactory(audio: AudioBoard) {
  return function createPipePortal(props: { dir: keyof typeof Direction; [k: string]: unknown }) {
    const pipe = new Pipe()
    pipe.direction.copy(Direction[props.dir])
    const entity = new Entity()
    entity.props = props
    entity.audio = audio
    entity.size.set(24, 30)
    entity.addTrait(pipe)
    return entity
  }
}
