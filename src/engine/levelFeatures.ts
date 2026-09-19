/**
 * levelFeatures.ts —— 关卡「特性」扩展点（本项目新增）
 *
 * 背景：上游的关卡数据全部来自 `public/levels/*.json`，而本项目的约定是
 * **不修改 `public/` 下的任何文件**。因此「旗杆实体」「城堡通关触发」「可顶的问号块」
 * 这类上游没有的功能，不能靠改关卡 JSON 来加，只能由代码在关卡加载完成后注入。
 *
 * 做法：每个特性模块调用 `registerLevelFeature()` 注册自己；`loaders/level.ts`
 * 在网格、实体、层都就绪之后调用 `applyLevelFeatures()`。特性可以：
 *   - 扫描网格找特定 tile（`findTiles` / `findFirstTile`），据此确定坐标
 *   - 往 `level.entities` 注入实体
 *   - 监听 `level.events`
 *   - 往 `level.comp.layers` 追加渲染层
 *
 * 这样每个特性各占一个文件，互不冲突。
 */
import type Level from './Level'
import type { Matrix } from './math'
import type { Tile } from './TileResolver'
import type SpriteSheet from './SpriteSheet'
import type { EntityFactory } from './GameContext'
import type { LevelSpec } from './loaders/level'

export type LevelGrid = { matrix: Matrix<Tile>; tileSize: number }

export type LevelFeatureContext = {
  /** 关卡名，例如 `1-1` */
  name: string
  /** 该关卡的全部瓦片网格（与 tileCollider.resolvers 一一对应） */
  grids: LevelGrid[]
  /** 该关卡的背景精灵表 */
  sprites: SpriteSheet
  /** 该关卡的原始 JSON 规格 */
  spec: LevelSpec
  /**
   * 实体工厂（与 `setupEntities()` 用的是同一份）。
   * 上游只有「关卡 JSON 里写了 name」才能造实体，本项目不改 `public/`，所以特性
   * 需要用上游实体（管道传送门等）时从这里取工厂自己造，例如 `pipe-portal`。
   */
  entityFactory: EntityFactory
}

export type LevelFeature = {
  name: string
  setup(level: Level, ctx: LevelFeatureContext): void
}

const features: LevelFeature[] = []

export function registerLevelFeature(feature: LevelFeature) {
  features.push(feature)
}

export function registeredLevelFeatures(): string[] {
  return features.map((f) => f.name)
}

/** 由 `loaders/level.ts` 在关卡构建完成后调用。 */
export function applyLevelFeatures(level: Level, ctx: LevelFeatureContext) {
  for (const feature of features) {
    feature.setup(level, ctx)
  }
}

export type FoundTile = {
  /** 世界像素坐标（格子左上角） */
  x: number
  y: number
  indexX: number
  indexY: number
}

/** 扫描所有网格，返回 `style` 匹配的格子。 */
export function findTiles(grids: LevelGrid[], style: string): FoundTile[] {
  const found: FoundTile[] = []
  for (const grid of grids) {
    grid.matrix.forEach((tile, indexX, indexY) => {
      if (tile && (tile as Tile).style === style) {
        found.push({
          x: indexX * grid.tileSize,
          y: indexY * grid.tileSize,
          indexX,
          indexY,
        })
      }
    })
  }
  return found
}

/** 扫描所有网格，返回第一个 `style` 匹配的格子（按列优先，即最靠左的）。 */
export function findFirstTile(grids: LevelGrid[], style: string): FoundTile | undefined {
  return findTiles(grids, style).sort((a, b) => a.indexX - b.indexX || a.indexY - b.indexY)[0]
}
