/**
 * layers/player-progress.ts — ported verbatim from upstream `public/js/layers/player-progress.js`.
 *
 * The between-levels splash:
 *   WORLD 1-1   at (96, 96)
 *   ×  3        at (128, 128)
 *   Mario icon  at (104, 120)
 */
import { findPlayers } from '../player'
import Player from '../traits/Player'
import type Entity from '../Entity'
import type Level from '../Level'
import type { Font } from '../loaders/font'

function getPlayer(entities: Set<Entity>) {
  for (const entity of findPlayers(entities)) {
    return entity
  }
  return undefined
}

export function createPlayerProgressLayer(font: Font, level: Level) {
  const size = font.size

  const spriteBuffer = document.createElement('canvas')
  spriteBuffer.width = 32
  spriteBuffer.height = 32
  const spriteBufferContext = spriteBuffer.getContext('2d')!

  return function drawPlayerProgress(context: CanvasRenderingContext2D) {
    const entity = getPlayer(level.entities)!
    const player = entity.getTrait(Player)
    font.print('WORLD ' + level.name, context, size * 12, size * 12)

    font.print('×' + player.lives.toString().padStart(3, ' '), context, size * 16, size * 16)

    spriteBufferContext.clearRect(0, 0, spriteBuffer.width, spriteBuffer.height)
    entity.draw!(spriteBufferContext)
    context.drawImage(spriteBuffer, size * 13, size * 15)
  }
}
