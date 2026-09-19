/**
 * features/exitSequence.ts —— 本项目新增：走进城堡后的**通关收尾序列**。
 *
 * 原版 SMB 在马里奥进城堡那一刻有一整套收尾，此前本项目缺了整段（`features/castle.ts`
 * 一触发就立刻切关，过关小曲被拦腰掐断）。本模块按原版节奏补齐：
 *
 *   1. **接管马里奥**：输入被忽略，马里奥自动向右走到城堡门正中（原版的自动走位）；
 *      走位期间无敌（`traits/Damage.endSequence`）、计时冻结（`traits/LevelTimer.frozen`）；
 *   2. **进城堡**：走到门正中后马里奥**消失**（从关卡实体里移除，看起来是走进了门洞）；
 *   3. **时间结算**：剩余时间以每秒约 200 单位折成分数（1 单位 = 50 分，原版数值），
 *      HUD 上 TIME 滚动归零、分数同步上涨（原版会在城堡里滚时间换分，这里同款）；
 *   4. **小曲**：旗杆关此时 `level-clear` 已经在放（抓杆滑到底时起播，见
 *      `features/flag.ts`），等它放完；城堡关没有旗杆，此刻起播 `castle-clear`
 *      再等放完。音乐开关关着时跳过小曲，只留 1.2s 的收尾停顿；
 *   5. **切关**：小曲放完后 emit `Level.EVENT_TRIGGER`（`game.ts` 原有的监听会
 *      `startWorld()` 进入下一关）。
 *
 * 序列由一个挂在关卡里的代理实体驱动（与 `features/flag.ts` 的 FlagSlide 同一写法）。
 * 每关只跑一次（`WeakSet` 兜底）：旗杆关的滑杆完成事件与城堡门触发可能接连到达。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Go from '../traits/Go'
import Jump from '../traits/Jump'
import Crouch from '../traits/Crouch'
import Damage from '../traits/Damage'
import LevelTimer from '../traits/LevelTimer'
import Player from '../traits/Player'
import Level from '../Level'
import { playJingle, playingJingle, type JingleName } from '../jingle'
import { findPlayers } from '../player'
import type GameContext from '../GameContext'

/** 一次通关收尾的完整入参。 */
export type ExitSequenceOptions = {
  /** 城堡门正中的世界 x（马里奥走到这里就算进去了）。 */
  doorX: number
  /** 下一关的名字（`game.ts` 的 EVENT_TRIGGER 监听拿它 startWorld）。 */
  nextLevel: string
  /** 交给 `game.ts` 的触发 spec（与 `loaders/level.ts` 的 setupTriggers 同形）。 */
  spec: { type: 'goto'; name: string; pos: [number, number] }
  /** 收尾小曲（城堡关 `castle-clear`，其余 `level-clear`；旗杆关已在放就不再起播）。 */
  jingle: JingleName
}

/** 已经在跑序列的关卡（每关只跑一次）。 */
const started = new WeakSet<Level>()

/** 时间结算速度（单位/秒）：原版是先慢后快的滚分，这里取一段均匀的快速滚分。 */
const BONUS_UNITS_PER_SECOND = 200

/** 每个时间单位换的分（原版数值）。 */
const BONUS_POINTS_PER_UNIT = 50

/** 小曲放完后的收尾停顿（秒），然后切下一关。 */
const SETTLE_TIME = 1.2

/** 整段序列的硬上限（秒）：小曲万一不结束也不至于卡死在这里。 */
const MAX_SEQUENCE_TIME = 12

/**
 * 通关收尾期间驾驶马里奥的 trait：向右自动走位，直到门正中。
 * 运行时 `addTrait` 会把它追加到马里奥 trait 表的**尾部**，所以它每帧在
 * Go / Jump / Crouch / Damage 之后跑，能盖掉输入写入的方向、清掉跳跃 / 蹲下。
 */
class EndWalk extends Trait {
  private arrived = false

  constructor(
    private doorX: number,
    private onArrive: () => void,
  ) {
    super()
  }

  update(entity: Entity, _gameContext: GameContext, _level: Level) {
    if (this.arrived) {
      return
    }

    // 无视玩家输入：方向固定向右，跳跃 / 蹲下一律取消。
    entity.getTrait(Go).dir = 1
    entity.getTrait(Jump).cancel()
    const crouch = entity.traits.get(Crouch) as Crouch | undefined
    if (crouch) {
      crouch.down = false
      crouch.crouching = false
    }

    // 速度下限：起步加速太慢的话走到门口要等太久（原版的自动走位近似匀速）。
    if (entity.vel.x < 45) {
      entity.vel.x = 45
    }

    if (entity.bounds.getCenter().x >= this.doorX) {
      this.arrived = true
      this.onArrive()
      // 任务完成，把自己从马里奥身上摘掉：trait 跨关卡存活，留着虽然惰性
      // （arrived 早退），但换关后残留在实体上不干净。
      entity.traits.delete(EndWalk)
    }
  }
}

type Phase = 'walk' | 'bonus' | 'settle' | 'done'

/** 序列驱动器：挂在关卡里的代理实体上，推进「走位 → 结算 → 小曲 → 切关」。 */
class ExitSequenceDriver extends Trait {
  private phase: Phase = 'walk'
  /** 时间结算的小数进位（每帧不足 1 单位的余数）。 */
  private carry = 0
  private settleTime = 0
  private totalTime = 0
  /** 序列开始时是否已有小曲在放（旗杆关的 level-clear 是滑杆时起播的）。 */
  private jingleWasPlaying = false

  constructor(
    private level: Level,
    private mario: Entity,
    private options: ExitSequenceOptions,
  ) {
    super()
  }

  update(_entity: Entity, { deltaTime }: GameContext, _level: Level) {
    if (this.phase === 'done') {
      return
    }

    this.totalTime += deltaTime

    // 'walk' 阶段由 EndWalk 驾驶马里奥，这里只等 onArrive 把阶段推到 'bonus'。
    if (this.phase !== 'walk') {
      this.settleTime += deltaTime
    }

    if (this.phase === 'bonus') {
      const timer = this.mario.getTrait(LevelTimer)
      const player = this.mario.traits.get(Player) as Player | undefined

      if (player) {
        this.carry += BONUS_UNITS_PER_SECOND * deltaTime
        const converted = Math.min(Math.floor(this.carry), Math.ceil(timer.currentTime))
        this.carry -= converted
        if (converted > 0) {
          timer.currentTime = Math.max(0, timer.currentTime - converted)
          player.score += converted * BONUS_POINTS_PER_UNIT
        }
      }

      if (timer.currentTime <= 0) {
        this.beginSettle()
      }
      return
    }

    if (this.phase === 'settle') {
      // 小曲放完（`playingJingle()` 归 null）再停一拍，然后交给 game.ts 切关。
      // 音乐关着时小曲不会响，这里只等 SETTLE_TIME。
      const jingleOver = playingJingle() === null
      if ((jingleOver && this.settleTime >= SETTLE_TIME) || this.totalTime > MAX_SEQUENCE_TIME) {
        this.finish()
      }
    }
  }

  /** 马里奥进门（由 EndWalk 的 onArrive 调用）：消失 + 进入时间结算。 */
  enterCastle() {
    this.phase = 'bonus'
    this.level.entities.delete(this.mario)
  }

  private beginSettle() {
    this.phase = 'settle'
    this.settleTime = 0

    // 城堡关（无旗杆）此刻还没有小曲：起播收尾曲。旗杆关的已经在放，等它结束即可。
    if (!this.jingleWasPlaying) {
      playJingle(this.options.jingle)
    }
  }

  private finish() {
    if (this.phase === 'done') {
      return
    }
    this.phase = 'done'
    // touches 里带上马里奥（他已从关卡里移除，但 trait 还在）：game.ts 的监听
    // 靠 findPlayers(touches) 确认是玩家触发的推进。
    this.level.events.emit(Level.EVENT_TRIGGER, this.options.spec, this.mario, new Set([this.mario]))
  }
}

/**
 * 启动一关的通关收尾序列（`features/castle.ts` 调用：城堡门触发 / 旗杆滑到底两路）。
 * 序列开始就接管马里奥并冻结计时；同一关重复调用会被忽略。
 */
export function startExitSequence(level: Level, options: ExitSequenceOptions) {
  if (started.has(level)) {
    return
  }

  const mario = getPlayer(level)
  if (!mario) {
    return
  }
  started.add(level)

  // 冻结计时（TIME 停走）+ 收尾期间免疫一切死亡判定（原版的收尾走位是无敌的）。
  mario.getTrait(LevelTimer).frozen = true
  mario.getTrait(Damage).endSequence = true

  const driver = new ExitSequenceDriver(level, mario, options)
  const animator = new Entity()
  animator.addTrait(driver)
  level.entities.add(animator)

  // 自动走位：从当前位置走到门正中，进去（消失）后进入结算。
  const walk = new EndWalk(options.doorX, () => driver.enterCastle())
  mario.addTrait(walk)
}

function getPlayer(level: Level): Entity | undefined {
  for (const entity of findPlayers(level.entities)) {
    return entity
  }
  return undefined
}
