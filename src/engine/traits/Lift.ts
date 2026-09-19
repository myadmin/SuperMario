/**
 * traits/Lift.ts —— 本项目新增：上下往返的「升降桥」平台。
 *
 * 原版 1-2 的结尾有两道 7 格宽（112px）的坑，坑上各有一台**上下移动的平台**
 * （原版攻略里的描述是「some lifts will be rising and falling; the first one
 * moves down while the right one moves up」）。上游移植版完全没有会动的平台：
 * 关卡 JSON 里也没有任何平台实体，所以这两道坑是无解的——马里奥最多只能跳
 * 约 105px，112px 的坑过不去，玩家会卡在 1-2 里出不来。
 *
 * 本 trait 负责平台本身的行为：
 *   1. 在自己的行程（`top` ~ `bottom`，指的是平台**顶边**的 y）之间匀速往返；
 *   2. 把「站在上面」的实体一起带着走——包括平台下行时（不然马里奥会因为
 *      重力跟不上平台而掉下去）；
 *   3. 站在平台上时把 `Jump.ready` 顶起来，这样玩家还能正常起跳（`Entity.update`
 *      按插入顺序跑，特性注入的平台排在马里奥之前，所以这里写的 1 会被
 *      `traits/Jump` 当帧读到）。
 *
 * 「站在上面」的判定（`collides` 每帧由 `EntityCollider` 调用）刻意做成**单向**：
 * 只有脚底接近平台顶边（容差 `RIDE_TOLERANCE`）且没有正在往上跳时才算站上去，
 * 于是马里奥可以从下方穿过平台、也能跳起来离开，跟原版踩平台的手感一致。
 */
import Trait from '../Trait'
import Jump from './Jump'
import Player from './Player'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 判定「站在平台上」的容差（像素）：脚底最多低于平台顶边这么多。 */
const RIDE_TOLERANCE = 6

/** 默认移动速度（像素/秒）。原版约 0.5~0.8 px/帧，这里取中间值。 */
const DEFAULT_SPEED = 48

export default class Lift extends Trait {
  /** 行程上端：平台顶边能到的最高 y（像素，值更小=更高）。 */
  top = 0

  /** 行程下端：平台顶边能到的最低 y（像素，通常就是地面高度）。 */
  bottom = 0

  /** 移动速度（像素/秒）。 */
  speed = DEFAULT_SPEED

  /** +1 = 正在下行，-1 = 正在上行。 */
  direction = 1

  /** 本帧站在平台上的实体。由 `collides` 每帧重填、`update` 消费后清空。 */
  riders = new Set<Entity>()

  collides(lift: Entity, other: Entity) {
    // 只有玩家会站上来（怪物不坐电梯，与原版一致）。
    if (!other.traits.has(Player) || !other.traits.has(Jump)) {
      return
    }

    // 正在上跳（脚底刚离开平台）时不吸住，否则会把玩家自己的跳跃吃掉。
    if (other.vel.y < 0) {
      return
    }

    if (other.bounds.bottom > lift.bounds.top + RIDE_TOLERANCE) {
      return
    }

    if (other.bounds.right <= lift.bounds.left || other.bounds.left >= lift.bounds.right) {
      return
    }

    this.riders.add(other)
  }

  update(lift: Entity, { deltaTime }: GameContext, _level: Level) {
    lift.pos.y += this.direction * this.speed * deltaTime

    if (lift.pos.y >= this.bottom) {
      lift.pos.y = this.bottom
      this.direction = -1
    } else if (lift.pos.y <= this.top) {
      lift.pos.y = this.top
      this.direction = 1
    }

    for (const rider of this.riders) {
      // 贴住平台顶面（下行时也贴住，不然马里奥会掉下去），并允许他起跳。
      rider.bounds.bottom = lift.bounds.top
      rider.vel.y = 0
      rider.getTrait(Jump).ready = 1
    }
    this.riders.clear()
  }
}
