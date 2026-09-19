/**
 * scorePopups.ts —— 本项目新增：加命（以及后续得分）的**飘字**。
 *
 * 为什么需要它：**关卡内的 HUD 里根本没有命数**——上游的 dashboard 画的是
 * `MARIO / 分数 / ×金币 / WORLD / TIME`（与原版一致），命数只在关卡之间的
 * `MARIO ×N` 页（`layers/player-progress`）和 GAME OVER 结算里出现。于是吃到加命蘑菇时，
 * 玩家在自己的屏幕上**什么都看不到**：绿色蘑菇钻出来、被吃掉、然后什么都没有
 * （1-UP 音效是唯一的反馈，音乐一开还容易被盖过去）。
 *
 * 原版在这一刻会冒出白色的「1UP」小字（马里奥 Wiki 对 1-Up Mushroom 的说明：
 * collecting a 1UP Mushroom displays "1-UP" briefly），本项目照此补上。
 *
 * 画字用现成的位图字体（`loaders/font`），链路是：`traits/Player.addLives` 记下一次
 * 「待弹」，下一帧 `Player.update` 拿到 `level` 时把飘字实体加进关卡——和
 * `traits/Damage` 上报死亡事件同一个路子（`collides` 里拿不到 `level`）。
 */
import Entity from './Entity'
import Trait from './Trait'
import LifeLimit from './traits/LifeLimit'
import type { Font } from './loaders/font'
import type GameContext from './GameContext'
import type Level from './Level'

/** 飘字上浮距离（像素）与存活时长（秒）：原版就是「小字往上飘一小段然后消失」。 */
const RISE = 24
const LIFE = 1

/**
 * 位图字体由 `game.ts` 在加载完成后注入（与 `features/chanceBlock` 注入精灵表同一路子：
 * 字体是宿主的资源，实体 / 特性模块不该自己去加载第二份）。
 */
let popupFont: Font | undefined

export function setScorePopupFont(font: Font) {
  popupFont = font
}

/** 匀速上浮（字体 8x8，一秒 24px 正好是「飘了一小段」的量）。 */
class Float extends Trait {
  update(entity: Entity, { deltaTime }: GameContext) {
    entity.pos.y -= (RISE / LIFE) * deltaTime
  }
}

/**
 * 在 `(x, y)`（世界坐标 = 文字左上角）弹出一段白色小字。
 * 字体还没注入时静默跳过（正常流程里 `game.ts` 在进入关卡前就注入好了）。
 */
export function popupText(level: Level, x: number, y: number, text: string) {
  if (!popupFont) {
    return
  }

  const entity = new Entity()
  // 0 尺寸：飘字只负责画，不参与任何实体碰撞（SpriteLayer 照旧按 pos 定位）。
  entity.size.set(0, 0)
  entity.pos.set(x, y)
  entity.addTrait(new Float())

  const life = new LifeLimit()
  life.time = LIFE
  entity.addTrait(life)

  entity.draw = (context) => popupFont!.print(text, context, 0, 0)

  level.entities.add(entity)
}
