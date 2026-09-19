/**
 * entities/Koopa.ts — ported verbatim from upstream `public/js/entities/Koopa.js`.
 * Three-state shell machine: WALKING -> HIDING (5s) -> WALKING, or PANIC when
 * a shell is nudged. Panic speed is signed by the attacker's direction.
 *
 * 本项目新增：杀伤判定一并读 `Killable.killed`（本帧内已经判死）—— 上游只读 `dead`，
 * 而 `dead` 要到帧末才生效，被打死的那一帧它还能反手撞死马里奥。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Killable from '../traits/Killable'
import PendulumMove from '../traits/PendulumMove'
import Physics from '../traits/Physics'
import Solid from '../traits/Solid'
import Stomper from '../traits/Stomper'
import { flipKill } from '../traits/Flipped'
import { extraFxBoard, KICK_SOUND } from '../fxSounds'
import { loadSpriteSheet } from '../loaders/sprite'
import type SpriteSheet from '../SpriteSheet'
import type GameContext from '../GameContext'

export function loadKoopaGreen() {
  return loadSpriteSheet('koopa-green').then(createKoopaFactory)
}

export function loadKoopaBlue() {
  return loadSpriteSheet('koopa-blue').then(createKoopaFactory)
}

const STATE_WALKING = Symbol('walking')
const STATE_HIDING = Symbol('hiding')
const STATE_PANIC = Symbol('panic')

class Behavior extends Trait {
  hideTime = 0
  hideDuration = 5

  walkSpeed: number | null = null
  panicSpeed = 300

  state: symbol = STATE_WALKING

  collides(us: Entity, them: Entity) {
    // 本项目新增：`killed` 是本帧内已经判死（`dead` 要到帧末才生效）。
    const killable = us.getTrait(Killable)
    if (killable.dead || killable.killed) {
      return
    }

    // 本项目新增（原版 shell combo）：滑行中的龟壳撞到其他敌人会把它们打翻——
    // 板栗仔、另一只乌龟（含缩壳的）、子弹、鱼、食人花都算。马里奥（Stomper）
    // 走下面的分支，道具（removeAfter = 0）天然被排除。
    if (this.state === STATE_PANIC && !them.traits.has(Stomper)) {
      const themKillable = them.traits.get(Killable) as Killable | undefined
      if (themKillable && themKillable.removeAfter > 0 && !themKillable.killed && !themKillable.dead) {
        flipKill(them)
        us.sounds.add(KICK_SOUND)
        return
      }
    }

    if (them.traits.has(Stomper)) {
      if (them.vel.y > us.vel.y) {
        this.handleStomp(us, them)
      } else {
        this.handleNudge(us, them)
      }
    }
  }

  handleNudge(us: Entity, them: Entity) {
    if (this.state === STATE_WALKING) {
      them.getTrait(Killable).kill()
    } else if (this.state === STATE_HIDING) {
      this.panic(us, them)
    } else if (this.state === STATE_PANIC) {
      const travelDir = Math.sign(us.vel.x)
      const impactDir = Math.sign(us.pos.x - them.pos.x)
      if (travelDir !== 0 && travelDir !== impactDir) {
        them.getTrait(Killable).kill()
      }
    }
  }

  handleStomp(us: Entity, _them: Entity) {
    if (this.state === STATE_WALKING) {
      this.hide(us)
    } else if (this.state === STATE_HIDING) {
      // 本项目新增（音频）：把缩在壳里的乌龟踢飞（原版这一下也是踢壳声）。
      us.sounds.add(KICK_SOUND)
      us.getTrait(Killable).kill()
      us.vel.set(100, -200)
      us.getTrait(Solid).obstructs = false
    } else if (this.state === STATE_PANIC) {
      this.hide(us)
    }
  }

  hide(us: Entity) {
    us.vel.x = 0
    us.getTrait(PendulumMove).enabled = false
    if (this.walkSpeed === null) {
      this.walkSpeed = us.getTrait(PendulumMove).speed
    }
    this.hideTime = 0
    this.state = STATE_HIDING
  }

  unhide(us: Entity) {
    us.getTrait(PendulumMove).enabled = true
    us.getTrait(PendulumMove).speed = this.walkSpeed!
    this.state = STATE_WALKING
  }

  panic(us: Entity, them: Entity) {
    // 本项目新增（音频）：从侧面钻一下龟壳就把它踢出去了，原版这一下是踢壳声。
    us.sounds.add(KICK_SOUND)
    us.getTrait(PendulumMove).enabled = true
    us.getTrait(PendulumMove).speed = this.panicSpeed * Math.sign(them.vel.x)
    this.state = STATE_PANIC
  }

  update(us: Entity, gameContext: GameContext) {
    const deltaTime = gameContext.deltaTime
    if (this.state === STATE_HIDING) {
      this.hideTime += deltaTime
      if (this.hideTime > this.hideDuration) {
        this.unhide(us)
      }
    }
  }
}

function createKoopaFactory(sprite: SpriteSheet) {
  const walkAnim = sprite.animations.get('walk')!
  const wakeAnim = sprite.animations.get('wake')!

  function routeAnim(koopa: Entity) {
    const behavior = koopa.getTrait(Behavior)
    if (behavior.state === STATE_HIDING) {
      if (behavior.hideTime > 3) {
        return wakeAnim(behavior.hideTime)
      }
      return 'hiding'
    }

    if (behavior.state === STATE_PANIC) {
      return 'hiding'
    }

    return walkAnim(koopa.lifetime)
  }

  function drawKoopa(this: Entity, context: CanvasRenderingContext2D) {
    sprite.draw(routeAnim(this), context, 0, 0, this.vel.x < 0)
  }

  return function createKoopa() {
    const koopa = new Entity()
    koopa.size.set(16, 16)
    koopa.offset.y = 8

    // 本项目新增（音频）：乌龟自己会发声（踢壳的 `kick`），但上游没给它挂音效板，
    // 所以 `us.sounds.add(KICK_SOUND)` 原本是静默的（详见 `fxSounds.ts`）。
    koopa.audio = extraFxBoard([KICK_SOUND])

    koopa.addTrait(new Physics())
    koopa.addTrait(new Solid())
    koopa.addTrait(new PendulumMove())
    koopa.addTrait(new Killable())
    koopa.addTrait(new Behavior())

    koopa.draw = drawKoopa

    return koopa
  }
}
