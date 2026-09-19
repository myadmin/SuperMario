/**
 * traits/Velocity.ts — ported verbatim from upstream `public/js/traits/Velocity.js`.
 * Pure integration, no tile collision (used by shrapnel / bullets / cheep-cheep).
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

export default class Velocity extends Trait {
  update(entity: Entity, { deltaTime }: GameContext, _level: Level) {
    entity.pos.x += entity.vel.x * deltaTime
    entity.pos.y += entity.vel.y * deltaTime
  }
}
