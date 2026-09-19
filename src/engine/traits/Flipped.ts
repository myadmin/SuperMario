/**
 * traits/Flipped.ts —— 本项目新增：被火球打翻的敌人。
 *
 * 上游只有「踩扁」一种死亡表现：`Killable.dead` 之后板栗仔改画 `flat` 帧、**原地留
 * 2 秒**（`Killable.removeAfter`）才被删。火球（本项目新增）打死敌人时套用这条路，
 * 看起来就是「怪物没死、只是趴下了」，而且这 2 秒里它还在照常走动 —— 玩家分不清
 * 它到底死没死。
 *
 * 原版的规矩是：被火球（以及无敌星）打中的敌人**翻过来**，直直掉出画面，并且从被
 * 命中的那一刻起就不再构成威胁。翻转帧素材里没有（`public/sprites/*.json` 只有正常帧
 * 和踩扁帧），所以和火球 / 蘑菇一样在绘制时现做：包一层 `entity.draw`，把精灵沿
 * 「包围盒高度」垂直镜像。这个高度对所有会挨火球的敌人都刚好等于精灵高度 ——
 * 板栗仔 `16x16`（offset 0）、乌龟 `16x24`（`offset.y = 8` + `size.y = 16`）、
 * 鱼 `16x16`（offset 0）—— 所以翻的就是原图那一格，位置不偏。
 *
 * 「立刻不再有威胁」由 `Killable.kill('flip')` 里的 `killed` 标志负责（见该文件），
 * 这里只负责外观与下落。
 */
import Trait from '../Trait'
import Killable from './Killable'
import PendulumMove from './PendulumMove'
import Solid from './Solid'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 打翻后的下落速度（px/s）：比马里奥的死亡动画稍慢一点，看得清是「翻着掉下去」。 */
export const FALL_SPEED = 160

/** 画布高（相机 `pos.y` 恒为 0）。整只掉到这条线以下就删掉。 */
const CANVAS_HEIGHT = 240

export default class Flipped extends Trait {
  update(entity: Entity, { deltaTime }: GameContext, level: Level) {
    // 自己算位移、自己把速度清零：不依赖与 `Physics` / `PendulumMove` 的先后顺序。
    // （重力每帧都会往 `vel.y` 上加，若让 Physics 用这个速度再走一遍，就成了双重下落。）
    entity.vel.set(0, 0)
    entity.pos.y += FALL_SPEED * deltaTime

    if (entity.bounds.top > CANVAS_HEIGHT) {
      level.entities.delete(entity)
    }
  }
}

/**
 * 把 `entity` 打翻：翻着掉出画面，并且**立刻**不再能伤到马里奥。
 * `entities/Fireball.ts` 打中敌人时调它。
 */
export function flipKill(entity: Entity) {
  // 判死（cause = 'flip'）：`killed` 立即生效，所以同一帧里它已经伤不到马里奥了。
  entity.getTrait(Killable).kill('flip')

  // 掉出画面的路上不再撞地形（原版的翻倒敌人穿地而过），也不再走动。
  const solid = entity.traits.get(Solid) as Solid | undefined
  if (solid) {
    solid.obstructs = false
  }
  const walk = entity.traits.get(PendulumMove) as PendulumMove | undefined
  if (walk) {
    walk.enabled = false
  }

  // 绘制时垂直镜像：绕「offset.y + size.y」这条线翻（精灵画在局部 (0,0)）。
  const draw = entity.draw
  if (draw) {
    const height = entity.offset.y + entity.size.y
    entity.draw = function (this: Entity, context: CanvasRenderingContext2D) {
      context.save()
      context.translate(0, height)
      context.scale(1, -1)
      draw.call(this, context)
      context.restore()
    }
  }

  entity.addTrait(new Flipped())
}
