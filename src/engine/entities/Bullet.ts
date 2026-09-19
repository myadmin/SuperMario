/**
 * entities/Bullet.ts — ported verbatim from upstream `public/js/entities/Bullet.js`.
 * A cannonball: straight-line Velocity while alive, gravity once killed.
 *
 * 本项目新增：杀伤判定一并读 `Killable.killed`（本帧内已经判死）—— 上游只读 `dead`，
 * 而 `dead` 要到帧末才生效，被踩死 / 打翻的那一帧它还能反手撞死马里奥。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Killable from '../traits/Killable'
import Gravity from '../traits/Gravity'
import Stomper from '../traits/Stomper'
import Velocity from '../traits/Velocity'
import { loadSpriteSheet } from '../loaders/sprite'
import type SpriteSheet from '../SpriteSheet'
import type GameContext from '../GameContext'
import type Level from '../Level'

export function loadBullet() {
  return loadSpriteSheet('bullet').then(createBulletFactory)
}

class Behavior extends Trait {
  gravity = new Gravity()

  collides(us: Entity, them: Entity) {
    // 本项目新增：`killed` 是本帧内已经判死（`dead` 要到帧末才生效）。
    const killable = us.getTrait(Killable)
    if (killable.dead || killable.killed) {
      return
    }

    if (them.traits.has(Stomper)) {
      if (them.vel.y > us.vel.y) {
        us.getTrait(Killable).kill()
        us.vel.set(100, -200)
      } else {
        them.getTrait(Killable).kill()
      }
    }
  }

  update(entity: Entity, gameContext: GameContext, level: Level) {
    if (entity.getTrait(Killable).dead) {
      this.gravity.update(entity, gameContext, level)
    }
  }
}

function createBulletFactory(sprite: SpriteSheet) {
  function drawBullet(this: Entity, context: CanvasRenderingContext2D) {
    sprite.draw('bullet', context, 0, 0, this.vel.x > 0)
  }

  return function createBullet() {
    const bullet = new Entity()
    bullet.size.set(16, 14)

    bullet.addTrait(new Velocity())
    bullet.addTrait(new Behavior())
    bullet.addTrait(new Killable())

    bullet.draw = drawBullet

    return bullet
  }
}
