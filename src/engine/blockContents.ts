/**
 * blockContents.ts —— 本项目新增：可顶方块的三件共用小事。
 *
 * 「顶块」这套交互（问号块 / 隐藏块 / 内容砖）需要几段共享逻辑，收拢在这个叶子模块里，
 * 供 `features/chanceBlock.ts` 与 `tiles/brick.ts` 使用（放在这里而不是 features/ 里，
 * 是因为 tiles/ 不能反向依赖 features/，否则会形成 TileCollider → tiles → features →
 * TileCollider 的循环导入）：
 *
 *   1. **内容砖登记表**：哪几格砖块里有东西（多金币砖 / 星块）。数据在
 *      `levelPatches.ts` 的 `bricks`（出处与坐标依据见那里的注释），由
 *      `features/chanceBlock.ts` 在关卡加载时灌进来；
 *   2. **弹金币**：从方块里弹出一枚抛物线金币（问号块与多金币砖共用同一条视觉）；
 *   3. **弹飞上面的敌人**：原版规则——方块被顶起的瞬间，站在它上面的敌人被打翻
 *      （`traits/Flipped` 的 `flipKill`），问号块 / 隐藏块 / 砖块通用。
 */
import Entity from './Entity'
import Trait from './Trait'
import LifeLimit from './traits/LifeLimit'
import Killable from './traits/Killable'
import Player from './traits/Player'
import { flipKill } from './traits/Flipped'
import type { Match } from './TileResolver'
import type SpriteSheet from './SpriteSheet'
import type GameContext from './GameContext'
import type Level from './Level'

/**
 * 「已使用」方块的外观，同时也是关卡数据里隐藏块的样式（`style: "metal"`）。
 * 三张含 `chance` 的精灵表（overworld / underworld / castle）都定义了它，
 * 顶完 / 内容取完换过去不需要新增素材。
 */
export const USED_BLOCK_STYLE = 'metal'

/** 内容砖里能装的东西。 */
export type BrickContent = 'coins10' | 'star'

type BrickEntry = {
  content: BrickContent
  /** 多金币砖已经顶出的金币数（10 枚后变已使用块）。 */
  hits: number
}

/** 本关的内容砖（`indexX,indexY` → 条目），每次加载关卡由 `setBrickContents` 重建。 */
const brickEntries = new Map<string, BrickEntry>()

/** 弹出金币要用的关卡精灵表（`coin` 动画定义在里面），随内容表一起注入。 */
let coinSprites: SpriteSheet | undefined

/**
 * 灌入本关的内容砖（每次加载关卡调用一次，覆盖上一关的表）。
 * `sprites` 是本关的背景精灵表，弹金币要用它画 `coin` 动画。
 */
export function setBrickContents(
  entries: Array<{ x: number; y: number; content: BrickContent }>,
  sprites: SpriteSheet | undefined,
) {
  brickEntries.clear()
  for (const entry of entries) {
    brickEntries.set(`${entry.x},${entry.y}`, { content: entry.content, hits: 0 })
  }
  coinSprites = sprites
}

/** 查某格砖块的内容（没有就返回 undefined —— 普通砖）。 */
export function getBrickContent(indexX: number, indexY: number): BrickEntry | undefined {
  return brickEntries.get(`${indexX},${indexY}`)
}

/** 内容取完（多金币砖顶满 / 星块已出），从表里移除。 */
export function consumeBrickEntry(indexX: number, indexY: number) {
  brickEntries.delete(`${indexX},${indexY}`)
}

// ---------------------------------------------------------------- 弹金币

/** 弹出金币的生命周期（秒）与上抛高度（像素）。 */
const COIN_LIFE = 0.6
const COIN_RISE = 40

/**
 * 弹出金币「上抛再落回」的位移：用 `lifetime` 算一条抛物线
 * （0 与 COIN_LIFE 处为 0，中点最高），不依赖关卡重力。
 */
class CoinPop extends Trait {
  startY = 0

  update(entity: Entity, _gameContext: GameContext, _level: Level) {
    const progress = entity.lifetime / COIN_LIFE
    entity.pos.y = this.startY - COIN_RISE * 4 * progress * (1 - progress)
  }
}

/** 一枚从方块里弹出的金币（临时实体，参考 BrickShrapnel 的写法）。 */
function createCoinEntity(sprites: SpriteSheet, x: number, y: number) {
  const entity = new Entity()
  entity.size.set(16, 16)
  entity.pos.set(x, y)

  const pop = new CoinPop()
  pop.startY = y
  entity.addTrait(pop)

  const life = new LifeLimit()
  life.time = COIN_LIFE
  entity.addTrait(life)

  entity.draw = (context) => {
    sprites.drawAnim('coin', context, 0, 0, entity.lifetime)
  }
  return entity
}

/**
 * 顶出一枚金币：弹金币实体 + 金币计数 +1 + 分数 +200（原版数值）。
 * 问号块（`features/chanceBlock.ts`）与多金币砖（`tiles/brick.ts`）共用。
 */
export function popCoin(level: Level, match: Match, player: Player) {
  if (coinSprites) {
    level.entities.add(createCoinEntity(coinSprites, match.x1, match.y1))
  }
  player.addCoins(1)
  player.score += 200
  player.pushScorePopup(match.x1 + 8, match.y1 - 8, '200')
}

// ---------------------------------------------------------------- 弹飞上面的敌人

/**
 * 方块被顶起的瞬间，把**正好站在它上面**的敌人打翻（原版 SMB 规则）。
 * 「站在上面」= 包围盒底边贴着方块顶边（±3px 容差），且水平方向与方块重叠。
 * 只对「能被打死的实体」生效：有 `Killable`、`removeAfter > 0`、还没死——
 * 也就是敌人；道具（removeAfter = 0）与马里奥（玩家）都被排除。
 */
export function killEnemiesAbove(level: Level, match: Match) {
  for (const entity of level.entities) {
    if (entity.traits.has(Player)) {
      continue
    }

    const killable = entity.traits.get(Killable) as Killable | undefined
    if (!killable || killable.removeAfter <= 0 || killable.killed || killable.dead) {
      continue
    }

    if (Math.abs(entity.bounds.bottom - match.y1) > 3) {
      continue
    }

    if (entity.bounds.right <= match.x1 || entity.bounds.left >= match.x2) {
      continue
    }

    flipKill(entity)
  }
}
