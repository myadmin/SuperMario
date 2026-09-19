/**
 * traits/Jump.ts — ported verbatim from upstream `public/js/traits/Jump.js`.
 * Fixed-duration engage window with a grace period for late/early presses,
 * plus a speed boost scaled by horizontal velocity.
 *
 * 本项目新增（音频）：大马里奥的跳跃声与小的不同（`jump-large.ogg`），上游只登记了
 * 小的那一个。形态的事实来源是 `traits/PowerState`（非玩家实体没挂这个 trait 时按小的算）。
 */
import { Sides } from '../Entity'
import type Entity from '../Entity'
import type { Side } from '../Entity'
import Trait from '../Trait'
import PowerState from './PowerState'
import { JUMP_LARGE_SOUND } from '../fxSounds'
import type GameContext from '../GameContext'
import type Level from '../Level'

export default class Jump extends Trait {
  ready = 0
  duration = 0.3
  engageTime = 0
  requestTime = 0
  gracePeriod = 0.1
  speedBoost = 0.3
  velocity = 200

  get falling() {
    return this.ready < 0
  }

  start() {
    this.requestTime = this.gracePeriod
  }

  cancel() {
    this.engageTime = 0
    this.requestTime = 0
  }

  obstruct(_entity: Entity, side: Side) {
    if (side === Sides.BOTTOM) {
      this.ready = 1
    } else if (side === Sides.TOP) {
      this.cancel()
    }
  }

  update(entity: Entity, { deltaTime }: GameContext, _level: Level) {
    if (this.requestTime > 0) {
      if (this.ready > 0) {
        const large = entity.traits.has(PowerState) && entity.getTrait(PowerState).large
        entity.sounds.add(large ? JUMP_LARGE_SOUND : 'jump')
        this.engageTime = this.duration
        this.requestTime = 0
      }

      this.requestTime -= deltaTime
    }

    if (this.engageTime > 0) {
      entity.vel.y = -(this.velocity + Math.abs(entity.vel.x) * this.speedBoost)
      this.engageTime -= deltaTime
    }

    this.ready--
  }
}
