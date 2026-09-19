/**
 * layers/dashboard.ts — ported verbatim from upstream `public/js/layers/dashboard.js`.
 *
 * Exact layout (font is 8x8):
 *   LINE1 = 16, LINE2 = 24
 *   MARIO            (24,16)   score 6-digit      (24,24)
 *   ×00              (96,24)
 *   WORLD            (144,16)  world name         (152,24)
 *   TIME             (200,16)  time 3-digit       (208,24)
 */
import Player from '../traits/Player'
import LevelTimer from '../traits/LevelTimer'
import type Entity from '../Entity'
import type { Font } from '../loaders/font'

export function createDashboardLayer(font: Font, entity: Entity) {
  const LINE1 = font.size * 2
  const LINE2 = font.size * 3

  return function drawDashboard(context: CanvasRenderingContext2D) {
    const playerTrait = entity.getTrait(Player)
    const timerTrait = entity.getTrait(LevelTimer)

    font.print(playerTrait.name, context, 24, LINE1)
    font.print(playerTrait.score.toString().padStart(6, '0'), context, 24, LINE2)

    font.print('×' + playerTrait.coins.toString().padStart(2, '0'), context, 96, LINE2)

    font.print('WORLD', context, 144, LINE1)
    font.print(playerTrait.world, context, 152, LINE2)

    font.print('TIME', context, 200, LINE1)
    font.print(timerTrait.currentTime.toFixed().toString().padStart(3, '0'), context, 208, LINE2)
  }
}
