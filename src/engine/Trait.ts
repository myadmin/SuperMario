/**
 * Trait.ts — ported verbatim from upstream `public/js/Trait.js`.
 * Base class for all behaviours attached to an Entity.
 */
import type Entity from './Entity'
import type { Side } from './Entity'
import type { Match } from './TileResolver'
import type GameContext from './GameContext'
import type Level from './Level'

export type TraitListener = {
  name: symbol
  callback: (...args: unknown[]) => void
  count: number
}

export default class Trait {
  static EVENT_TASK = Symbol('task')

  listeners: TraitListener[] = []

  listen(name: symbol, callback: (...args: unknown[]) => void, count = Infinity) {
    const listener = { name, callback, count }
    this.listeners.push(listener)
  }

  finalize(entity: Entity) {
    this.listeners = this.listeners.filter((listener) => {
      entity.events.process(listener.name, listener.callback)
      return --listener.count
    })
  }

  queue(task: (entity: Entity) => void) {
    this.listen((Trait.EVENT_TASK as symbol) as symbol, task as (...args: unknown[]) => void, 1)
  }

  collides(_us: Entity, _them: Entity): void {}

  obstruct(_entity: Entity, _side: Side, _match: Match): void {}

  update(_entity: Entity, _gameContext: GameContext, _level: Level): void {}
}
