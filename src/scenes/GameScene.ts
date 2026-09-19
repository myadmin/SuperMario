import Phaser from 'phaser'
import { createGame, type GameHandle } from '../game'
import type { KeyboardListener } from '../engine/input'

/** Upstream's Timer used a fixed 1/60 step; we drive it from Phaser's tick. */
const FIXED_DT = 1 / 60
const GAME_WIDTH = 256
const GAME_HEIGHT = 240

/**
 * Phaser host scene.
 *
 * The ported engine owns a 256x240 CanvasTexture and draws into it with the
 * exact same Canvas2D calls as upstream; this scene simply presents that
 * texture 1:1 and pumps the simulation on upstream's fixed timestep.
 *
 * Everything else the scene does is the equivalent of upstream `main.js`'s
 * bootstrap: wait for a click, unlock audio, then load and start World 1-1.
 */
export class GameScene extends Phaser.Scene {
  private screenTexture!: Phaser.Textures.CanvasTexture
  private handle: GameHandle | null = null
  private accumulator = 0
  private started = false

  constructor() {
    super('Game')
  }

  create() {
    const texture = this.textures.createCanvas('screen', GAME_WIDTH, GAME_HEIGHT)
    if (!texture) {
      throw new Error('failed to create the 256x240 canvas texture')
    }
    this.screenTexture = texture
    this.screenTexture.setFilter(Phaser.Textures.FilterMode.NEAREST)

    const screen = this.add.image(0, 0, 'screen')
    screen.setOrigin(0, 0)
    screen.setScrollFactor(0)

    // Keyboard: feed the ported KeyboardState from Phaser's keyboard plugin
    // (which targets `window`, exactly like upstream's addEventListener).
    const listenTo = (listener: KeyboardListener) => {
      const keyboard = this.input.keyboard
      if (!keyboard) {
        return
      }
      keyboard.on('keydown', listener)
      keyboard.on('keyup', listener)
    }

    const start = async () => {
      if (this.started) {
        return
      }
      this.started = true
      this.input.off(Phaser.Input.Events.POINTER_DOWN, start)

      // Created inside the gesture handler so the context starts unlocked,
      // mirroring upstream's `new AudioContext()` inside the click listener.
      const audioContext = new AudioContext()

      // 本项目新增：解锁兜底。理论上这个 context 在手势里创建就是 running 的，
      // 但个别浏览器（严格手势时序的 Safari 等）可能给出 suspended——症状是
      // 「音效全哑、音乐正常」（音乐走 HTMLAudioElement 不经它）。这里主动
      // resume 一次，并挂两个一次性手势监听兜底。
      const unlockAudio = () => {
        if (audioContext.state === 'suspended') {
          void audioContext.resume()
        }
      }
      unlockAudio()
      window.addEventListener('pointerdown', unlockAudio, { once: true })
      window.addEventListener('keydown', unlockAudio, { once: true })

      this.handle = await createGame({
        videoContext: this.screenTexture.context,
        audioContext,
        listenToKeyboard: listenTo,
        // 原版无条件渲染碰撞调试层（红/蓝方框）。作为交付物默认关闭；
        // 访问时加 ?debug=1 可还原与原版逐像素一致的输出。
        collisionDebugLayer: new URLSearchParams(location.search).get('debug') === '1',
      })

      // Upstream main.js did `window.mario = mario` for debugging; keep parity.
      ;(window as unknown as { mario: unknown }).mario = this.handle.mario
      // 本项目新增：把 GameHandle 也挂上去，调试 / 自动检查才看得到场景队列（当前是加载页
      // 还是关卡、关卡实体、相机……）。`window.mario` 只看得到马里奥自己，见 `game.ts`。
      ;(window as unknown as { __handle: unknown }).__handle = this.handle

      this.handle.start()
    }

    this.input.on(Phaser.Input.Events.POINTER_DOWN, start)
  }

  update(_time: number, delta: number) {
    const handle = this.handle
    if (!handle) {
      return
    }

    this.accumulator += delta / 1000
    if (this.accumulator > 1) {
      this.accumulator = 1
    }

    let stepped = false
    while (this.accumulator > FIXED_DT) {
      handle.update(FIXED_DT)
      this.accumulator -= FIXED_DT
      stepped = true
    }

    if (stepped) {
      this.screenTexture.refresh()
    }
  }
}
