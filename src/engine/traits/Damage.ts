/**
 * traits/Damage.ts —— 本项目新增：马里奥的受伤与死亡结算。
 *
 * 上游把这个口子留着没做完。`entities/Goomba.ts` / `Koopa.ts` / `CheepCheep.ts` /
 * `Bullet.ts` 的 Behavior 里确实调用了 `them.getTrait(Killable).kill()`——也就是怪物
 * 「打到」了马里奥——但马里奥这一侧对 `Killable.dead` **没有任何反应**：
 * `entities/Mario.ts` 把 `removeAfter` 写死成 `Infinity`，所以 dead 之后他既不会被移出
 * 关卡、也不停止更新，看起来就是「撞到怪物不会死、游戏照常进行」。另外两条死亡路径
 * 也完全没有人管：落坑（没有任何代码检查马里奥掉出画面）和时间归零（`traits/LevelTimer.ts`
 * 只在 < 100 时发一次 hurry 事件，之后一路减成负数）。
 *
 * 本 trait 补上原版的三条死亡路径：
 *   1. **被怪物碰到**：大马里奥先变小 + 1.5s 无敌（闪烁），小马里奥直接死亡；
 *   2. **掉出画面底部**（坑）；
 *   3. **关卡时间归零**。
 *
 * 死亡后不在这里重开关卡——那要用 `game.ts` 的场景流（加载关卡、扣命、GAME OVER），
 * 所以这里只发 `EVENT_PLAYER_DIED`，由 `game.ts` 决定下一步。
 *
 * 死亡动画用的是素材里本来就有的 `die` 帧（`public/sprites/mario.json` 的
 * `[96,88,16,16]`，原版因为没做死亡从来没画过它）。
 *
 * 本项目新增（音频）：死亡瞬间停掉关卡主题曲并放原版的死亡小曲（`jingle.ts`）。
 * 小曲比死亡动画长（2.72s vs 约 1s），它会在「WORLD x-x / ×N」过渡页里放完——
 * 这也是原版的节奏。
 */
import Trait from '../Trait'
import { playJingle } from '../jingle'
import Killable from './Killable'
import Solid from './Solid'
import Jump from './Jump'
import LevelTimer from './LevelTimer'
import PowerState from './PowerState'
import PipeTraveller from './PipeTraveller'
import StarPower from './StarPower'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 死亡事件：`game.ts` 监听它来扣命 / 重开本关 / GAME OVER。 */
export const EVENT_PLAYER_DIED = Symbol('player died')

/** 画布高（相机 `pos.y` 恒为 0）。马里奥整只掉到这条线以下就算掉坑。 */
const CANVAS_HEIGHT = 240

/** 受伤后的无敌时长（秒）。 */
const INVINCIBLE_TIME = 1.5

/** 死亡动画：先定速上抛 RISE_TIME 秒，再定速下落。 */
const RISE_TIME = 0.45
const RISE_SPEED = 90
const FALL_SPEED = 160

/** 掉坑时不播动画（人已经在画面外了），只停这么久让音效/画面收尾。 */
const SILENT_DEATH_TIME = 0.5

export default class Damage extends Trait {
  /** 无敌剩余时间（秒），`entities/Mario.ts` 据此闪烁。 */
  invincibleFor = 0

  /** 正在播死亡动画（或等待重开）。 */
  dying = false

  /** 死亡动画已经播了多久。 */
  deathTime = 0

  /** 死亡事件是否已经发出（只发一次）。 */
  reported = false

  /** 这次死亡是否播上抛/下落动画（掉坑时为 false）。 */
  animated = true

  /** 是否处于无敌中。 */
  get invincible() {
    return this.invincibleFor > 0
  }

  /**
   * 本项目新增：通关收尾序列进行中（`features/exitSequence.ts`，走进城堡后的
   * 自动走到门口 → 消失 → 时间结算）。期间马里奥不可被伤害、也不会掉坑 /
   * 被时间判死——原版的收尾走位是无敌的。
   */
  endSequence = false

  /**
   * 被怪物碰到。大马里奥挨一下变小 + 短暂无敌，小马里奥死亡。
   * 返回这一下是否活下来了。
   *
   * 判据是敌人那侧已经调用过的 `Killable.kill()`——本项目不改任何敌人文件，
   * 把 `kill()` 当成「马里奥挨了一下」的信号，能不能扛住由这里决定。
   */
  hurt(entity: Entity, level: Level) {
    if (this.dying) {
      return false
    }

    if (this.endSequence) {
      return true
    }

    // 本项目新增：无敌星期间敌人碰不动马里奥（碰到的敌人由 `StarPower` 打翻）。
    const star = entity.traits.get(StarPower) as StarPower | undefined
    if (star && star.active) {
      entity.getTrait(Killable).revive()
      return true
    }

    if (this.invincible) {
      // 无敌期间敌人每帧都还在 kill()，这里按回去
      entity.getTrait(Killable).revive()
      return true
    }

    const power = entity.getTrait(PowerState)
    if (power.large) {
      power.shrink(entity)
      this.invincibleFor = INVINCIBLE_TIME
      return true
    }

    this.die(entity, level)
    return false
  }

  /**
   * 开始死亡（落坑 / 时间到 / 小马里奥被打）。
   * `animated` 为 false 时只等 `SILENT_DEATH_TIME` 就上报（掉坑用）。
   */
  die(entity: Entity, level: Level, animated = true) {
    if (this.dying) {
      return
    }

    // 原版：一死就停主题曲、换成死亡小曲。掉坑（`animated = false`）也一样。
    level.music.pause()
    playJingle('die')
    // 本项目新增：死亡清掉无敌星（音乐与效果都不跨死亡，见 `traits/StarPower`）。
    entity.getTrait(StarPower).cancel()

    this.dying = true
    this.animated = animated
    this.deathTime = 0
    this.invincibleFor = 0

    // 死亡动画要穿过地面掉出画面：关掉实心碰撞，竖直位移自己控制，水平每帧清零
    // （本 trait 排在 Mario 的最后，能盖住 Go/Jump/Physics 这一帧的写入）。
    entity.getTrait(Solid).obstructs = false
    entity.getTrait(Jump).cancel()
    entity.getTrait(Killable).kill()
    entity.vel.set(0, 0)
  }

  /**
   * 清空受伤 / 死亡状态，并把实心碰撞与速度还原。
   *
   * 由 `game.ts` 在**每次关卡就绪后**调用一次（重开本关、换关、开局都算）——
   * 这样死亡动画期间的旧状态不会被带进新关卡。这里**不动大小**：
   * 正常换关要保留蘑菇，只有死亡重生才变小（那一步在 `game.ts` 里单独调
   * `PowerState.reset()`）。
   */
  reset(entity: Entity) {
    this.dying = false
    this.deathTime = 0
    this.reported = false
    this.animated = true
    this.invincibleFor = 0
    this.endSequence = false

    entity.getTrait(Solid).obstructs = true
    entity.getTrait(Killable).revive()
    entity.vel.set(0, 0)
  }

  update(entity: Entity, gameContext: GameContext, level: Level) {
    const { deltaTime } = gameContext

    if (this.dying) {
      this.updateDeath(entity, deltaTime, level)
      return
    }

    if (this.endSequence) {
      // 通关收尾序列由 `features/exitSequence.ts` 全权接管（自动走位 / 消失 /
      // 时间结算），这里不再做任何死亡判定。
      return
    }

    if (this.invincibleFor > 0) {
      this.invincibleFor -= deltaTime
      if (entity.getTrait(Killable).dead) {
        entity.getTrait(Killable).revive()
      }
    }

    // 1) 被怪物碰到：敌人那侧的 Behavior 已经调用过 Killable.kill()
    if (entity.getTrait(Killable).dead) {
      this.hurt(entity, level)
      return
    }

    // 2) 掉坑。管道穿行时不算——纵向管道会把马里奥往下送，那期间他确实会低于画布。
    const pipeTraveller = entity.getTrait(PipeTraveller)
    if (pipeTraveller.movement.x === 0 && pipeTraveller.movement.y === 0) {
      if (entity.bounds.top > CANVAS_HEIGHT) {
        this.die(entity, level, false)
        return
      }
    }

    // 3) 时间归零（`LevelTimer` 由 `makePlayer()` 挂上，这里只作防御）。
    // 通关序列里计时已冻结且归零（时间结算完），不能在这里被判死。
    const timer = entity.traits.get(LevelTimer) as LevelTimer | undefined
    if (timer && !timer.frozen && timer.currentTime <= 0) {
      timer.currentTime = 0
      this.die(entity, level)
    }
  }

  /** 死亡动画：定速上抛一小段，然后定速穿过地形掉出画面，最后上报给 `game.ts`。 */
  private updateDeath(entity: Entity, deltaTime: number, level: Level) {
    this.deathTime += deltaTime
    entity.vel.set(0, 0)

    if (this.animated) {
      if (this.deathTime < RISE_TIME) {
        entity.pos.y -= RISE_SPEED * deltaTime
      } else {
        entity.pos.y += FALL_SPEED * deltaTime
      }
    }

    const done = this.animated
      ? entity.bounds.top > CANVAS_HEIGHT
      : this.deathTime > SILENT_DEATH_TIME

    if (done && !this.reported) {
      this.reported = true
      level.events.emit(EVENT_PLAYER_DIED)
    }
  }
}
