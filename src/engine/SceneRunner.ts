/**
 * SceneRunner.ts — ported verbatim from upstream `public/js/SceneRunner.js`.
 */
import Scene from './Scene'
import type GameContext from './GameContext'

export default class SceneRunner {
  sceneIndex = -1
  scenes: Scene[] = []

  addScene(scene: Scene) {
    scene.events.listen(Scene.EVENT_COMPLETE, () => {
      this.runNext()
    })
    this.scenes.push(scene)
  }

  runNext() {
    const currentScene = this.scenes[this.sceneIndex]
    if (currentScene) {
      currentScene.pause()
    }
    this.sceneIndex++
  }

  update(gameContext: GameContext) {
    const currentScene = this.scenes[this.sceneIndex]
    if (currentScene) {
      currentScene.update(gameContext)
      currentScene.draw(gameContext)
    }
  }
}
