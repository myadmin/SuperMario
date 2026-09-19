/**
 * traits/Crouch.ts —— 本项目新增：大马里奥按 ↓ 蹲下。
 *
 * 上游移植版完全没有这条规则，而 `public/sprites/mario.json` 里 `crouch-large`
 * （[0,120,16,32]）这一帧从上游起就存在、从来没有代码用过它。原版 SMB 的规矩是：
 *
 *   1. **只有大 / 火力形态能蹲**——小马里奥按 ↓ 什么也不发生；
 *   2. 蹲下要求**站在地上**：空中按 ↓ 无效，但按着不放、落地的那一帧立刻蹲下；
 *   3. 蹲着**不能走**（水平速度被清零，左右键无效）、**不能跳**（A 键无效）；
 *   4. 蹲着的碰撞盒只有 16 高（与小的同尺寸），于是能蹲着从一格高的缝里过去；
 *   5. **松开 ↓ 才站起来**；头顶那 16px 里有实心瓦片时站不起来，继续蹲着。
 *
 * 「按着 ↓」这个事实由 `input.ts` 的 DOWN 映射写在 `down` 上（与 `Go.dir` 由左右键写入
 * 同一性质）；帧的选择与绘制偏置在 `entities/Mario.ts`（`crouch-large` 是 16x32 的格子、
 * 人像画在**下半格**——逐行统计不透明像素得到：前 10 行全透明——而蹲着的碰撞盒只有 16 高，
 * 所以绘制时要往上偏一个身位，脚才落在地上）。
 */
import Trait from '../Trait'
import Damage from './Damage'
import Jump from './Jump'
import PipeTraveller from './PipeTraveller'
import PowerState, { LARGE_BOX, SMALL_BOX } from './PowerState'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'
import type { Tile } from '../TileResolver'

/**
 * 蹲着的碰撞盒：与小的同一尺寸（原版蹲下后就是一格高）。
 * 宽 14 与 `LARGE_BOX` 一致，所以蹲下 / 站起只改高度。
 */
export const CROUCH_BOX = { width: SMALL_BOX.width, height: SMALL_BOX.height }

/**
 * 不挡路的瓦片行为：全 25 关的关卡数据里只出现过 `ground` / `brick`（实心）、
 * `coin`（碰到就收，不实心）以及没有 behavior 的装饰瓦片（不注册处理器 = 不碰撞）。
 * 加上本项目注册的 `chance` / `hidden`（实心）。
 */
const NON_BLOCKING_BEHAVIORS = new Set(['coin'])

/** 这格瓦片会不会挡住「站起来」。 */
function blocksStanding(tile: Tile | undefined) {
  const behavior = tile?.behavior
  return typeof behavior === 'string' && !NON_BLOCKING_BEHAVIORS.has(behavior)
}

export default class Crouch extends Trait {
  /** ↓ 键当前是否按住（由 `input.ts` 的 DOWN 映射写入）。 */
  down = false

  /** 本帧是否真的蹲着。帧选择（`entities/Mario.ts`）与绘制偏置都读它。 */
  crouching = false

  update(entity: Entity, _gameContext: GameContext, level: Level) {
    const has = (trait: typeof Trait) => entity.traits.has(trait)
    const power = has(PowerState) ? entity.getTrait(PowerState) : null
    const jump = has(Jump) ? entity.getTrait(Jump) : null
    const pipe = has(PipeTraveller) ? entity.getTrait(PipeTraveller) : null
    const damage = has(Damage) ? entity.getTrait(Damage) : null

    // 管道 / 旗杆旅行期间位置由插值决定，死亡期间碰撞盒归 `Damage` 管：
    // 这两种状态下本 trait 什么都不做（也保持当前的蹲 / 站状态）。
    const travelling =
      !!pipe &&
      (pipe.movement.x !== 0 || pipe.movement.y !== 0 || pipe.distance.x !== 0 || pipe.distance.y !== 0)
    if (travelling || (damage && damage.dying)) {
      return
    }

    // 条件 1：小马里奥不能蹲。
    const canCrouch = !!power && power.large
    // 条件 2：站在地上。`Jump.ready` 由瓦片碰撞在落地那一帧写成 1（见 `traits/Jump`）。
    const grounded = !!jump && jump.ready > 0

    let want: boolean
    if (this.crouching) {
      // 条件 5：按着 ↓ 就继续蹲；松开 ↓ 时还要看头顶站不站得下——站不下就继续蹲着。
      want = canCrouch && (this.down || this.isBlockedAbove(entity, level))
    } else {
      want = canCrouch && this.down && grounded
    }

    this.crouching = want

    // 把碰撞盒对齐到「应该的样子」，并且**脚底不动**：高度增加多少，顶边就上移多少。
    // 这样别处改了尺寸（吃蘑菇变大 / 受伤变小 / 重生回到小的）也能自动收敛，
    // 不需要那些地方知道「现在是不是蹲着」。
    const desired = want ? CROUCH_BOX.height : canCrouch ? LARGE_BOX.height : SMALL_BOX.height
    if (entity.size.y !== desired) {
      entity.pos.y += entity.size.y - desired
      entity.size.set(LARGE_BOX.width, desired)
    }

    if (this.crouching) {
      // 条件 3：不能走（左右键算出来的加速度当帧即被清掉）。
      entity.vel.x = 0

      // 条件 3（续）：不能跳。必须在 `Jump.update` **之前**取消——所以
      // `entities/Mario.ts` 把这个 trait 插在 `Go` 之后、`Jump` 之前。
      if (jump) {
        jump.cancel()
      }
    }
  }

  /**
   * 头顶那 16px（蹲着 → 站着时脑袋要占的空间）里有没有实心瓦片。
   *
   * 只看 `level.tileCollider.resolvers`——它就是真正参与碰撞的那些网格
   * （`loaders/level.ts` 把每个背景层都注册成了碰撞网格，与「哪一层画在谁上面」无关）。
   */
  private isBlockedAbove(entity: Entity, level: Level) {
    const bounds = entity.bounds
    const top = bounds.top - (LARGE_BOX.height - CROUCH_BOX.height)

    for (const resolver of level.tileCollider.resolvers) {
      // `right - 1`：`searchByRange` 按 ceil 取右边界，减 1 才不会把右边那格也算进来。
      const matches = resolver.searchByRange(bounds.left, bounds.right - 1, top, bounds.top - 1)
      for (const match of matches) {
        if (blocksStanding(match.tile)) {
          return true
        }
      }
    }

    return false
  }
}
