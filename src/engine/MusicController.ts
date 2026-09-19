/**
 * MusicController.ts — ported verbatim from upstream `public/js/MusicController.js`.
 */
import type MusicPlayer from './MusicPlayer'

export default class MusicController {
  player: MusicPlayer | null = null

  setPlayer(player: MusicPlayer) {
    this.player = player
  }

  playTheme(speed = 1) {
    if (!this.player || !this.player.tracks.has('main')) {
      return
    }
    const audio = this.player.playTrack('main')!
    audio.playbackRate = speed
  }

  playHurryTheme() {
    // 本项目新增：个别音乐表只有 main 没有 hurry（如 uw-entrance / coin-clouds）。
    // 缺轨时退回加速的主题曲，而不是让 `playTrack('hurry')` 炸出 TypeError
    // 打断整个游戏循环（上游继承缺陷，这里补上防御）。
    if (!this.player || !this.player.tracks.has('hurry')) {
      this.playTheme(1.3)
      return
    }
    const audio = this.player.playTrack('hurry')!
    audio.loop = false
    audio.addEventListener(
      'ended',
      () => {
        this.playTheme(1.3)
      },
      { once: true },
    )
  }

  pause() {
    if (this.player) {
      this.player.pauseAll()
    }
  }
}
