/**
 * entities/Goomba.ts — ported verbatim from upstream `public/js/entities/Goomba.js`.
 *
 * 本项目新增（两处，都是为了「已经死掉的板栗仔不能再撞死马里奥」）：
 *   - 杀伤判定读 `Killable.killed`（本帧内已经判死）—— 上游只读 `dead`，而 `dead`
 *     要到帧末才生效，所以被打死的那一帧它仍然能反手撞死马里奥；
 *   - `flipped`（被火球打翻）时不画「踩扁」帧 —— 翻倒的板栗仔是正常帧垂直镜像。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Killable from '../traits/Killable'
import PendulumMove from '../traits/PendulumMove'
import Physics from '../traits/Physics'
import Solid from '../traits/Solid'
import Stomper from '../traits/Stomper'
import { loadSpriteSheet } from '../loaders/sprite'
import type SpriteSheet from '../SpriteSheet'

export function loadGoombaBrown() {
  return loadSpriteSheet('goomba-brown').then(createGoombaFactory)
}

export function loadGoombaBlue() {
  return loadSpriteSheet('goomba-blue').then(createGoombaFactory)
}

class Behavior extends Trait {
  collides(us: Entity, them: Entity) {
    // 本项目新增：`killed` 是本帧内已经判死（`dead` 要到帧末才生效）。
    const killable = us.getTrait(Killable)
    if (killable.dead || killable.killed) {
      return
    }

    if (them.traits.has(Stomper)) {
      if (them.vel.y > us.vel.y) {
        us.getTrait(Killable).kill()
        us.getTrait(PendulumMove).speed = 0
      } else {
        them.getTrait(Killable).kill()
      }
    }
  }
}

function createGoombaFactory(sprite: SpriteSheet) {
  const walkAnim = sprite.animations.get('walk')!

  function routeAnim(goomba: Entity) {
    const killable = goomba.getTrait(Killable)
    // 本项目新增：被火球打翻的画正常帧（绘制时整体垂直镜像），不是「踩扁」那一帧。
    if (killable.dead && !killable.flipped) {
      return 'flat'
    }

    return walkAnim(goomba.lifetime)
  }

  function drawGoomba(this: Entity, context: CanvasRenderingContext2D) {
    sprite.draw(routeAnim(this), context, 0, 0)
  }

  return function createGoomba() {
    const goomba = new Entity()
    goomba.size.set(16, 16)

    goomba.addTrait(new Physics())
    goomba.addTrait(new Solid())
    goomba.addTrait(new PendulumMove())
    goomba.addTrait(new Behavior())
    goomba.addTrait(new Killable())

    goomba.draw = drawGoomba

    return goomba
  }
}
