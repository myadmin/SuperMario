/**
 * entities/Lift.ts —— 本项目新增：原版 1-2 结尾那种上下往返的平台（升降桥）。
 *
 * 素材里没有「升降台」这张贴图（14 个精灵表都确认过），但原版的升降台本来就是
 * 几格**硬块**拼的，而三张地下/城堡的精灵表都定义了 `metal`（黑边 + 四角铆钉的
 * 实心块，也正是本项目「顶过的问号块」那格外观），所以直接用它横向拼 `width` 格，
 * 与该关的砖块/地面风格一致，不需要新增素材。
 *
 * 行为在 `traits/Lift` 里（垂直往返 + 带着站在上面的马里奥走），这里只负责：
 *   - 尺寸（宽 = 格数 × 16，高 16）、位置与行程初始化；
 *   - `draw`：逐格画 `metal`。
 */
import Entity from '../Entity'
import Lift from '../traits/Lift'
import type SpriteSheet from '../SpriteSheet'

/** 升降台用的是「硬块」这一格（与问号块用过的方块同一张，见 features/chanceBlock.ts）。 */
const LIFT_TILE_STYLE = 'metal'

/** 一格宽 / 高（像素），与关卡网格一致。 */
const TILE_SIZE = 16

export type LiftSpec = {
  /** 左边缘的世界 x（像素）。 */
  x: number
  /** 顶边能到的最高 y（像素）。 */
  top: number
  /** 顶边能到的最低 y（像素），通常就是地面高度。 */
  bottom: number
  /** 宽度（格数），原版是 3 格。 */
  width: number
  /** 起始端：`top` = 从最高处开始往下走，`bottom` = 从最低处开始往上走。 */
  startAt: 'top' | 'bottom'
  /** 移动速度（像素/秒），缺省用 `traits/Lift` 的默认值。 */
  speed?: number
}

/** 造一台升降台。`sprites` 是关卡的背景精灵表（与其它特性一样由 ctx 传入）。 */
export function createLiftEntity(sprites: SpriteSheet, spec: LiftSpec) {
  const lift = new Entity()
  lift.size.set(spec.width * TILE_SIZE, TILE_SIZE)
  lift.pos.set(spec.x, spec.startAt === 'top' ? spec.top : spec.bottom)

  const motion = new Lift()
  motion.top = spec.top
  motion.bottom = spec.bottom
  motion.direction = spec.startAt === 'top' ? 1 : -1
  if (typeof spec.speed === 'number') {
    motion.speed = spec.speed
  }
  lift.addTrait(motion)

  const hasTile = sprites.tiles.has(LIFT_TILE_STYLE)

  lift.draw = (context) => {
    if (hasTile) {
      for (let i = 0; i < spec.width; i++) {
        sprites.drawTile(LIFT_TILE_STYLE, context, i, 0)
      }
      return
    }

    // 防御：精灵表里没有硬块时至少画一块灰台，别让平台变成隐形的。
    context.fillStyle = '#a35d00'
    context.fillRect(0, 0, spec.width * TILE_SIZE, TILE_SIZE)
  }

  return lift
}
