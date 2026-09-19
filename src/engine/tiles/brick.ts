/**
 * tiles/brick.ts — ported from upstream `public/js/tiles/brick.js`.
 *
 * 上游只有小马里奥，顶砖一律「整块消失 + 四片碎片」。有了道具系统之后这条不再成立，
 * 本项目按原版 SMB 补齐三段规则：
 *
 *   1. **只有大 / 火力马里奥能把普通砖顶碎**（碎片与上游一致）；小马里奥顶上去砖块
 *      只弹一下（`bumpTile` 上弹动画 + `brick-bump` 音效），砖块保留；
 *   2. **内容砖**（`blockContents.ts` 登记的多金币砖 / 星块，见 `levelPatches.ts` 的
 *      `bricks`）：谁顶都出货、顶完换成已使用的实心块，**永远不碎**——原版里装东西
 *      的砖是不可破坏的；
 *   3. **无论弹还是出货**，站在砖上面的敌人都会被打翻（`killEnemiesAbove`，原版规则）。
 *
 * 逐格新对象的说明（与 `features/chanceBlock.ts` 的 `consumeBlock` 同一个坑）：
 * `loaders/level.ts` 的 `expandTiles` 对同一段 range 的所有格子复用同一个 tile 对象，
 * 所以弹跳 / 换装前必须往网格写入一个**本格专属的新对象**，否则上弹会连坐整段砖。
 */
import { Vec2 } from '../math'
import { Sides } from '../Entity'
import type Entity from '../Entity'
import Player from '../traits/Player'
import PowerState from '../traits/PowerState'
import { BRICK_BUMP_SOUND } from '../fxSounds'
import { bumpTile } from '../layers/background'
import { createStarmanEntity } from '../entities/Starman'
import { POWER_UP_APPEARS_SOUND } from '../fxSounds'
import {
  USED_BLOCK_STYLE,
  getBrickContent,
  consumeBrickEntry,
  popCoin,
  killEnemiesAbove,
} from '../blockContents'
import type { Match } from '../TileResolver'
import type { TileCollisionContext } from '../TileCollider'
import type GameContext from '../GameContext'
import type Level from '../Level'
import type TileResolver from '../TileResolver'

/** 多金币砖能顶出的金币数（原版 SMB 是 10 枚，顶完变已使用块）。 */
const MULTI_COIN_COUNT = 10

function centerEntity(entity: Entity, pos: Vec2) {
  entity.pos.x = pos.x - entity.size.x / 2
  entity.pos.y = pos.y - entity.size.y / 2
}

function getMatchCenter(match: Match) {
  return new Vec2(match.x1 + (match.x2 - match.x1) / 2, match.y1 + (match.y2 - match.y1) / 2)
}

function addShrapnel(level: Level, gameContext: GameContext, match: Match) {
  const center = getMatchCenter(match)

  const bricks: Entity[] = []
  for (let i = 0; i < 4; i++) {
    const brick = gameContext.entityFactory.brickShrapnel()
    centerEntity(brick, center)
    level.entities.add(brick)
    bricks.push(brick)
  }

  const spreadH = 60
  const spreadV = 400
  bricks[0].sounds.add('break')
  bricks[0].vel.set(-spreadH, -spreadV * 1.2)
  bricks[1].vel.set(-spreadH, -spreadV)
  bricks[2].vel.set(spreadH, -spreadV * 1.2)
  bricks[3].vel.set(spreadH, -spreadV)
}

function handleX({ entity, match }: TileCollisionContext) {
  if (entity.vel.x > 0) {
    if (entity.bounds.right > match.x1) {
      entity.obstruct(Sides.RIGHT, match)
    }
  } else if (entity.vel.x < 0) {
    if (entity.bounds.left < match.x2) {
      entity.obstruct(Sides.LEFT, match)
    }
  }
}

/**
 * 玩家从下方顶到砖。三种结局：出货（内容砖）/ 弹一下（小马里奥）/ 碎掉（大马里奥）。
 * 只处理出货与表现，实心碰撞（`obstruct(TOP)`）由 `handleY` 统一处理。
 */
function bumpBrick(
  entity: Entity,
  match: Match,
  resolver: TileResolver,
  gameContext: GameContext,
  level: Level,
) {
  const player = entity.getTrait(Player)
  const power = entity.traits.get(PowerState) as PowerState | undefined
  const entry = getBrickContent(match.indexX, match.indexY)

  if (entry) {
    // ---- 内容砖：出货，永远不碎 ----
    killEnemiesAbove(level, match)

    if (entry.content === 'coins10') {
      popCoin(level, match, player)
      entry.hits += 1
      if (entry.hits >= MULTI_COIN_COUNT) {
        // 顶满了：变已使用块，从内容表里注销。
        const consumed = { ...match.tile, style: USED_BLOCK_STYLE, behavior: 'ground', hidden: false }
        resolver.matrix.set(match.indexX, match.indexY, consumed)
        bumpTile(match.indexX, match.indexY, consumed)
        consumeBrickEntry(match.indexX, match.indexY)
      } else {
        // 还没顶满：砖保持砖的外观，但要写入本格专属对象再上弹
        // （防 expandTiles 的 range 连坐，见文件头说明）。
        const clone = { ...match.tile }
        resolver.matrix.set(match.indexX, match.indexY, clone)
        bumpTile(match.indexX, match.indexY, clone)
      }
      return
    }

    // star：一枚无敌星从砖里弹出来（原版：星砖谁顶都出星，砖变已使用块）。
    const consumed = { ...match.tile, style: USED_BLOCK_STYLE, behavior: 'ground', hidden: false }
    resolver.matrix.set(match.indexX, match.indexY, consumed)
    bumpTile(match.indexX, match.indexY, consumed)
    consumeBrickEntry(match.indexX, match.indexY)
    level.entities.add(createStarmanEntity(match.x1, match.y1))
    entity.sounds.add(POWER_UP_APPEARS_SOUND)
    return
  }

  if (!power || !power.large) {
    // ---- 小马里奥（或没挂 PowerState 的异常情况）：弹一下，砖保留 ----
    const clone = { ...match.tile }
    resolver.matrix.set(match.indexX, match.indexY, clone)
    bumpTile(match.indexX, match.indexY, clone)
    killEnemiesAbove(level, match)
    entity.sounds.add(BRICK_BUMP_SOUND)
    return
  }

  // ---- 大 / 火力马里奥：碎砖（上游行为原样）----
  const grid = resolver.matrix
  grid.delete(match.indexX, match.indexY)
  addShrapnel(level, gameContext, match)
}

function handleY({ entity, match, resolver, gameContext, level }: TileCollisionContext) {
  if (entity.vel.y > 0) {
    if (entity.bounds.bottom > match.y1) {
      entity.obstruct(Sides.BOTTOM, match)
    }
  } else if (entity.vel.y < 0) {
    if (entity.bounds.top < match.y2) {
      if (entity.traits.has(Player)) {
        bumpBrick(entity, match, resolver, gameContext, level)
      }

      if (entity.bounds.top < match.y2) {
        entity.obstruct(Sides.TOP, match)
      }
    }
  }
}

export const brick = [handleX, handleY]
