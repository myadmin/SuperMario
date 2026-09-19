/**
 * Scene.ts — ported verbatim from upstream `public/js/Scene.js`.
 */
import Compositor from './Compositor'
import EventEmitter from './EventEmitter'
import type GameContext from './GameContext'

export default class Scene {
  static EVENT_COMPLETE = Symbol('scene complete')

  events = new EventEmitter()
  comp = new Compositor()

  draw(gameContext: GameContext) {
    this.comp.draw(gameContext.videoContext)
  }

  update(_gameContext: GameContext) {}

  pause() {
    // 上游在这里 `console.log('Pause', this)`——每个场景切换都打一条日志。
    // 本项目改为静默：那句话是调试残留，不是设计。
  }
}
