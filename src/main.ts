import Phaser from 'phaser'
import { GameScene } from './scenes/GameScene'
import { setupMusicButton } from './musicButton'

/**
 * Phaser bootstrap.
 *
 * The canvas is authored in index.html (`<canvas id="screen" width="256"
 * height="240" class="aspect-4-3">`) and handed to Phaser, so the upstream
 * stylesheet keeps full control of the on-page presentation — including the
 * 4:3 letterbox and `image-rendering: pixelated`.
 */
const canvas = document.getElementById('screen') as HTMLCanvasElement

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  canvas,
  width: 256,
  height: 240,
  pixelArt: true,
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.NONE,
    width: 256,
    height: 240,
  },
  scene: [GameScene],
}

const game = new Phaser.Game(config)

// 本项目新增：右下角的背景音乐开关（原版没有 UI，音乐只能一直开）。
setupMusicButton()

// Scale.NONE only writes inline sizes when the zoom is reset; clear anything
// that may have been applied so the upstream CSS sizing wins unconditionally.
canvas.style.removeProperty('width')
canvas.style.removeProperty('height')

// Exposed for debugging / automated visual checks.
;(window as unknown as { __game: Phaser.Game }).__game = game
