/**
 * layers/background.ts — ported verbatim from upstream `public/js/layers/background.js`.
 *
 * Tiles are pre-rendered into a 272x240 offscreen buffer for the visible
 * columns only, then blitted with the camera's sub-tile remainder so the
 * scroll is pixel-exact.
 */
import TileResolver from '../TileResolver'
import type { Matrix } from '../math'
import type SpriteSheet from '../SpriteSheet'
import type Level from '../Level'
import type { Tile } from '../TileResolver'

/**
 * 本项目新增：瓦片「上弹」位移表。
 *
 * 上游没有可顶的方块，背景层每格都固定画在 `(x, y)`。问号块被顶时需要整体上移
 * 几像素再落回，于是这里按 `${indexX},${indexY}` 记录每格当前的竖直像素偏移
 * （负数向上），绘制时查询、由 `advanceTileOffsets` 每帧推进回落。
 * 上游逻辑不受影响：表为空时偏移恒为 0，绘制与原来完全一致。
 *
 * **为什么连瓦片对象一起记**：关卡有多层背景（1-1 是「天空 + 地面」一层、真正的
 * 瓦片一层），每层都对着同一个格子调用 `tileOffsets.get()`。如果只按格子坐标记偏移，
 * 天空层里那一格也会被上移，而天空是不透明的——它一移开就在原位留下 10px 的透明洞。
 * `Compositor.draw()` 不像上游那样清一次画布，所以这个洞会漏出**上一帧**的像素：
 * 看起来就是被顶起的方块下面还粘着一块旧方块（本项目修掉的「底部多一个置灰石块」）。
 * 因此偏移连同**被顶的那个瓦片对象**一起记录，绘制时只对同一个对象生效——其他层
 * （天空层）里的那块瓦片不动，方块原位就正常露出天空，洞也就不存在了。
 */
export type TileBump = {
  /** 当前竖直偏移（像素，负数向上）。 */
  offset: number
  /** 被顶的那个瓦片对象（只有它跟着上弹）。 */
  tile: Tile
}

export const tileOffsets = new Map<string, TileBump>()

/** 上弹的起始位移（像素，向上）与回落时长（秒）。 */
const BUMP_HEIGHT = 10
const BUMP_DURATION = 0.2
const BUMP_SPEED = BUMP_HEIGHT / BUMP_DURATION

/**
 * 本项目新增：触发某一格上弹。由 `features/chanceBlock.ts` 在顶到方块时调用。
 * `tile` 必须是**顶完之后网格里那个对象**（被顶毁/换成已使用块的方块会换一个新对象），
 * 否则身份对不上、方块不会上弹。
 */
export function bumpTile(indexX: number, indexY: number, tile: Tile) {
  tileOffsets.set(`${indexX},${indexY}`, { offset: -BUMP_HEIGHT, tile })
}

/** 本项目新增：每帧推进所有位移向 0 线性回落，回到 0 后移除。 */
export function advanceTileOffsets(deltaTime: number) {
  for (const [key, bump] of tileOffsets) {
    const next = bump.offset + BUMP_SPEED * deltaTime
    if (next >= 0) {
      tileOffsets.delete(key)
    } else {
      bump.offset = next
    }
  }
}

export function createBackgroundLayer(level: Level, tiles: Matrix<Tile>, sprites: SpriteSheet) {
  const resolver = new TileResolver(tiles)

  // 本项目新增：`tileOffsets` 是模块级的，跨关卡共享。切换关卡时旧关卡那个推进位移的
  // 代理实体已经不再 update，残留的偏移会永久冻结、并错误地作用到新关卡同坐标的瓦片上。
  // 每建一层背景（即每次加载关卡）就清空一次，保证新关卡从零偏移开始。
  tileOffsets.clear()

  const buffer = document.createElement('canvas')
  buffer.width = 256 + 16
  buffer.height = 240

  const context = buffer.getContext('2d')!

  function redraw(startIndex: number, endIndex: number) {
    context.clearRect(0, 0, buffer.width, buffer.height)

    for (let x = startIndex; x <= endIndex; ++x) {
      const col = tiles.grid[x]
      if (col) {
        col.forEach((tile, y) => {
          // 本项目新增：隐藏块在被顶开之前不画（原版 SMB 的隐藏块就是看不见但实心）。
          // 顶开时 `features/chanceBlock.ts` 会把 `hidden` 去掉，下一帧就现身。
          if (tile.hidden) {
            return
          }

          // 本项目新增：问号块被顶到时整格上移几像素。两个绘制分支都要带上这个偏移。
          // 只对**被顶的那个瓦片对象**生效：同一格在别的层（天空层）里是另一张瓦片，
          // 它必须留在原位，否则会在原位留下透明洞、漏出上一帧的像素（见 `tileOffsets`）。
          const bump = tileOffsets.get(`${x},${y}`)
          const offset = bump && bump.tile === tile ? bump.offset : 0
          if (offset) {
            context.save()
            context.translate(0, offset)
          }

          if (sprites.animations.has(tile.style)) {
            sprites.drawAnim(tile.style, context, x - startIndex, y, level.totalTime)
          } else {
            sprites.drawTile(tile.style, context, x - startIndex, y)
          }

          if (offset) {
            context.restore()
          }
        })
      }
    }
  }

  return function drawBackgroundLayer(context: CanvasRenderingContext2D, camera: any) {
    const drawWidth = resolver.toIndex(camera.size.x)
    const drawFrom = resolver.toIndex(camera.pos.x)
    const drawTo = drawFrom + drawWidth
    redraw(drawFrom, drawTo)

    context.drawImage(buffer, Math.floor(-camera.pos.x % 16), Math.floor(-camera.pos.y))
  }
}
