/**
 * traits/Trigger.ts — ported verbatim from upstream `public/js/traits/Trigger.js`.
 * Collects overlapping entities during the collision pass, then fires all
 * registered conditions once per tick.
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

export default class Trigger extends Trait {
  touches = new Set<Entity>()
  conditions: Array<(entity: Entity, touches: Set<Entity>, gc: GameContext, level: Level) => void> = []

  collides(_us: Entity, them: Entity) {
    this.touches.add(them)
  }

  update(entity: Entity, gameContext: GameContext, level: Level) {
    if (this.touches.size > 0) {
      for (const condition of this.conditions) {
        condition(entity, this.touches, gameContext, level)
      }
      this.touches.clear()
    }
  }
}
