/**
 * 特性：可顶的方块 —— 问号块（chance）与隐藏块（hidden）
 *
 * **问号块**：上游把 `chance-*` 的 behavior 写成 `ground`，所以问号块只是实心块，
 * 顶上去毫无反应。本模块负责：注册 `chance` 瓦片行为，被玩家从下方顶到时给出反馈
 * （方块上弹 + 弹出金币 + 金币计数 +1），并把顶过的方块换成「已使用」的实心块。
 * 其中**装道具的那几枚**出什么由马里奥当时的状态决定：
 * **小 → 变大蘑菇，大 / 火力 → 火花**（原版规则，见 `powerUp`）；其余问号块出金币。
 * 上游关卡 JSON 里没有「方块内容」字段（所有 `chance` 的 behavior 都是 `ground`），
 * 哪个方块装什么只能由代码自己定，详见 README「问号块里出什么」。
 *
 * **方块内容表已经搬去 `engine/levelPatches.ts`**（`powerUpBlocks` / `hiddenBlocks`）：
 * 本模块只负责「怎么顶、出什么实体」，不再自己带关卡数据。
 *
 * **隐藏块**（本项目新增）：原版 SMB 里「看不见但实心、从下方顶开才现身」的方块。
 * 关卡数据里同样没有「隐藏」这个字段——上游把原版的隐藏块按它的底层瓦片存了下来，
 * 就是 `style: "metal"`（`tiles.png` 的实心块，也正是本项目「已使用方块」的外观，
 * 所以现身之后看起来和顶过的问号块完全一样）。1-1 第 64 列第 8 行那枚孤零零的
 * `metal` 就是原版的隐藏 1-UP 块（位置与 NES 版一致，用户早年那版实现的注释里
 * 就直接写着 `Hidden 1-UP Block (at col 64, row 8)`），因此这里的规则是：
 * **关卡数据里每个 `metal` 瓦片都是隐藏块**。顶出来的是什么同样没有记录，只能按
 * 「关卡名 + 格子坐标」补一张表（现在在 `levelPatches.ts` 的 `hiddenBlocks`），
 * 表里没有的一律出金币（原版的隐藏块绝大多数也是金币）。
 *
 * 由 Agent A 实现；「无限顶」的修复见 `consumeChanceBlock`。
 */
import { registerLevelFeature } from '../levelFeatures'
import { registerTileBehavior, type TileCollisionContext } from '../TileCollider'
import { Sides } from '../Entity'
import Entity from '../Entity'
import Trait from '../Trait'
import Player from '../traits/Player'
import PowerState from '../traits/PowerState'
import { patchFor, type HiddenContent } from '../levelPatches'
import { advanceTileOffsets, bumpTile } from '../layers/background'
import { createMushroomEntity, createOneUpMushroomEntity } from '../entities/Mushroom'
import { createFireFlowerEntity } from '../entities/FireFlower'
import { POWER_UP_APPEARS_SOUND } from '../fxSounds'
import {
  USED_BLOCK_STYLE,
  setBrickContents,
  popCoin,
  killEnemiesAbove,
} from '../blockContents'
import type GameContext from '../GameContext'
import type Level from '../Level'
import type TileResolver from '../TileResolver'
import type { Tile } from '../TileResolver'

/**
 * 本项目新增：本关已被顶过的方块（`indexX,indexY`）。
 *
 * 换行为本身已能挡住重复触发（见 `consumeBlock`），但精灵表里万一没有
 * 实心块贴图，就只能保留外观、只换行为；出货只出一次这件事由这张表兜住。
 * 每次加载关卡清空。
 */
const consumedBlocks = new Set<string>()

/** 本项目新增：本关隐藏块的内容（`indexX,indexY` → 内容），每次加载关卡重建。 */
const hiddenContents = new Map<string, HiddenContent>()

/** 本项目新增：本关实际可用的「已使用」外观（精灵表里没有就退回 `undefined`）。 */
let usedBlockStyle: string | undefined

/** 本项目新增：本关装道具的问号块（`indexX,indexY`），每次加载关卡重建。 */
const powerupBlocks = new Set<string>()

/** 本项目新增：每帧推进问号块上弹位移的衰减，挂在代理实体上（参考 loaders/level.ts 的 Spawner）。 */
class TileBumpAnimator extends Trait {
  update(_entity: Entity, { deltaTime }: GameContext, _level: Level) {
    advanceTileOffsets(deltaTime)
  }
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
 * 本项目新增：把一个方块换成「已使用」状态。
 *
 * 关键点：`loaders/level.ts` 的 `expandTiles` 对**同一段 range 的所有格子复用同一个
 * tile 对象**（例如 1-1 的 `[129,2,5]` 就是两个连着的问号块），所以不能直接改
 * `match.tile.style`，否则会连坐同一段的其它格子。这里往网格里写入一个新对象，
 * 只影响被顶的这一格；`layers/background.ts` 每帧都从网格重新取 tile 绘制，
 * 于是外观（`style`）与行为（`behavior`）都会立刻改变。
 *
 * 行为改成 `ground` 后本处理器不再被触发——方块仍然实心，可以站、可以继续顶，
 * 但不出币也不再上弹，这就是原版「顶完变实心块」的语义。对隐藏块来说，
 * 这一步同时是「现身」：`hidden` 被清掉，背景层从下一帧起就会画它。
 */
function consumeBlock(match: TileCollisionContext['match'], resolver: TileResolver) {
  consumedBlocks.add(`${match.indexX},${match.indexY}`)

  // 上弹的参照物必须是**写进网格后的那个新对象**（`bumpTile` 只让同一个对象跟着上移，
  // 这样天空层里同格的那张瓦片就不会跟着动、也不会在原位留下透明洞）。
  const consumed: Tile = {
    ...match.tile,
    style: usedBlockStyle ?? match.tile.style,
    behavior: 'ground',
    hidden: false,
  }
  resolver.matrix.set(match.indexX, match.indexY, consumed)
  bumpTile(match.indexX, match.indexY, consumed)
}

/**
 * 本项目新增：装道具的问号块出什么 —— **小马里奥出蘑菇，大 / 火力出火花**。
 * 这是原版 SMB 的规则（同一个方块对大小马里奥给不同内容），`traits/PowerState` 是
 * 唯一的事实来源。
 */
function powerUpFor(entity: Entity) {
  const power = entity.getTrait(PowerState)
  return power.large ? 'flower' : 'mushroom'
}

function handleY({ entity, match, resolver, level }: TileCollisionContext) {
  if (entity.vel.y > 0) {
    if (entity.bounds.bottom > match.y1) {
      entity.obstruct(Sides.BOTTOM, match)
    }
  } else if (entity.vel.y < 0) {
    // 与 brick.ts 一致：只有从下方顶到、且头顶已经越过方块底边时才生效。
    if (entity.bounds.top < match.y2) {
      if (entity.traits.has(Player) && !consumedBlocks.has(`${match.indexX},${match.indexY}`)) {
        const player = entity.getTrait(Player)
        consumeBlock(match, resolver)
        // 原版规则：方块上弹的瞬间，站在上面的敌人被打翻。
        killEnemiesAbove(level, match)

        if (powerupBlocks.has(`${match.indexX},${match.indexY}`)) {
          // 装道具的方块：小马里奥出蘑菇、大 / 火力出火花。
          // 两者都自己负责钻出来、走路（火花原地不动）与被吃掉的奖励。
          if (powerUpFor(entity) === 'flower') {
            level.entities.add(createFireFlowerEntity(match.x1, match.y1))
          } else {
            level.entities.add(createMushroomEntity(match.x1, match.y1))
          }
          entity.sounds.add(POWER_UP_APPEARS_SOUND)
        } else {
          popCoin(level, match, player)
        }
      }

      // 问号块（以及用过之后的实心块）顶完还在，这里只让马里奥停住，不像 brick 那样删掉。
      entity.obstruct(Sides.TOP, match)
    }
  }
}

/**
 * 本项目新增：隐藏块的竖直处理。与问号块同构，唯一区别是顶上来的瞬间「现身」并
 * 按内容表出货——隐藏块在被顶开之前是看不见的，所以这是它第一次也是最后一次触发。
 */
function handleHiddenY({ entity, match, resolver, level }: TileCollisionContext) {
  if (entity.vel.y > 0) {
    if (entity.bounds.bottom > match.y1) {
      entity.obstruct(Sides.BOTTOM, match)
    }
  } else if (entity.vel.y < 0) {
    if (entity.bounds.top < match.y2) {
      if (entity.traits.has(Player) && !consumedBlocks.has(`${match.indexX},${match.indexY}`)) {
        const player = entity.getTrait(Player)
        const content = hiddenContents.get(`${match.indexX},${match.indexY}`) ?? 'coin'

        consumeBlock(match, resolver)
        // 原版规则：方块上弹的瞬间，站在上面的敌人被打翻。
        killEnemiesAbove(level, match)

        if (content === 'oneup') {
          // 原版的隐藏 1-UP 块：钻出一枚绿色加命蘑菇（吃掉加一条命，不加分）。
          level.entities.add(createOneUpMushroomEntity(match.x1, match.y1))
        } else {
          popCoin(level, match, player)
        }
      }

      entity.obstruct(Sides.TOP, match)
    }
  }
}

registerTileBehavior('chance', [handleX, handleY])
registerTileBehavior('hidden', [handleX, handleHiddenY])

registerLevelFeature({
  name: 'chance-block',
  setup(level, ctx) {
    // 跨关卡共享，换关时清空（否则上一关的坐标会挡住新关卡同位置的方块）。
    consumedBlocks.clear()
    hiddenContents.clear()
    powerupBlocks.clear()

    // 三张含 `chance` 的精灵表都定义了 `metal`；这里只做防御，缺贴图就不换外观。
    usedBlockStyle = ctx.sprites.tiles.has(USED_BLOCK_STYLE) ? USED_BLOCK_STYLE : undefined

    // 本关隐藏块的内容表（缺省出金币）与装道具的问号块坐标，都来自关卡补丁表
    // （`engine/levelPatches.ts`；从前是本文件顶层的两张 `Record<关卡名, …>`）。
    const patch = patchFor(ctx.name)
    for (const entry of patch.hiddenBlocks ?? []) {
      hiddenContents.set(`${entry.x},${entry.y}`, entry.content)
    }
    for (const entry of patch.powerUpBlocks ?? []) {
      powerupBlocks.add(`${entry.x},${entry.y}`)
    }
    // 内容砖（多金币砖 / 星块）也来自补丁表；弹金币要用的精灵表一并注入。
    setBrickContents(patch.bricks ?? [], ctx.sprites)

    // 上游把 chance 的 behavior 写成 ground，这里就地改成 chance（只改内存对象，不动 JSON）；
    // 同时把关卡数据里的 `metal` 瓦片认成隐藏块。
    for (const grid of ctx.grids) {
      grid.matrix.forEach((tile, indexX, indexY) => {
        if (!tile) {
          return
        }

        if (tile.style === 'chance') {
          tile.behavior = 'chance'
          return
        }

        if (tile.style !== USED_BLOCK_STYLE) {
          return
        }

        // 隐藏块：换成一个新对象，避免连坐同一段 range 的其它格子（见 `consumeBlock`）。
        // 行为换成 `hidden` 后仍然实心（`handleX` / `handleHiddenY`），只是默认不画。
        grid.matrix.set(indexX, indexY, { ...tile, behavior: 'hidden', hidden: true })
      })
    }

    const animator = new Entity()
    animator.addTrait(new TileBumpAnimator())
    level.entities.add(animator)
  },
})
