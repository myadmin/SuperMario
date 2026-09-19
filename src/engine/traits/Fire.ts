/**
 * traits/Fire.ts —— 本项目新增：火力形态发射火球。
 *
 * 输入那一侧不用改：上游 `input.ts` 的 KEYMAP 里 B 键（`KeyO`）已经接到
 * `entity.turbo!(turboOn)`，`entities/Mario.ts` 的 `setTurboState` 除了切换加速以外，
 * 还顺手在这里登记一次「按下 B」——原版 B 键同时是跑和发射。
 *
 * 本 trait 负责真正把火球放进关卡，因为只有 `update` 能拿到 `level`：
 *   - 只有`PowerState.fire` 才发射（原版如此，大马里奥按 B 只是加速）；
 *   - 死亡动画中 / 管道穿行中 / 爬杆中不发射；
 *   - **同时最多 2 枚**（原版上限）；数在场枚数靠扫关卡实体里有没有 `Fireball` 行为；
 *   - 出膛位置按原版：手的高度（大马里奥 `pos.y + 12`）、身体外侧一点，
 *     朝向取 `Go.heading`，速度见 `entities/Fireball.ts`。高度会再夹一道
 *     「不得低过脚底」——蹲着发射时身体只有 16 高，不夹就会把火球打进地面（见下文）。
 */
import Trait from '../Trait'
import Go from './Go'
import Killable from './Killable'
import PipeTraveller from './PipeTraveller'
import PoleTraveller from './PoleTraveller'
import PowerState from './PowerState'
import Damage from './Damage'
import Fireball, { createFireballEntity, FIREBALL_SIZE } from '../entities/Fireball'
import { FIREBALL_SOUND } from '../fxSounds'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 原版同时最多 2 枚火球。 */
export const MAX_FIREBALLS = 2

/** 火球与马里奥身体外侧的间距（像素）。 */
const MUZZLE_OFFSET = 2

/** 手的高度：大马里奥身体顶边往下 12px（原版手感）。 */
const HAND_OFFSET = 12

export default class Fire extends Trait {
  /** 这一帧有按下 B（由 `entities/Mario.ts` 的 turbo 回调设置）。 */
  requested = false

  /** B 键按下：登记一次发射请求。 */
  request() {
    this.requested = true
  }

  update(entity: Entity, _gameContext: GameContext, level: Level) {
    const requested = this.requested
    this.requested = false

    if (!requested) {
      return
    }

    if (!entity.getTrait(PowerState).fire) {
      return
    }

    const damage = entity.getTrait(Damage)
    if (entity.getTrait(Killable).dead || damage.dying || damage.endSequence) {
      return
    }

    // 管道穿行 / 爬杆途中不发射（那两种状态下位置由别的 trait 控制）。
    const pipe = entity.getTrait(PipeTraveller)
    if (pipe.movement.x !== 0 || pipe.movement.y !== 0) {
      return
    }
    if (entity.getTrait(PoleTraveller).distance) {
      return
    }

    if (countFireballs(level) >= MAX_FIREBALLS) {
      return
    }

    const direction = entity.getTrait(Go).heading < 0 ? -1 : 1
    const x =
      direction > 0
        ? entity.pos.x + entity.size.x + MUZZLE_OFFSET
        : entity.pos.x - FIREBALL_SIZE - MUZZLE_OFFSET
    // 出膛高度是「手」的高度（身体顶边往下 12px，原版手感），但**不得低过脚底**：
    // 蹲着时（`traits/Crouch`）身体只剩 16 高，照 12px 算会让 8px 的火球有 4px 埋进
    // 地面——一出生就撞上地面瓦片、当帧就被判死（表现是「按了 B 什么也没发生」）。
    // 夹一道上限后，火球永远出在身体高度之内：站着不受影响，蹲着就是贴着地面出膛。
    const y = Math.min(entity.pos.y + HAND_OFFSET, entity.bounds.bottom - FIREBALL_SIZE)

    level.entities.add(createFireballEntity(x, y, direction))
    entity.sounds.add(FIREBALL_SOUND)
  }
}

/** 数一数场上还有几枚火球。 */
function countFireballs(level: Level) {
  let count = 0
  level.entities.forEach((entity) => {
    if (entity.traits.has(Fireball)) {
      count += 1
    }
  })
  return count
}
