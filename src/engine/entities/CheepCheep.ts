/**
 * entities/CheepCheep.ts — ported verbatim from upstream `public/js/entities/CheepCheep.js`.
 * Four variants: slow/fast x straight/wavy. Wavy adds a sinusoidal Y drift.
 *
 * 本项目新增两处：
 *   - 鱼身上原来**连 `Killable` 都没有**，于是火球只能从它身上穿过去（原版的鱼是能被
 *     火球打死的），这里补上这个 trait（打翻后的外观 / 下落由 `traits/Flipped` 处理）；
 *   - 杀伤判定是这个文件里最好写错的一处：上游无条件 `them.getTrait(Killable).kill()`，
 *     连自己死没死都不看 —— 一旦补上 `Killable`，一条已经被火球打翻的鱼会永远把马里奥
 *     撞死。改为先看自己的 `killed || dead`。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Killable from '../traits/Killable'
import { loadSpriteSheet } from '../loaders/sprite'
import type SpriteSheet from '../SpriteSheet'
import type GameContext from '../GameContext'

export function loadCheepSlow() {
  return loadSpriteSheet('cheep-gray').then(createCheepSlowFactory)
}

export function loadCheepSlowWavy() {
  return loadSpriteSheet('cheep-gray').then(createCheepSlowWavyFactory)
}

export function loadCheepFast() {
  return loadSpriteSheet('cheep-red').then(createCheepFastFactory)
}

export function loadCheepFastWavy() {
  return loadSpriteSheet('cheep-red').then(createCheepFastWavyFactory)
}

class Behavior extends Trait {
  collides(us: Entity, them: Entity) {
    // 本项目新增：自己已经判死 / 已死就不再伤到别人。
    const killable = us.getTrait(Killable)
    if (killable && (killable.dead || killable.killed)) {
      return
    }

    if (them.traits.has(Killable)) {
      them.getTrait(Killable).kill()
    }
  }

  update(entity: Entity, gameContext: GameContext) {
    const { deltaTime } = gameContext
    entity.pos.x += entity.vel.x * deltaTime
  }
}

class Wavy extends Trait {
  amplitude = 16
  direction = 1
  offset = 0
  speed = 0.5

  update(entity: Entity, gameContext: GameContext) {
    const { deltaTime } = gameContext
    const movementY = entity.vel.x * deltaTime * this.direction * this.speed
    entity.pos.y += movementY

    this.offset += movementY
    if (Math.abs(this.offset) > this.amplitude) {
      this.direction = -this.direction
    }
  }
}

function makeFactory(sprite: SpriteSheet, speed: number, wavy: boolean, wavySpeed?: number) {
  const swimAnim = sprite.animations.get('swim')!

  function routeAnim(entity: Entity) {
    return swimAnim(entity.lifetime)
  }

  function drawCheep(this: Entity, context: CanvasRenderingContext2D) {
    sprite.draw(routeAnim(this), context, 0, 0, true)
  }

  return function createCheep() {
    const entity = new Entity()
    entity.size.set(16, 16)
    entity.vel.x = speed

    entity.addTrait(new Behavior())
    // 本项目新增：鱼也要能被火球打死（`traits/Fireball.ts` 的判据就是这条）。
    entity.addTrait(new Killable())
    if (wavy) {
      entity.addTrait(new Wavy())
      if (wavySpeed !== undefined) {
        entity.getTrait(Wavy).speed = wavySpeed
      }
    }

    entity.draw = drawCheep

    return entity
  }
}

function createCheepSlowFactory(sprite: SpriteSheet) {
  return makeFactory(sprite, -16, false)
}

function createCheepSlowWavyFactory(sprite: SpriteSheet) {
  return makeFactory(sprite, -16, true)
}

function createCheepFastFactory(sprite: SpriteSheet) {
  return makeFactory(sprite, -32, false)
}

function createCheepFastWavyFactory(sprite: SpriteSheet) {
  return makeFactory(sprite, -32, true, 0.25)
}
