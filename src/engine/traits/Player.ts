/**
 * traits/Player.ts — ported from upstream `public/js/traits/Player.js`.
 * Holds the scoreboard data and the 100-coin -> 1-up rule.
 *
 * 本项目新增：加命时的两处反馈——原版的 1-UP 音效（`ONE_UP_SOUND`）与头顶冒出的
 * 「1UP」飘字（`scorePopups.ts`）。飘字是必需的：**关卡内的 HUD 里没有命数**
 * （与原版一致），不加飘字的话吃加命蘑菇在屏幕上看起来就是「什么都没发生」。
 * 飘字必须等 `update` 拿到 `level` 才能加实体，所以这里只记个数（`pendingUps`）。
 */
import Trait from '../Trait'
import Stomper from './Stomper'
import { ONE_UP_SOUND } from '../fxSounds'
import { popupText } from '../scorePopups'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

const COIN_LIFE_THRESHOLD = 100

/** 一条待弹的得分飘字：世界坐标（文字中心 x / 文字顶 y）+ 文本。 */
type PendingPopup = { x: number; y: number; text: string }

export default class Player extends Trait {
  name = 'UNNAMED'
  world = 'UNKNOWN'
  coins = 0
  lives = 3
  score = 0

  /** 本项目新增：还差几个「1UP」飘字没弹（下一个 `update` 里补上）。 */
  pendingUps = 0

  /**
   * 本项目新增：待弹的得分飘字（踩扁 / 顶块金币 / 吃道具 / 旗杆得分……）。
   * 与 `pendingUps` 同一个路子：`collides` 里拿不到 `level`，只能等 `update` 补弹。
   */
  pendingPopups: PendingPopup[] = []

  constructor() {
    super()

    this.listen(Stomper.EVENT_STOMP, (...args: unknown[]) => {
      const [, them] = args as [Entity, Entity]
      this.score += 100
      // 原版踩扁会冒出「100」白字（位置在被踩的敌人身上）。
      this.pendingPopups.push({ x: them.pos.x + them.size.x / 2, y: them.pos.y - 4, text: '100' })
    })
  }

  addCoins(count: number) {
    this.coins += count
    this.queue((entity: Entity) => entity.sounds.add('coin'))
    while (this.coins >= COIN_LIFE_THRESHOLD) {
      this.addLives(1)
      this.coins -= COIN_LIFE_THRESHOLD
    }
  }

  addLives(count: number) {
    this.lives += count
    // 原版无论是吃到 1-UP 蘑菇还是攒满 100 枚金币，都会响这段叮咚声。
    this.queue((entity: Entity) => entity.sounds.add(ONE_UP_SOUND))
    this.pendingUps += count
  }

  /**
   * 本项目新增：登记一条得分飘字（原版各类得分都会冒白字）。
   * `x` 是文字的**中心**，`y` 是文字顶边；按字数折算成左上角坐标后入队。
   */
  pushScorePopup(centerX: number, topY: number, text: string) {
    this.pendingPopups.push({ x: centerX - (text.length * 8) / 2, y: topY, text })
  }

  /**
   * 本项目新增：把待弹的飘字放到关卡里（位置是**世界坐标**，跟着相机滚动）。
   */
  update(entity: Entity, _gameContext: GameContext, level: Level) {
    while (this.pendingUps > 0) {
      this.pendingUps -= 1
      popupText(level, entity.pos.x, entity.pos.y - 8, '1UP')
    }

    for (const popup of this.pendingPopups) {
      popupText(level, popup.x, popup.y, popup.text)
    }
    this.pendingPopups.length = 0
  }
}
