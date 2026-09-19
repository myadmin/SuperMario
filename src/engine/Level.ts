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
import Damage from './traits/Damage'
import { clamp } from './math'
import { findPlayers } from './player'
import type Entity from './Entity'
import type GameContext from './GameContext'

/** 本项目新增：玩家不能走出镜头（原版 SMB 行为——镜头左/右缘对玩家都是墙）。 */
function constrainPlayer(level: Level, player: Entity) {
  // 死亡动画要穿越地形掉出画面，不参与约束
  const damage = player.traits.get(Damage) as Damage | undefined
  if (damage?.dying) {
    return
  }

  const minX = level.camera.pos.x
  if (player.pos.x < minX) {
    player.pos.x = minX
    if (player.vel.x < 0) {
      player.vel.x = 0
    }
  }

  const maxX = level.camera.pos.x + level.camera.size.x
  if (player.bounds.right > maxX) {
    player.bounds.right = maxX
    if (player.vel.x > 0) {
      player.vel.x = 0
    }
  }
}

function focusPlayer(level: Level) {
  for (const player of findPlayers(level.entities)) {
    // 原版 SMB 行为：镜头只随玩家**右移**、从不回卷（上游实现会跟着玩家往回滚，
    // 玩家因此能走出镜头左缘、掉进画面外的坑里死亡——用户实测报告）。
    const target = clamp(
      player.pos.x - 100,
      level.camera.min.x,
      level.camera.max.x - level.camera.size.x,
    )
    if (target > level.camera.pos.x) {
      level.camera.pos.x = target
    }
  }

  for (const player of findPlayers(level.entities)) {
    constrainPlayer(level, player)
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
