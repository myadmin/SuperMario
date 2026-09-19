/**
 * SpriteSheet.ts — ported verbatim from upstream `public/js/SpriteSheet.js`.
 *
 * Frames are pre-rendered into two offscreen canvases (normal + horizontally
 * flipped) exactly like upstream, so a `flip` draw is a blit rather than a
 * transform — this is what keeps the pixel output identical.
 */
export type SpriteImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap

export type Animation = (distance: number) => string

export default class SpriteSheet {
  image: SpriteImage
  width: number
  height: number
  tiles = new Map<string, HTMLCanvasElement[]>()
  animations = new Map<string, Animation>()

  constructor(image: SpriteImage, width?: number, height?: number) {
    this.image = image
    this.width = width as number
    this.height = height as number
  }

  defineAnim(name: string, animation: Animation) {
    this.animations.set(name, animation)
  }

  define(name: string, x: number, y: number, width: number, height: number) {
    const buffers = [false, true].map((flip) => {
      const buffer = document.createElement('canvas')
      buffer.width = width
      buffer.height = height

      const context = buffer.getContext('2d')!

      if (flip) {
        context.scale(-1, 1)
        context.translate(-width, 0)
      }

      context.drawImage(this.image as CanvasImageSource, x, y, width, height, 0, 0, width, height)

      return buffer
    })

    this.tiles.set(name, buffers)
  }

  defineTile(name: string, x: number, y: number) {
    this.define(name, x * this.width, y * this.height, this.width, this.height)
  }

  draw(name: string, context: CanvasRenderingContext2D, x: number, y: number, flip = false) {
    const buffer = this.tiles.get(name)![flip ? 1 : 0]
    context.drawImage(buffer, x, y)
  }

  drawAnim(name: string, context: CanvasRenderingContext2D, x: number, y: number, distance: number) {
    const animation = this.animations.get(name)!
    this.drawTile(animation(distance), context, x, y)
  }

  drawTile(name: string, context: CanvasRenderingContext2D, x: number, y: number) {
    this.draw(name, context, x * this.width, y * this.height)
  }
}
