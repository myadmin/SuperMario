/**
 * 特性：隐藏金币奖励室的进 / 出管道（1-1 ↔ coin-room-1）
 *
 * 背景：public/levels/ 下一直躺着一排地下金币奖励关（coin-room-1..5），但正常流程
 * 没有任何管道通向它们——「哪根水管能进、通向哪」这层信息没进关卡 JSON（JSON 里
 * 只有瓦片），上游移植时又没补 portal 实体，于是这些关成了永远到不了的房间。
 *
 * 权威出处（用户早年实现的 _backup/js/level.js，与真实 SMB 1-1 布局一致）：
 *   - 1-1 第 57 列那根 4 格高的水管可进入：`placePipe(57, 4, true, '1-1-sub', 40, 160)`；
 *   - 1-1 第 163 列那根 2 格高的水管是从奖励室回来的出口：`placePipe(163, 2)`；
 *   - 除这两处外，_backup 里其余 canEnter 管道只有两类：奖励室自己的返程管
 *     （build1_1_sub 的 tx 34/35 → 1-1 第 163 列，本特性靠 coin-room-1 JSON 里
 *     现成的 portal 接上）与 1-2 结尾横管去 1-3（本项目已由 exitPipe + 推进表
 *     走 uw-exit 接管，不在此重复接）。
 *
 * 接线方式完全对照上游自己的权威样例 public/levels/debug-pipe.json：入口 portal 挂
 * `goesTo`（进 coin-room-1）+ `backTo`（本关出口实体的 id），出口 portal 只挂 `id`
 * （dir UP）。整条链路（game.ts 的 EVENT_PIPE_COMPLETE 处理器）：
 *   1. 站上第 57 列管口按 ↓ → 传进 coin-room-1（bootstrapPlayer 把马里奥放到它的
 *      检查点 [24,48]，从天花板坠入房间，同原版）；
 *   2. 走进奖励室的横管口（JSON 里现成的 RIGHT portal，**不带 goesTo**）→ 走完管程
 *      后被转成 coin-room-1 的 EVENT_COMPLETE → 触发来时 backTo 登记的返程监听；
 *   3. 重载 1-1 并 connectEntity('bonus-exit-1-1')，马里奥从第 163 列管口向上钻出，
 *      站回管口顶。
 * 注意：奖励室那头的 portal **不能**补 goesTo——带了会在走完管程时直接切回 1-1 的
 * 出生检查点（bootstrapPlayer 重摆坐标），「钻管回 1-1」永远不发生，而且 backTo 的
 * 返程监听会在 1-1 里找一个不存在的实体 id（connectEntity(undefined) 崩溃）。
 *
 * 门户盒的尺寸 / 落点推导写在 levelPatches 的每条数据旁（`Pipe.collides` 对竖直方向
 * 要求马里奥左右边都落在门户内，对横向要求上下边都落在门户内——两处门户分别按这个
 * 约束 + 「小 / 大马里奥站在管口上都得重叠」算出来）。
 */
import { registerLevelFeature } from '../levelFeatures'
import type { LevelGrid, FoundTile } from '../levelFeatures'
import { patchFor } from '../levelPatches'
import type { BonusPipePatch, BlockCell } from '../levelPatches'
import { connectEntity } from '../traits/Pipe'
import { findPlayers } from '../player'
import Entity from '../Entity'
import Trait from '../Trait'
import type { EntityFactory } from '../GameContext'
import type GameContext from '../GameContext'
import type Level from '../Level'

/**
 * 上游 `setupEntities()` 对没有 id 的实体不直接放进 level.entities，而是押在一个
 * Spawner 特性里（相机靠近才放出）。特性运行时关卡还没跑过一帧，coin-room-1 那个
 * 现成的返程 portal（JSON 里没有 id）此刻正押在押运名单里——校正和防重入都得把
 * 押运名单翻出来才找得到它。Spawner 类型没有导出，按「带 entities 数组的 trait」
 * 识别（全工程只有 loaders/level.ts 的 Spawner 长这样）。
 */
function* deferredEntities(level: Level): Generator<Entity> {
  for (const proxy of level.entities) {
    for (const trait of proxy.traits.values()) {
      const stash = (trait as { entities?: Entity[] }).entities
      if (Array.isArray(stash)) {
        yield* stash
      }
    }
  }
}

/**
 * 找离 (x, y) 足够近的现成 pipe-portal（含押运中的）。容差与 exitPipe.hasPortal
 * 一致（32 / 48）；只认带 props.dir 的实体——那是 pipe-portal 工厂的标志。
 */
function findPortalNear(level: Level, x: number, y: number): Entity | undefined {
  const sources: Iterable<Entity>[] = [level.entities, deferredEntities(level)]
  for (const source of sources) {
    for (const entity of source) {
      if (!entity.props || entity.props.dir === undefined) {
        continue
      }
      if (Math.abs(entity.pos.x - x) < 32 && Math.abs(entity.pos.y - y) < 48) {
        return entity
      }
    }
  }
  return undefined
}

/** 按补丁表给的网格坐标找管口瓦片，换算成像素（用命中网格自己的 tileSize）。 */
function findMouthTile(grids: LevelGrid[], cell: BlockCell): FoundTile | undefined {
  for (const grid of grids) {
    if (grid.matrix.get(cell.x, cell.y)) {
      return { x: cell.x * grid.tileSize, y: cell.y * grid.tileSize, indexX: cell.x, indexY: cell.y }
    }
  }
  return undefined
}

/** 按补丁声明注入一根管道的 portal（props 形状与 debug-pipe.json 一致）。 */
function injectPortal(level: Level, entityFactory: EntityFactory, tile: FoundTile, spec: BonusPipePatch) {
  const create = entityFactory['pipe-portal']
  if (!create) {
    return
  }

  const props: Record<string, unknown> = { dir: spec.dir }
  if (spec.goesTo) {
    props.goesTo = { name: spec.goesTo }
  }
  if (spec.backTo) {
    props.backTo = spec.backTo
  }

  const portal = create(props)
  if (spec.id) {
    portal.id = spec.id
  }
  portal.pos.set(tile.x + spec.portal.offsetX, tile.y + spec.portal.offsetY)
  portal.size.set(spec.portal.width, spec.portal.height)
  level.entities.add(portal)
}

/** 按补丁声明的 id 找本关刚注入的 portal（供「出生钻管」定位）。 */
function findPortalById(level: Level, id: string): Entity | undefined {
  for (const entity of level.entities) {
    if (entity.id === id) {
      return entity
    }
  }
  return undefined
}

/**
 * 出生钻管：关卡第一帧把马里奥接上入口管（dir UP），让他从管口里升出来。
 *
 * 特性 setup 跑在 `bootstrapPlayer` 之前（马里奥还没进关卡），所以不能当场
 * connectEntity——挂在代理实体上，等第一帧马里奥在关卡里了再接。接完即自删
 * （一次性行为；Set 的 forEach 对中途删除是安全的）。
 */
class SpawnFromPipe extends Trait {
  private connected = false

  constructor(private portal: Entity) {
    super()
  }

  update(entity: Entity, _gameContext: GameContext, level: Level) {
    if (this.connected) {
      return
    }

    const mario = firstPlayer(level)
    if (!mario) {
      return
    }

    this.connected = true
    connectEntity(this.portal, mario)
    level.entities.delete(entity)
  }
}

function firstPlayer(level: Level): Entity | undefined {
  for (const entity of findPlayers(level.entities)) {
    return entity
  }
  return undefined
}

registerLevelFeature({
  name: 'bonus-rooms',
  setup(level, ctx) {
    const patch = patchFor(ctx.name)

    // 进 / 出管：按管口瓦片注入（防重入同 exitPipe.hasPortal——管口旁已有 portal
    // 就不再注入，避免马里奥同时压进两个门户、两段插值打架）。
    for (const spec of patch.bonusPipes ?? []) {
      const tile = findMouthTile(ctx.grids, spec.mouth)
      if (!tile) {
        // 补丁表与关卡数据对不上（管口瓦片不在），宁缺勿错。
        continue
      }
      const x = tile.x + spec.portal.offsetX
      const y = tile.y + spec.portal.offsetY
      if (findPortalNear(level, x, y)) {
        continue
      }
      injectPortal(level, ctx.entityFactory, tile, spec)
    }

    // 碰撞盒校正：upstream 放好的 portal 尺寸/位置不合适（大马里奥触发不了），
    // 原地改它而不是再注入一个（两个门户重叠会双触发）。
    for (const fix of patch.bonusPortalFixes ?? []) {
      const portal = findPortalNear(level, fix.match[0], fix.match[1])
      if (!portal) {
        continue
      }
      portal.pos.set(fix.pos[0], fix.pos[1])
      portal.size.set(fix.size[0], fix.size[1])
    }

    // 出生钻管（uw-exit）：从入口水管里升出来，与原版的出场方式一致。
    if (patch.spawnThroughPortal) {
      const portal = findPortalById(level, patch.spawnThroughPortal)
      if (portal) {
        const proxy = new Entity()
        proxy.addTrait(new SpawnFromPipe(portal))
        level.entities.add(proxy)
      }
    }
  },
})
