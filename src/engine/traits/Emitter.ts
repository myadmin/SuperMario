/**
 * traits/Emitter.ts — ported verbatim from upstream `public/js/traits/Emitter.js`.
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

export type EmitFn = (entity: Entity, gameContext: GameContext, level: Level) => void

export default class Emitter extends Trait {
  interval = 2
  coolDown = 2
  emitters: EmitFn[] = []

  emit(entity: Entity, gameContext: GameContext, level: Level) {
    for (const emitter of this.emitters) {
      emitter(entity, gameContext, level)
    }
  }

  update(entity: Entity, gameContext: GameContext, level: Level) {
    const { deltaTime } = gameContext
    this.coolDown -= deltaTime
    if (this.coolDown <= 0) {
      this.emit(entity, gameContext, level)
      this.coolDown = this.interval
    }
  }
}
