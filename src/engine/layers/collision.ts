/**
 * layers/collision.ts — ported verbatim from upstream `public/js/layers/collision.js`.
 *
 * 上游在 `setupLevel()` 里无条件 push 这一层，所以原版 shipped 版本会常驻画出：
 *   - 每个实体包围盒的红色方框
 *   - 物理扫描刚查过的每一格瓦片的蓝色方框
 *
 * 那是调试脚手架而非设计，因此本项目的交付版**默认关闭**；访问时加 `?debug=1`
 * 可还原与原版一致的输出（见 `game.ts` 的 `collisionDebugLayer` 选项）。
 */
import type Entity from '../Entity'
import type Level from '../Level'
import type TileResolver from '../TileResolver'

function createEntityLayer(entities: Set<Entity>) {
  return function drawBoundingBox(context: CanvasRenderingContext2D, camera: { pos: { x: number; y: number } }) {
    context.strokeStyle = 'red'
    entities.forEach((entity) => {
      context.beginPath()
      context.rect(
        Math.floor(entity.bounds.left - camera.pos.x) + 0.5,
        Math.floor(entity.bounds.top - camera.pos.y) + 0.5,
        entity.size.x - 1,
        entity.size.y - 1,
      )
      context.stroke()
    })
  }
}

function createTileCandidateLayer(tileResolver: TileResolver) {
  const resolvedTiles: Array<{ x: number; y: number }> = []

  const tileSize = tileResolver.tileSize

  const getByIndexOriginal = tileResolver.getByIndex
  tileResolver.getByIndex = function getByIndexFake(x: number, y: number) {
    resolvedTiles.push({ x, y })
    return getByIndexOriginal.call(tileResolver, x, y)
  }

  return function drawTileCandidates(
    context: CanvasRenderingContext2D,
    camera: { pos: { x: number; y: number } },
  ) {
    context.strokeStyle = 'blue'
    resolvedTiles.forEach(({ x, y }) => {
      context.beginPath()
      context.rect(
        Math.floor(x * tileSize - camera.pos.x) + 0.5,
        Math.floor(y * tileSize - camera.pos.y) + 0.5,
        tileSize - 1,
        tileSize - 1,
      )
      context.stroke()
    })

    resolvedTiles.length = 0
  }
}

export function createCollisionLayer(level: Level) {
  const drawTileCandidates = level.tileCollider.resolvers.map(createTileCandidateLayer)
  const drawBoundingBoxes = createEntityLayer(level.entities)

  return function drawCollision(context: CanvasRenderingContext2D, camera: any) {
    drawTileCandidates.forEach((draw) => draw(context, camera))
    drawBoundingBoxes(context, camera)
  }
}
