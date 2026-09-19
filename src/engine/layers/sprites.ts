/**
 * layers/sprites.ts — ported verbatim from upstream `public/js/layers/sprites.js`.
 * Each entity renders into a shared 64x64 scratch buffer, then blits to its
 * camera-relative position (floored) — this is what keeps entities pixel-snapped.
 */
import type Entity from '../Entity'

export function createSpriteLayer(entities: Set<Entity>, width = 64, height = 64) {
  const spriteBuffer = document.createElement('canvas')
  spriteBuffer.width = width
  spriteBuffer.height = height
  const spriteBufferContext = spriteBuffer.getContext('2d')!

  return function drawSpriteLayer(context: CanvasRenderingContext2D, camera: any) {
    entities.forEach((entity) => {
      if (!entity.draw) {
        return
      }

      spriteBufferContext.clearRect(0, 0, width, height)

      entity.draw(spriteBufferContext)

      context.drawImage(
        spriteBuffer,
        Math.floor(entity.pos.x - camera.pos.x),
        Math.floor(entity.pos.y - camera.pos.y),
      )
    })
  }
}
