/**
 * Entity.ts — ported from upstream `public/js/Entity.js`.
 *
 * Only change vs. upstream: `traits` is typed, and helper accessors
 * (getTrait/hasTrait) are added. The ECS semantics — traits keyed by their
 * constructor, deferred task queue drained in finalize() — are unchanged.
 */
import { Vec2 } from './math'
import AudioBoard from './AudioBoard'
import BoundingBox from './BoundingBox'
import EventBuffer from './EventBuffer'
import Trait from './Trait'
import type GameContext from './GameContext'
import type Level from './Level'

export const Align = {
  center(target: Entity, subject: Entity) {
    subject.bounds.setCenter(target.bounds.getCenter())
  },
  bottom(target: Entity, subject: Entity) {
    subject.bounds.bottom = target.bounds.bottom
  },
  top(target: Entity, subject: Entity) {
    subject.bounds.top = target.bounds.top
  },
  left(target: Entity, subject: Entity) {
    subject.bounds.left = target.bounds.left
  },
  right(target: Entity, subject: Entity) {
    subject.bounds.right = target.bounds.right
  },
}

export const Sides = {
  TOP: Symbol('top'),
  BOTTOM: Symbol('bottom'),
  LEFT: Symbol('left'),
  RIGHT: Symbol('right'),
}

export type Side = (typeof Sides)[keyof typeof Sides]

export type TraitCtor<T extends Trait = Trait> = new (...args: any[]) => T

export default class Entity {
  id: string | null = null
  audio = new AudioBoard()
  events = new EventBuffer()
  sounds = new Set<string>()

  pos = new Vec2(0, 0)
  vel = new Vec2(0, 0)
  size = new Vec2(0, 0)
  offset = new Vec2(0, 0)
  bounds = new BoundingBox(this.pos, this.size, this.offset)
  lifetime = 0

  traits = new Map<Function, Trait>()

  /** Optional per-entity draw hook (the upstream `entity.draw` closure). */
  draw?: (context: CanvasRenderingContext2D) => void
  /** Optional turbo switch installed by Mario's factory. */
  turbo?: (turboOn: boolean) => void
  /** Free-form props carried by spawned entities (pipes, triggers). */
  props?: any

  addTrait(trait: Trait) {
    this.traits.set(trait.constructor, trait)
  }

  getTrait<T extends Trait>(ctor: TraitCtor<T>): T {
    return this.traits.get(ctor) as T
  }

  hasTrait(ctor: Function) {
    return this.traits.has(ctor)
  }

  collides(candidate: Entity) {
    this.traits.forEach((trait) => {
      trait.collides(this, candidate)
    })
  }

  obstruct(side: Side, match: any) {
    this.traits.forEach((trait) => {
      trait.obstruct(this, side, match)
    })
  }

  finalize() {
    this.events.emit(Trait.EVENT_TASK, this)

    this.traits.forEach((trait) => {
      trait.finalize(this)
    })

    this.events.clear()
  }

  playSounds(audioBoard: AudioBoard, audioContext: AudioContext) {
    this.sounds.forEach((name) => {
      audioBoard.playAudio(name, audioContext)
    })

    this.sounds.clear()
  }

  update(gameContext: GameContext, level: Level) {
    this.traits.forEach((trait) => {
      trait.update(this, gameContext, level)
    })

    this.playSounds(this.audio, gameContext.audioContext)

    this.lifetime += gameContext.deltaTime
  }
}
