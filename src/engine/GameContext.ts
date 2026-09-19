/**
 * GameContext.ts — shared per-tick context. Ported from upstream `public/js/main.js`
 * gameContext object + the implicit contract used across traits/entities.
 */
import type Entity from './Entity'

export type EntityFactory = Record<string, (props?: any) => Entity>

export default interface GameContext {
  audioContext: AudioContext
  videoContext: CanvasRenderingContext2D
  entityFactory: EntityFactory
  deltaTime: number
  tick: number
}
