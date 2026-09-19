/**
 * layers/text.ts — ported verbatim from upstream `public/js/layers/text.js`.
 * Centre-aligned bitmap-font text (used for the "Loading x..." screen).
 */
import type { Font } from '../loaders/font'

export function createTextLayer(font: Font, text: string) {
  const size = font.size
  return function drawText(context: CanvasRenderingContext2D) {
    const textW = text.length
    const screenW = Math.floor(context.canvas.width / size)
    const screenH = Math.floor(context.canvas.height / size)
    const x = screenW / 2 - textW / 2
    const y = screenH / 2
    font.print(text, context, x * size, y * size)
  }
}
