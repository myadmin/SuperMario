/**
 * TileCollider.ts — ported verbatim from upstream `public/js/TileCollider.js`.
 *
 * Each grid layer becomes a TileResolver. checkX/checkY sweep the tile range
 * the entity's leading edge crosses and dispatch to the behaviour handler
 * registered for `tile.behavior`.
 */
import TileResolver, { type Match } from './TileResolver'
import type { Matrix } from './math'
import { brick } from './tiles/brick'
import { coin } from './tiles/coin'
import { ground } from './tiles/ground'
import type Entity from './Entity'
import type GameContext from './GameContext'
import type Level from './Level'

export type TileCollisionContext = {
  entity: Entity
  match: Match
  resolver: TileResolver
  gameContext: GameContext
  level: Level
}

type Handler = (context: TileCollisionContext) => void
type HandlerPair = Handler[]

/** 内建行为：与上游 `public/js/TileCollider.js` 的 handlers 表完全一致。 */
const handlers: Record<string, HandlerPair> = {
  brick,
  coin,
  ground,
}

/**
 * 注册额外的瓦片行为（本项目新增，上游没有）。
 * 让新行为写在各自的特性模块里，避免多个模块同时改这张表。
 */
export function registerTileBehavior(name: string, pair: HandlerPair) {
  if (handlers[name]) {
    throw new Error(`tile behavior "${name}" is already registered`)
  }
  handlers[name] = pair
}

/** 查询已注册的行为名（供校验与调试使用）。 */
export function registeredTileBehaviors(): string[] {
  return Object.keys(handlers)
}

export default class TileCollider {
  resolvers: TileResolver[] = []

  addGrid(tileMatrix: Matrix<any>) {
    this.resolvers.push(new TileResolver(tileMatrix))
  }

  /**
   * 注意（本项目记录，非上游行为）：下面两个方法会把这个方向上**同一行/同一列里重叠的
   * 每一格瓦片**都交给处理器，而处理器（`tiles/ground.ts` 等）是**逐格重新读
   * `entity.vel.x` / `entity.vel.y`** 来决定「撞哪一面」的。所以**扫描期间把速度翻转
   * 方向会污染后面的格子**：第二格会把「刚落地」看成「顶天花板」并反向贴面，把实体瞬移
   * 进瓦片内部。火球曾因此楔进地面/砖墙（见 `entities/Fireball.ts` 的 `landed` 注释）。
   * 新写「会反弹」的实体时，请把反弹速度放到自己的 `update` 里赋值，不要写在 `obstruct` 里。
   */
  checkX(entity: Entity, gameContext: GameContext, level: Level) {
    let x: number
    if (entity.vel.x > 0) {
      x = entity.bounds.right
    } else if (entity.vel.x < 0) {
      x = entity.bounds.left
    } else {
      return
    }

    for (const resolver of this.resolvers) {
      const matches = resolver.searchByRange(x, x, entity.bounds.top, entity.bounds.bottom)

      matches.forEach((match) => {
        this.handle(0, entity, match, resolver, gameContext, level)
      })
    }
  }

  /** 见 `checkX` 上方的注意事项（同一个陷阱）。 */
  checkY(entity: Entity, gameContext: GameContext, level: Level) {
    let y: number
    if (entity.vel.y > 0) {
      y = entity.bounds.bottom
    } else if (entity.vel.y < 0) {
      y = entity.bounds.top
    } else {
      return
    }

    for (const resolver of this.resolvers) {
      const matches = resolver.searchByRange(entity.bounds.left, entity.bounds.right, y, y)

      matches.forEach((match) => {
        this.handle(1, entity, match, resolver, gameContext, level)
      })
    }
  }

  handle(
    index: 0 | 1,
    entity: Entity,
    match: Match,
    resolver: TileResolver,
    gameContext: GameContext,
    level: Level,
  ) {
    const tileCollisionContext: TileCollisionContext = {
      entity,
      match,
      resolver,
      gameContext,
      level,
    }

    const handler = handlers[match.tile.behavior as string]
    if (handler) {
      const fn = handler[index]
      if (fn) {
        fn(tileCollisionContext)
      }
    }
  }
}
