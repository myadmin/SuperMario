/**
 * traits/PendulumMove.ts — ported verbatim from upstream `public/js/traits/PendulumMove.js`.
 * Walkers (goomba, koopa) reverse on any left/right obstruction.
 */
import { Sides } from '../Entity'
import type Entity from '../Entity'
import type { Side } from '../Entity'
import Trait from '../Trait'

export default class PendulumMove extends Trait {
  enabled = true
  speed = -30

  obstruct(_entity: Entity, side: Side) {
    if (side === Sides.LEFT || side === Sides.RIGHT) {
      this.speed = -this.speed
    }
  }

  update(entity: Entity) {
    if (this.enabled) {
      entity.vel.x = this.speed
    }
  }
}
