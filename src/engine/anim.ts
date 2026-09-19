/**
 * anim.ts — ported verbatim from upstream `public/js/anim.js`.
 * Returns a resolver that maps an accumulated distance (px or seconds) to a
 * frame name, cycling through the given frame list.
 */
import type { Animation } from './SpriteSheet'

export function createAnim(frames: string[], frameLen: number): Animation {
  return function resolveFrame(distance: number) {
    const frameIndex = Math.floor(distance / frameLen) % frames.length
    const frameName = frames[frameIndex]
    return frameName
  }
}
