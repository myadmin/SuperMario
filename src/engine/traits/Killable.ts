/**
 * traits/Killable.ts — ported from upstream `public/js/traits/Killable.js`.
 *
 * 本项目新增两处，都是「被打死」这条链路本身的缺口（上游语义保持不变）：
 *
 * 1. **`killed`：判死要立刻生效。** 上游的 `kill()` 只是把 `dead = true` 排进任务
 *    队列，而任务队列在 `Entity.finalize()` 里执行 —— 也就是**这一帧的实体碰撞检测
 *    全部跑完之后**。于是「这一帧刚被打死的敌人」在碰撞检测里仍然活着，还能顺手把
 *    马里奥撞死：火球近距离打中板栗仔的同一帧，马里奥正好走到它身上 —— 战果是
 *    「火球打死了它、它打死了马里奥」。`killed` 在 `kill()` 里**立即**置位，所有
 *    杀伤判定改读 `killed || dead`；`dead` 保留上游语义（渲染 / 计时 / 移除）。
 *    注意它只解决同一帧里「先判死、后判定杀伤」的顺序问题：同帧同时发生的两件事
 *    仍然可能先判杀伤（详见 `entities/Fireball.ts` 里为什么命中判定要放在 update）。
 * 2. **`cause`：死因。** `'flip'` = 被火球打翻（原版会翻过来掉出画面，见
 *    `traits/Flipped.ts`），`'default'` = 其余（踩扁 / 踢壳 / 道具被吃掉）。
 *    第一次判死的原因为准（同一帧里先踩扁、后被打中，仍然按踩扁渲染）。
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 本项目新增：死亡原因。 */
export type KillCause = 'default' | 'flip'

export default class Killable extends Trait {
  dead = false
  deadTime = 0
  removeAfter = 2

  /** 本项目新增：本帧内已经判死（`dead` 要到帧末才生效，杀伤判定读这个）。 */
  killed = false

  /** 本项目新增：死因（`entities/Goomba.ts` 用它决定画正常帧还是「踩扁」帧）。 */
  cause: KillCause = 'default'

  /** 本项目新增：被火球打翻的死亡。 */
  get flipped() {
    return this.cause === 'flip'
  }

  kill(cause: KillCause = 'default') {
    if (this.killed) {
      return
    }

    this.killed = true
    this.cause = cause
    this.queue(() => (this.dead = true))
  }

  revive() {
    this.dead = false
    this.deadTime = 0
    this.killed = false
    this.cause = 'default'
  }

  update(entity: Entity, { deltaTime }: GameContext, level: Level) {
    if (this.dead) {
      this.deadTime += deltaTime
      if (this.deadTime > this.removeAfter) {
        this.queue(() => {
          level.entities.delete(entity)
        })
      }
    }
  }
}
