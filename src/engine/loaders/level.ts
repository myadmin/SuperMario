/**
 * loaders/level.ts — ported verbatim from upstream `public/js/loaders/level.js`.
 *
 * Turns a level JSON spec into a Level: expands tile ranges (recursively
 * through named patterns) into sparse Matrix grids, spawns entities (deferred
 * off-screen ones behind a Spawner proxy), wires triggers/checkpoints, sizes
 * the camera from the widest grid, and builds the background + sprite layers.
 */
import { Matrix, Vec2 } from '../math'
import Entity from '../Entity'
import Trait from '../Trait'
import LevelTimer from '../traits/LevelTimer'
import Trigger from '../traits/Trigger'
import Level from '../Level'
import { createSpriteLayer } from '../layers/sprites'
import { createBackgroundLayer } from '../layers/background'
import { loadMusicSheet } from './music'
import { loadSpriteSheet } from './sprite'
import { loadJSON } from './loaders'
import { applyLevelFeatures } from '../levelFeatures'
import { patchFor } from '../levelPatches'
import type GameContext from '../GameContext'
import type { EntityFactory } from '../GameContext'
import type SpriteSheet from '../SpriteSheet'
import type { Tile } from '../TileResolver'
import type MusicPlayer from '../MusicPlayer'

type TileRange = number[]

type LayerTileSpec = {
  style?: string
  behavior?: string
  pattern?: string
  ranges: TileRange[]
}

type LevelLayerSpec = { tiles: LayerTileSpec[] }

type EntitySpec = {
  id?: string
  name: string
  pos: [number, number]
  props?: any
}

type TriggerSpec = { pos: [number, number]; type: string; name?: string }

export type LevelSpec = {
  spriteSheet: string
  musicSheet: string
  patternSheet: string
  checkpoints?: Array<[number, number]>
  layers: LevelLayerSpec[]
  entities: EntitySpec[]
  triggers?: TriggerSpec[]
}

type PatternSpec = Record<string, { tiles: LayerTileSpec[] }>

function createSpawner() {
  class Spawner extends Trait {
    entities: Entity[] = []
    offsetX = 64

    addEntity(entity: Entity) {
      this.entities.push(entity)
      this.entities.sort((a, b) => (a.pos.x < b.pos.x ? -1 : 1))
    }

    update(_entity: Entity, _gameContext: GameContext, level: Level) {
      const cameraMaxX = level.camera.pos.x + level.camera.size.x + this.offsetX
      while (this.entities[0]) {
        if (cameraMaxX > this.entities[0].pos.x) {
          level.entities.add(this.entities.shift()!)
        } else {
          break
        }
      }
    }
  }

  return new Spawner()
}

function loadPattern(name: string): Promise<PatternSpec> {
  return loadJSON<PatternSpec>(`/sprites/patterns/${name}.json`)
}

function setupBehavior(level: Level) {
  level.events.listen(LevelTimer.EVENT_TIMER_OK, () => {
    level.music.playTheme()
  })
  level.events.listen(LevelTimer.EVENT_TIMER_HURRY, () => {
    level.music.playHurryTheme()
  })
}

function setupBackgrounds(levelSpec: LevelSpec, level: Level, patterns: PatternSpec) {
  levelSpec.layers.forEach((layer) => {
    const grid = createGrid(layer.tiles, patterns)
    level.tileCollider.addGrid(grid)
  })
}

function setupCamera(level: Level) {
  let maxX = 0
  let maxTileSize = 0
  for (const resolver of level.tileCollider.resolvers) {
    if (resolver.tileSize > maxTileSize) {
      maxTileSize = resolver.tileSize
    }
    resolver.matrix.forEach((_tile, x) => {
      if (x > maxX) {
        maxX = x
      }
    })
  }
  level.camera.max.x = (maxX + 1) * maxTileSize
}

function setupCheckpoints(levelSpec: LevelSpec, level: Level) {
  if (!levelSpec.checkpoints) {
    level.checkpoints.push(new Vec2(0, 0))
    return
  }

  levelSpec.checkpoints.forEach(([x, y]) => {
    level.checkpoints.push(new Vec2(x, y))
  })
}

function setupEntities(levelSpec: LevelSpec, level: Level, entityFactory: EntityFactory) {
  const spawner = createSpawner()
  levelSpec.entities.forEach(({ id, name, pos: [x, y], props }) => {
    const createEntity = entityFactory[name]
    if (!createEntity) {
      throw new Error(`No entity ${name}`)
    }

    const entity = createEntity(props)
    entity.pos.set(x, y)

    if (id) {
      entity.id = id
      level.entities.add(entity)
    } else {
      spawner.addEntity(entity)
    }
  })

  const entityProxy = new Entity()
  entityProxy.addTrait(spawner)
  level.entities.add(entityProxy)
}

function setupTriggers(levelSpec: LevelSpec, level: Level, levelName: string) {
  // 本项目新增：个别关卡的上游遗留触发器由补丁表禁用（见 `levelPatches.ts`
  // 的 `disableUpstreamTriggers`——上游时代的关卡出口替身，与本项目推进表冲突）。
  if (patchFor(levelName).disableUpstreamTriggers) {
    return
  }

  if (!levelSpec.triggers) {
    return
  }

  for (const triggerSpec of levelSpec.triggers) {
    const trigger = new Trigger()

    trigger.conditions.push((entity, touches, _gc, lvl) => {
      lvl.events.emit(Level.EVENT_TRIGGER, triggerSpec, entity, touches)
    })

    const entity = new Entity()
    entity.addTrait(trigger)
    entity.size.set(64, 64)
    entity.pos.set(triggerSpec.pos[0], triggerSpec.pos[1])
    level.entities.add(entity)
  }
}

export function createLevelLoader(entityFactory: EntityFactory) {
  return function loadLevel(name: string): Promise<Level> {
    return loadJSON<LevelSpec>(`/levels/${name}.json`)
      .then((levelSpec) =>
        Promise.all([
          levelSpec,
          loadSpriteSheet(levelSpec.spriteSheet),
          loadMusicSheet(levelSpec.musicSheet),
          loadPattern(levelSpec.patternSheet),
        ]),
      )
      .then(([levelSpec, backgroundSprites, musicPlayer, patterns]) => {
        const level = new Level()
        level.name = name
        level.music.setPlayer(musicPlayer as MusicPlayer)

        setupBackgrounds(levelSpec, level, patterns as PatternSpec)
        setupEntities(levelSpec, level, entityFactory)
        setupTriggers(levelSpec, level, name)
        setupCheckpoints(levelSpec, level)

        setupBehavior(level)
        setupCamera(level)

        for (const resolver of level.tileCollider.resolvers) {
          const backgroundLayer = createBackgroundLayer(
            level,
            resolver.matrix,
            backgroundSprites as SpriteSheet,
          )
          level.comp.layers.push(backgroundLayer)
        }

        // 上游写法是 `splice(layers.length - 1, 0, spriteLayer)`，即把角色层插到
        // **最后一层背景之前**。1-1 有两个背景层（地形层 + 装饰层），于是装饰层
        // （云/灌木/山丘/管道/旗杆）被画在角色之上——出生点 (40,192) 正压在大山丘上，
        // 导致开局完全看不到 Mario。
        // 这里改为追加，让角色始终位于所有背景层之上。
        const spriteLayer = createSpriteLayer(level.entities)
        level.comp.layers.push(spriteLayer)

        // 本项目新增：让各特性模块在关卡就绪后注入实体 / 触发 / 渲染层。
        // 放在 spriteLayer 之后，特性追加的层会盖在角色之上（旗子、弹出金币等）。
        applyLevelFeatures(level, {
          name,
          grids: level.tileCollider.resolvers.map((r) => ({
            matrix: r.matrix,
            tileSize: r.tileSize,
          })),
          sprites: backgroundSprites as SpriteSheet,
          spec: levelSpec,
          entityFactory,
        })

        return level
      })
  }
}

function createGrid(tiles: LayerTileSpec[], patterns: PatternSpec) {
  const grid = new Matrix<Tile>()

  for (const { tile, x, y } of expandTiles(tiles, patterns)) {
    grid.set(x, y, tile)
  }

  return grid
}

function* expandSpan(xStart: number, xLen: number, yStart: number, yLen: number) {
  const xEnd = xStart + xLen
  const yEnd = yStart + yLen
  for (let x = xStart; x < xEnd; ++x) {
    for (let y = yStart; y < yEnd; ++y) {
      yield { x, y }
    }
  }
}

function expandRange(range: TileRange): Generator<{ x: number; y: number }> {
  if (range.length === 4) {
    const [xStart, xLen, yStart, yLen] = range
    return expandSpan(xStart, xLen, yStart, yLen)
  } else if (range.length === 3) {
    const [xStart, xLen, yStart] = range
    return expandSpan(xStart, xLen, yStart, 1)
  } else if (range.length === 2) {
    const [xStart, yStart] = range
    return expandSpan(xStart, 1, yStart, 1)
  }
  return expandSpan(0, 0, 0, 0)
}

function* expandRanges(ranges: TileRange[]) {
  for (const range of ranges) {
    yield* expandRange(range)
  }
}

function* expandTiles(
  tiles: LayerTileSpec[],
  patterns: PatternSpec,
): Generator<{ tile: Tile; x: number; y: number }> {
  function* walkTiles(
    tileList: LayerTileSpec[],
    offsetX: number,
    offsetY: number,
  ): Generator<{ tile: Tile; x: number; y: number }> {
    for (const tile of tileList) {
      for (const { x, y } of expandRanges(tile.ranges)) {
        const derivedX = x + offsetX
        const derivedY = y + offsetY

        if (tile.pattern) {
          const subTiles = patterns[tile.pattern].tiles
          yield* walkTiles(subTiles, derivedX, derivedY)
        } else {
          yield {
            tile: tile as unknown as Tile,
            x: derivedX,
            y: derivedY,
          }
        }
      }
    }
  }

  yield* walkTiles(tiles, 0, 0)
}
