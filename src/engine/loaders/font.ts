/**
 * loaders/font.ts — ported verbatim from upstream `public/js/loaders/font.js`.
 *
 * font.png is 136x24: 8x8 glyphs, 17 per row. The CHARS string defines the
 * glyph order and MUST be kept byte-for-byte identical (note the U+00D7
 * multiplication sign used by the dashboard for "×00" coin counts).
 */
import { loadImage } from './loaders'
import SpriteSheet from '../SpriteSheet'

const CHARS = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ©!-×.'

export class Font {
  sprites: SpriteSheet
  size: number

  constructor(sprites: SpriteSheet, size: number) {
    this.sprites = sprites
    this.size = size
  }

  print(text: string, context: CanvasRenderingContext2D, x: number, y: number) {
    ;[...text.toUpperCase()].forEach((char, pos) => {
      this.sprites.draw(char, context, x + pos * this.size, y)
    })
  }
}

export function loadFont(): Promise<Font> {
  return loadImage('./img/font.png').then((image) => {
    const fontSprite = new SpriteSheet(image)

    const size = 8
    const rowLen = image.width
    for (const [index, char] of [...CHARS].entries()) {
      const x = ((index * size) % rowLen) as number
      const y = Math.floor((index * size) / rowLen) * size
      fontSprite.define(char, x, y, size, size)
    }

    return new Font(fontSprite, size)
  })
}
