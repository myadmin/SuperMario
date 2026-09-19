/**
 * Camera.ts — ported verbatim from upstream `public/js/Camera.js`.
 * Note: size is 256x224 (matches upstream), and pos.y never changes.
 */
import { Vec2 } from './math'

export default class Camera {
  pos = new Vec2(0, 0)
  size = new Vec2(256, 224)

  min = new Vec2(0, 0)
  max = new Vec2(Infinity, Infinity)
}
