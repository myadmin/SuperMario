/**
 * traits/Physics.ts — ported verbatim from upstream `public/js/traits/Physics.js`.
 * Integrates position with per-axis tile collision, then applies level gravity.
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

export default class Physics extends Trait {
  update(entity: Entity, gameContext: GameContext, level: Level) {
    const { deltaTime } = gameContext
    entity.pos.x += entity.vel.x * deltaTime
    level.tileCollider.checkX(entity, gameContext, level)

    entity.pos.y += entity.vel.y * deltaTime
    level.tileCollider.checkY(entity, gameContext, level)

    entity.vel.y += level.gravity * deltaTime
  }
}
