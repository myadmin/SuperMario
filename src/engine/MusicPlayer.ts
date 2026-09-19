/**
 * MusicPlayer.ts — ported verbatim from upstream `public/js/MusicPlayer.js`.
 * Uses HTMLAudioElement tracks (looping), driven by MusicController.
 *
 * 本项目新增（背景音乐开关，见 `musicSwitch.ts`）：`playTrack()` 先问开关要不要响，
 * 并把自己登记成「当前播放器」，供开关在关掉时静音、打开时接着放。
 * 原版是无条件 `void audio.play()`。
 * 本项目新增（防御）：缺轨返回 null、`play()` 的拒绝一律兜住（`silent.json` 的空 url
 * 会产生被拒绝的 play()，不兜住会每帧一条 unhandled rejection）。
 */
import { musicEnabled, setMusicDriver } from './musicSwitch'

export default class MusicPlayer {
  tracks = new Map<string, HTMLAudioElement>()

  /** 本项目新增：最后一次被请求的曲目，供开关重新打开时接着放。 */
  current: string | null = null

  addTrack(name: string, url: string) {
    const audio = new Audio()
    audio.loop = true
    audio.src = url
    this.tracks.set(name, audio)
  }

  playTrack(name: string) {
    this.pauseAll()
    const audio = this.tracks.get(name)
    if (!audio) {
      // 本项目新增：缺轨（如没有 hurry 的音乐表）时返回 null，由调用方降级——
      // 上游的 `tracks.get(name)!` 会让 play() 抛 TypeError 打断游戏循环。
      return null
    }
    this.current = name
    setMusicDriver(this)
    if (musicEnabled()) {
      void audio.play().catch(() => undefined)
    }
    return audio
  }

  pauseAll() {
    this.current = null
    this.mute()
  }

  /** 本项目新增：停掉所有曲目，但保留「当前曲目」（开关关掉时用）。 */
  mute() {
    for (const audio of this.tracks.values()) {
      audio.pause()
    }
  }

  /** 本项目新增：把当前曲目接着放过（开关重新打开时用）。 */
  resume() {
    if (!this.current) {
      return
    }

    const audio = this.tracks.get(this.current)
    if (audio) {
      void audio.play().catch(() => undefined)
    }
  }
}
