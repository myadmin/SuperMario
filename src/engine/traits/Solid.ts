/**
 * traits/Solid.ts — ported verbatim from upstream `public/js/traits/Solid.js`.
 * Resolves an obstruction by snapping the bounds to the tile face.
 */
import { Sides } from '../Entity'
import type Entity from '../Entity'
import type { Side } from '../Entity'
import Trait from '../Trait'
import type { Match } from '../TileResolver'

export default class Solid extends Trait {
  obstructs = true

  obstruct(entity: Entity, side: Side, match: Match) {
    if (!this.obstructs) {
      return
    }

    if (side === Sides.BOTTOM) {
      entity.bounds.bottom = match.y1
      entity.vel.y = 0
    } else if (side === Sides.TOP) {
      entity.bounds.top = match.y2
      entity.vel.y = 0
    } else if (side === Sides.LEFT) {
      entity.bounds.left = match.x2
      entity.vel.x = 0
    } else if (side === Sides.RIGHT) {
      entity.bounds.right = match.x1
      entity.vel.x = 0
    }
  }
}
