/**
 * musicSwitch.ts —— 本项目新增：背景音乐的「开 / 关」状态。
 *
 * 原版没有开关：`MusicPlayer.playTrack()` 一被调用就开唱（开场、换关、以及时间快到时的
 * 加速主题都会调它）。本项目在页面右下角放一个开关（见 `src/musicButton.ts`），这里负责
 * 状态本身：
 *
 *   - 默认**开**（与原版行为一致），选择记进 localStorage，刷新后沿用；
 *   - `MusicPlayer` 每次请求播放时把自己登记成「当前播放器」（`setMusicDriver`）：关掉时
 *     让**它**静音、打开时让**它**接着放。这样不用给每个播放器挂监听 —— 关卡每次加载都会
 *     新建一个播放器，挂监听会把换掉的旧播放器（连同几份音频）一直留在内存里；
 *   - 变化用订阅广播，页面上的按钮据此改文字/样式。
 */
import type MusicPlayer from './MusicPlayer'

const STORAGE_KEY = 'super-mario:music'

/** 能响应开关的播放器（`MusicPlayer` 满足这个形状）。 */
export type MusicDriver = Pick<MusicPlayer, 'mute' | 'resume'>

type Listener = (enabled: boolean) => void

/**
 * 读上次的选择，默认开。
 * localStorage 不可用（隐私模式、`file://`）时静默回落到默认值：开关在本次会话内照常
 * 有效，只是不留存。
 */
function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

let enabled = readStored()
let driver: MusicDriver | null = null
const listeners = new Set<Listener>()

export function musicEnabled() {
  return enabled
}

/** 登记「当前播放器」：由 `MusicPlayer.playTrack()` 调用，最后请求播放的那一个生效。 */
export function setMusicDriver(next: MusicDriver) {
  driver = next
}

export function setMusicEnabled(next: boolean) {
  if (next === enabled) {
    return
  }

  enabled = next

  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // 存不下就算了，本次会话内的开关依然有效
  }

  if (driver) {
    if (next) {
      driver.resume()
    } else {
      driver.mute()
    }
  }

  listeners.forEach((listener) => listener(next))
}

/** 订阅开关变化（返回退订函数）。 */
export function onMusicEnabledChange(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
