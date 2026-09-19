/**
 * TimedScene.ts — ported verbatim from upstream `public/js/TimedScene.js`.
 */
import Scene from './Scene'
import type GameContext from './GameContext'

export default class TimedScene extends Scene {
  countDown = 2

  update(gameContext: GameContext) {
    this.countDown -= gameContext.deltaTime
    if (this.countDown <= 0) {
      this.events.emit(Scene.EVENT_COMPLETE)
    }
  }
}
