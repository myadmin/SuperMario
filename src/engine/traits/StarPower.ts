/**
 * traits/StarPower.ts —— 本项目新增：无敌星状态（吃到无敌星后的约 10.5 秒）。
 *
 * 原版 SMB 规则：
 *   - 无敌期间马里奥**碰到敌人就把敌人打翻**（板栗仔 / 乌龟 / 子弹 / 鱼 / 食人花……），
 *     自己毫发无伤；
 *   - 效果持续约 10 秒，期间马里奥的调色板不停闪烁（`entities/Mario.ts` 的绘制负责）；
 *   - 期间放星星主题曲（循环），效果结束后恢复关卡主题曲——如果时间已经进入
 *     hurry（<100），恢复的是加速版；
 *   - 死亡 / 换关会立即清掉无敌（`traits/Damage.die` 与 `game.ts` 负责调 `cancel()`）。
 *
 * 「碰敌打翻」走 `collides`（每帧由 EntityCollider 调用），判据与火球一致：
 * `Killable.removeAfter > 0` 且还活着的实体——道具（0，吃到才消失）与马里奥
 * （Player trait）都被排除，所以不会误杀道具或自己。
 */
import Trait from '../Trait'
import Killable from './Killable'
import LevelTimer from './LevelTimer'
import Player from './Player'
import Damage from './Damage'
import { flipKill } from './Flipped'
import { playStarTheme, stopStarTheme } from '../jingle'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 无敌时长（秒）。原版约 200 帧（@60fps ≈ 10.6s），取整。 */
const DURATION = 10.5

export default class StarPower extends Trait {
  /** 是否处于无敌中（`entities/Mario.ts` 的调色板闪烁读它）。 */
  active = false

  /** 剩余时长（秒）。 */
  time = 0

  /** 吃到无敌星：起播星星音乐、开始计时（重复调用刷新时长，与原版「连吃叠加」一致）。 */
  start() {
    this.active = true
    this.time = DURATION
    playStarTheme()
  }

  /** 立即结束无敌（死亡 / 换关清理用）：停音乐，不恢复主题曲（由调用方决定放什么）。 */
  cancel() {
    if (!this.active) {
      return
    }

    this.active = false
    this.time = 0
    stopStarTheme()
  }

  update(entity: Entity, { deltaTime }: GameContext, level: Level) {
    if (!this.active) {
      return
    }

    this.time -= deltaTime
    if (this.time <= 0) {
      this.active = false
      this.time = 0
      stopStarTheme()

      // 恢复关卡主题曲：时间已经进入 hurry 就直接放加速版（音乐被星星顶掉的那段
      // 时间照原版「无缝续上 hurry 状态」处理，只是从头起播）。
      // 例外：通关收尾序列中不恢复——抓杆之后本就该静音（原版），恢复会盖过收尾节奏。
      const damage = entity.traits.get(Damage) as Damage | undefined
      if (damage && damage.endSequence) {
        return
      }

      const timer = entity.traits.get(LevelTimer) as LevelTimer | undefined
      if (timer && timer.hurryEmitted === true) {
        level.music.playHurryTheme()
      } else {
        level.music.playTheme()
      }
    }
  }

  collides(us: Entity, them: Entity) {
    if (!this.active) {
      return
    }

    if (them.traits.has(Player)) {
      return
    }

    const killable = them.traits.get(Killable) as Killable | undefined
    if (!killable || killable.removeAfter <= 0 || killable.killed || killable.dead) {
      return
    }

    flipKill(them)
    us.sounds.add('kick')
  }
}
