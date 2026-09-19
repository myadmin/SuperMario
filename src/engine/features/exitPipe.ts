/**
 * 特性：结尾的横管（走到管口前按方向键就把马里奥送进下一关）
 *
 * 原版 1-2 的结尾是：过完两道升降桥 → 一座砖台上有一根**横着的管子**，管口朝左，
 * 马里奥走进管口就被送到「地下出口」（一片天空下的旗杆 + 城堡区域），从那儿过关。
 *
 * 上游的关卡 JSON 里：
 *   - 管子的**瓦片**是有的（`pipe-insert-hor-*` 在 col 166 / row 8~9，管身往右接竖管）；
 *   - 但**传送门实体**没有——上游要 JSON 里写 `{"name": "pipe-portal"}` 才会造，
 *     而 1-2 的 `entities` 里只有敌人，于是这根管子只是个装饰，走进去什么都不发生。
 *
 * 本模块按「管口瓦片」注入上游的 `pipe-portal` 实体（工厂与 `setupEntities()` 用的是
 * 同一份，所以 `pipe` 音效也照旧）。`goesTo` 指向 `uw-exit`——也就是 `public/levels/`
 * 里本来就存在、但一直没人用过的「地下出口」关（旗杆 + 城堡，见 `castle.ts` 与
 * `features/flag.ts`）。到了那边，走进城堡会按 `levelPatches` 的 `nextLevel` 推进到 1-3。
 *
 * 门户区域的放法（实测得到，见 docs/verification.md）：
 *   - **往管口左侧放**：管口的瓦片本身是实心的（`pipe-insert-hor-*` 的 behavior 是
 *     `ground`），马里奥走到嘴前就被挡住（右边缘正好停在 x 2656），所以门户必须罩住
 *     「嘴前那一格」才能触发；
 *   - **高度要够**：上游门户工厂给的是 30px 高，而大马里奥有 32px，`Pipe.collides`
 *     要求「旅行者的上下边都落在门户内」，于是大马里奥永远进不去——这里把门户
 *     改成 48px 高（只改高度，宽度仍是 24，不影响 `Pipe` 的插值距离）。
 */
import { registerLevelFeature, findTiles } from '../levelFeatures'
import { patchFor } from '../levelPatches'
import type { ExitPipePatch } from '../levelPatches'
import type { EntityFactory } from '../GameContext'
import type Level from '../Level'
import type { FoundTile } from '../levelFeatures'

/** 该管口是否已经在关卡 JSON 里带了传送门实体（带了就不再注入，避免重复）。 */
function hasPortal(level: Level, tile: FoundTile) {
  for (const entity of level.entities) {
    if (!entity.props || !entity.props.goesTo) {
      continue
    }
    if (Math.abs(entity.pos.x - tile.x) < 32 && Math.abs(entity.pos.y - tile.y) < 48) {
      return true
    }
  }
  return false
}

function injectPortal(level: Level, entityFactory: EntityFactory, tile: FoundTile, spec: ExitPipePatch) {
  const create = entityFactory['pipe-portal']
  if (!create) {
    return
  }

  const portal = create({ dir: spec.dir, goesTo: { name: spec.goesTo } })
  portal.pos.set(tile.x + spec.portal.offsetX, tile.y + spec.portal.offsetY)
  portal.size.set(spec.portal.width, spec.portal.height)
  level.entities.add(portal)
}

registerLevelFeature({
  name: 'exit-pipe',
  setup(level, ctx) {
    for (const spec of patchFor(ctx.name).exitPipes ?? []) {
      for (const style of spec.mouthStyles) {
        for (const tile of findTiles(ctx.grids, style)) {
          if (hasPortal(level, tile)) {
            continue
          }
          injectPortal(level, ctx.entityFactory, tile, spec)
        }
      }
    }
  },
})
