/**
 * traits/PowerState.ts —— 本项目新增：马里奥的强化状态（小 / 大 / 火）。
 *
 * 上游移植过来的 Mario 只有小马里奥（碰撞盒 14x16），但 `public/sprites/mario.json`
 * 里早就定义了 `idle-large` / `run-*-large` / `jump-large` / `break-large` /
 * `crouch-large` 这些 16x32 的大马里奥帧——上游没有道具系统，所以这些帧从未被用过。
 * 火力形态没有独立帧（原版也只是同一套帧换调色板），由 `entities/Mario.ts` 在绘制时
 * 做红白调色板替换（见那里的 `FIRE_PALETTE`）。
 *
 * 三档与转换规则完全按原版 SMB：
 *   - 吃**蘑菇**（问号块里出来的红蘑菇）：小 → 大；
 *   - 吃**火花**（问号块里出来的花）：小 → 火（直接变大一档）、大 → 火；
 *   - 受伤：火 → 大、大 → 小、小 → 死亡（每挨一下只降一档）。
 *
 * 本 trait 是「大小 / 火力」的唯一事实来源；用哪一帧由 `entities/Mario.ts` 的
 * routeFrame 决定，能不能发射火球由 `traits/Fire.ts` 决定。
 * 变大时碰撞盒往上长、脚不动（`pos.y` 上移一个身位），这样站在地上时不会陷进地面。
 */
import Trait from '../Trait'
import type Entity from '../Entity'

/** 小 / 大马里奥的碰撞盒。宽 14 是上游值；精灵本身 16 宽，会向右溢出 2px。 */
export const SMALL_BOX = { width: 14, height: 16 }
export const LARGE_BOX = { width: 14, height: 32 }

/** 三档强化状态。 */
export type PowerLevel = 'small' | 'super' | 'fire'

export default class PowerState extends Trait {
  level: PowerLevel = 'small'

  /** 大马里奥（super 或 fire）：碰撞盒 14x32。 */
  get large() {
    return this.level !== 'small'
  }

  /** 火力形态：能发射火球（`traits/Fire.ts`）。 */
  get fire() {
    return this.level === 'fire'
  }

  /** 吃蘑菇：小 → 大；已经是大 / 火时返回 false（重复吃只加分）。 */
  grow(entity: Entity) {
    if (this.large) {
      return false
    }

    this.becomeLarge(entity)
    return true
  }

  /**
   * 本项目新增：吃火花。小马里奥吃到也直接变成火力形态（原版如此：火花永远让马里奥
   * 「变大 + 有火力」，不管他吃之前是什么状态）。已经是火力时返回 false（只加分）。
   */
  empower(entity: Entity) {
    if (this.level === 'fire') {
      return false
    }

    if (!this.large) {
      this.becomeLarge(entity)
    }
    this.level = 'fire'
    return true
  }

  /**
   * 被怪物碰到后降一档（`traits/Damage.ts` 用）：火 → 大、大 → 小。
   * 已经是最小（small）时返回 false，由 `Damage` 决定死亡。
   * 变大 / 变小都要保持脚不动。
   */
  shrink(entity: Entity) {
    if (this.level === 'fire') {
      // 火力 → 大：尺寸不变（两者都是 14x32），只是失去火力，所以不动坐标。
      this.level = 'super'
      return true
    }

    if (this.level === 'super') {
      this.level = 'small'
      this.resize(entity, SMALL_BOX.height)
      return true
    }

    return false
  }

  /** 本项目新增：回到小马里奥，不动位置（重生时 `bootstrapPlayer` 会重摆坐标）。 */
  reset(entity: Entity) {
    this.level = 'small'
    entity.size.set(SMALL_BOX.width, SMALL_BOX.height)
  }

  /** 变成大马里奥：碰撞盒往上长一个身位（脚不动）。 */
  private becomeLarge(entity: Entity) {
    this.level = 'super'
    this.resize(entity, LARGE_BOX.height)
  }

  /**
   * 把碰撞盒改成指定高度，**脚底不动**（高度长多少，顶边就上移多少）。
   *
   * 有意按「当前高度」换算而不是按 `LARGE_BOX.height - SMALL_BOX.height` 这个常数：
   * 蹲着时（`traits/Crouch`）碰撞盒已经是 16 高，用常数会多移 16px、把马里奥塞进地面。
   */
  private resize(entity: Entity, height: number) {
    entity.pos.y += entity.size.y - height
    entity.size.set(LARGE_BOX.width, height)
  }
}
