/**
 * traits/Go.ts — ported verbatim from upstream `public/js/traits/Go.js`.
 * Horizontal locomotion: acceleration, deceleration and quadratic drag.
 * dragFactor is swapped by Mario's turbo() between SLOW_DRAG and FAST_DRAG.
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'

export default class Go extends Trait {
  dir = 0
  acceleration = 400
  deceleration = 300
  dragFactor = 1 / 5000

  distance = 0
  heading = 1

  update(entity: Entity, { deltaTime }: GameContext) {
    const absX = Math.abs(entity.vel.x)

    if (this.dir !== 0) {
      entity.vel.x += this.acceleration * deltaTime * this.dir

      const jump = (entity as any).jump
      if (jump) {
        if (jump.falling === false) {
          this.heading = this.dir
        }
      } else {
        this.heading = this.dir
      }
    } else if (entity.vel.x !== 0) {
      const decel = Math.min(absX, this.deceleration * deltaTime)
      entity.vel.x += entity.vel.x > 0 ? -decel : decel
    } else {
      this.distance = 0
    }

    const drag = this.dragFactor * entity.vel.x * absX
    entity.vel.x -= drag

    this.distance += absX * deltaTime
  }
}
