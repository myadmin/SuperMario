/**
 * traits/Gravity.ts — ported verbatim from upstream `public/js/traits/Gravity.js`.
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

export default class Gravity extends Trait {
  update(entity: Entity, { deltaTime }: GameContext, level: Level) {
    entity.vel.y += level.gravity * deltaTime
  }
}
