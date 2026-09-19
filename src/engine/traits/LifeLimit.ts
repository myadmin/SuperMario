/**
 * traits/LifeLimit.ts — ported verbatim from upstream `public/js/traits/LifeLimit.js`.
 */
import Trait from '../Trait'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

export default class LifeLimit extends Trait {
  time = 2

  update(entity: Entity, _gameContext: GameContext, level: Level) {
    if (entity.lifetime > this.time) {
      this.queue(() => {
        level.entities.delete(entity)
      })
    }
  }
}
