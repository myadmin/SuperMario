/**
 * Level.ts — ported verbatim from upstream `public/js/Level.js`.
 *
 * Camera follows the player at x - 100, clamped to the level bounds; gravity
 * is 1500; entity + tile collision and finalize ordering match upstream.
 */
import Camera from './Camera'
import MusicController from './MusicController'
import EntityCollider from './EntityCollider'
import Scene from './Scene'
import TileCollider from './TileCollider'
import { clamp } from './math'
import { findPlayers } from './player'
import type Entity from './Entity'
import type GameContext from './GameContext'

function focusPlayer(level: Level) {
  for (const player of findPlayers(level.entities)) {
    level.camera.pos.x = clamp(
      player.pos.x - 100,
      level.camera.min.x,
      level.camera.max.x - level.camera.size.x,
    )
  }
}

class EntityCollection extends Set<Entity> {
  get(id: string) {
    for (const entity of this) {
      if (entity.id === id) {
        return entity
      }
    }
    return undefined
  }
}

export default class Level extends Scene {
  static EVENT_TRIGGER = Symbol('trigger')
  static EVENT_COMPLETE = Symbol('complete')

  name = ''

  checkpoints: import('./math').Vec2[] = []

  gravity = 1500
  totalTime = 0

  camera = new Camera()
  music = new MusicController()

  entities = new EntityCollection()

  entityCollider = new EntityCollider(this.entities)
  tileCollider = new TileCollider()

  draw(gameContext: GameContext) {
    this.comp.draw(gameContext.videoContext, this.camera)
  }

  update(gameContext: GameContext) {
    this.entities.forEach((entity) => {
      entity.update(gameContext, this)
    })

    this.entities.forEach((entity) => {
      this.entityCollider.check(entity)
    })

    this.entities.forEach((entity) => {
      entity.finalize()
    })

    focusPlayer(this)

    this.totalTime += gameContext.deltaTime
  }

  pause() {
    this.music.pause()
  }
}
