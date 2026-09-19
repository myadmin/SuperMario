/**
 * traits/LevelTimer.ts — ported verbatim from upstream `public/js/traits/LevelTimer.js`.
 * Counts down 2.5 units per second from 400 and emits hurry/ok events.
 * The MARK symbol is module-scoped on purpose (shared across all entities).
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

const MARK = Symbol('level timer earmark')

export default class LevelTimer extends Trait {
  static EVENT_TIMER_HURRY = Symbol('timer hurry')
  static EVENT_TIMER_OK = Symbol('timer ok')

  totalTime = 400
  currentTime = 400
  hurryTime = 100
  hurryEmitted: boolean | null = null

  /**
   * 本项目新增：冻结计时。抓到旗杆的瞬间（`features/flag.ts`）与走进城堡
   * （`features/exitSequence.ts`）之后置位——原版在抓杆那一刻 TIME 就停走，
   * 剩下的时间在进城堡时一次性换成分数。
   */
  frozen = false

  reset() {
    this.currentTime = this.totalTime
    this.frozen = false
  }

  update(_entity: Entity, { deltaTime }: GameContext, level: Level) {
    if (this.frozen) {
      return
    }

    // 本项目新增：原版这里会一路减成负数（没人管归零），HUD 的 TIME 会显示成 "0-2"。
    // 原版行为是倒计时停在 000（然后由 `traits/Damage.ts` 判定死亡），所以在源头夹住。
    this.currentTime = Math.max(0, this.currentTime - deltaTime * 2.5)

    if (!(level as any)[MARK]) {
      this.hurryEmitted = null
    }

    if (this.hurryEmitted !== true && this.currentTime < this.hurryTime) {
      level.events.emit(LevelTimer.EVENT_TIMER_HURRY)
      this.hurryEmitted = true
    }
    if (this.hurryEmitted !== false && this.currentTime > this.hurryTime) {
      level.events.emit(LevelTimer.EVENT_TIMER_OK)
      this.hurryEmitted = false
    }

    ;(level as any)[MARK] = true
  }
}
