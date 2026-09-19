/**
 * loaders/sprite.ts — ported verbatim from upstream `public/js/loaders/sprite.js`.
 *
 * A sprite-sheet spec is either tile-indexed (`tileW`/`tileH` + `tiles[].index`)
 * or rect-indexed (`frames[].rect`), optionally with named `animations`.
 */
import { loadJSON, loadImage } from './loaders'
import SpriteSheet from '../SpriteSheet'
import { createAnim } from '../anim'

type TileSpec = { name: string; index: [number, number] }
type FrameSpec = { name: string; rect: [number, number, number, number] }
type AnimSpec = { name: string; frameLen: number; frames: string[] }

export type SpriteSheetSpec = {
  imageURL: string
  tileW?: number
  tileH?: number
  tiles?: TileSpec[]
  frames?: FrameSpec[]
  animations?: AnimSpec[]
}

export function loadSpriteSheet(name: string): Promise<SpriteSheet> {
  return loadJSON<SpriteSheetSpec>(`/sprites/${name}.json`)
    .then((sheetSpec) => Promise.all([sheetSpec, loadImage(sheetSpec.imageURL)]))
    .then(([sheetSpec, image]) => {
      const sprites = new SpriteSheet(image, sheetSpec.tileW, sheetSpec.tileH)

      if (sheetSpec.tiles) {
        sheetSpec.tiles.forEach((tileSpec) => {
          sprites.defineTile(tileSpec.name, tileSpec.index[0], tileSpec.index[1])
        })
      }

      if (sheetSpec.frames) {
        sheetSpec.frames.forEach((frameSpec) => {
          sprites.define(frameSpec.name, ...frameSpec.rect)
        })
      }

      if (sheetSpec.animations) {
        sheetSpec.animations.forEach((animSpec) => {
          const animation = createAnim(animSpec.frames, animSpec.frameLen)
          sprites.defineAnim(animSpec.name, animation)
        })
      }

      return sprites
    })
}
