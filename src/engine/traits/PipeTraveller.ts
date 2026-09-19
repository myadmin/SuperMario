/**
 * traits/PipeTraveller.ts — ported verbatim from upstream `public/js/traits/PipeTraveller.js`.
 */
import { Vec2 } from '../math'
import Trait from '../Trait'

export default class PipeTraveller extends Trait {
  direction = new Vec2(0, 0)
  movement = new Vec2(0, 0)
  distance = new Vec2(0, 0)
}
