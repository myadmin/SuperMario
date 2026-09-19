/**
 * traits/Stomper.ts — ported verbatim from upstream `public/js/traits/Stomper.js`.
 * Bouncing on a Killable enemy: snap to its top and apply bounceSpeed.
 */
import Trait from '../Trait'
import Killable from './Killable'
import type Entity from '../Entity'

export default class Stomper extends Trait {
  static EVENT_STOMP = Symbol('stomp')

  bounceSpeed = 400

  bounce(us: Entity, them: Entity) {
    us.bounds.bottom = them.bounds.top
    us.vel.y = -this.bounceSpeed
  }

  collides(us: Entity, them: Entity) {
    if (!them.traits.has(Killable) || them.getTrait(Killable).dead) {
      return
    }

    // 本项目新增：本帧刚被火球 / 无敌星判死的敌人（`killed` 置位、`dead` 还在帧末
    // 才生效）不该再被「踩」——否则会出现火球打翻它的同一帧马里奥还踩上去弹跳加分。
    if (them.getTrait(Killable).killed) {
      return
    }

    if (us.vel.y > them.vel.y) {
      this.queue(() => this.bounce(us, them))
      us.sounds.add('stomp')
      us.events.emit(Stomper.EVENT_STOMP, us, them)
    }
  }
}
