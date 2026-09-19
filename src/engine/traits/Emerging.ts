/**
 * traits/Emerging.ts —— 本项目新增：道具从方块里钻出来的共用逻辑。
 *
 * 原版的蘑菇 / 火花都是先从方块内部往上冒一个身位、再开始各自动作，所以这段
 * 位移与「只画方块顶边以上部分」的裁剪被抽到这里，`entities/Mushroom.ts` 与
 * `entities/FireFlower.ts` 共用（问号块 / 隐藏块顶开时都会用到）。
 *
 * 这个 trait 必须排在 `Physics` 之前：钻出期间它先把速度锁成 0，Physics 这一帧就
 * 只会看到 0 速度（`checkX` / `checkY` 在速度为 0 时直接 return），于是方块内部的
 * 碰撞不会被解开；钻完之后由 `onDone` 交给各自的运动逻辑。
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 默认钻出速度（px/s）：16px 用 0.5s，对应原版「慢慢冒出来」的手感。 */
export const RISE_SPEED = 32

export default class Emerging extends Trait {
  /** 钻出的目标 y（方块顶边再往上一个身位）。 */
  targetY = 0

  /** 钻出速度（px/s）。 */
  riseSpeed = RISE_SPEED

  /** 已经钻出来了。 */
  done = false

  /** 钻完之后调用（蘑菇用它在这一刻打开走动开关）。 */
  onDone?: (entity: Entity) => void

  update(entity: Entity, { deltaTime }: GameContext, _level: Level) {
    if (this.done) {
      return
    }

    entity.vel.set(0, 0)
    entity.pos.y -= this.riseSpeed * deltaTime

    if (entity.pos.y > this.targetY) {
      return
    }

    entity.pos.y = this.targetY
    this.done = true
    this.onDone?.(entity)
  }
}

/**
 * 钻出期间的绘制：只画方块顶边以上的部分，看起来才像从方块里冒出来。
 *
 * 判据是「还在钻」（`emerging.done`），**不是**「比方块顶低」——蘑菇钻完之后会向右走、
 * 走出方块边缘并掉到方块顶以下，那时它要整只都画出来（这正是
 * docs/verification.md §6.1.2 里修掉的那个「蘑菇看不见」bug）。`blockTop` 是方块顶边
 * （`Match.y1`），`sprite` 是已经准备好的 16x16 离屏 canvas。
 */
export function drawEmergingItem(
  context: CanvasRenderingContext2D,
  sprite: CanvasImageSource,
  entity: Entity,
  emerging: Emerging,
  blockTop: number,
  size = 16,
) {
  const visible = emerging.done ? size : Math.max(0, Math.min(size, blockTop - entity.pos.y))
  if (visible <= 0) {
    return
  }

  if (visible < size) {
    context.save()
    context.beginPath()
    context.rect(0, 0, size, visible)
    context.clip()
  }

  context.drawImage(sprite, 0, 0)

  if (visible < size) {
    context.restore()
  }
}
