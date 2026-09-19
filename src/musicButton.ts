/**
 * musicButton.ts —— 本项目新增：页面上的背景音乐开关。
 *
 * 原版没有任何 UI，而本项目的硬性约定是 `public/` 下的文件逐字节保持原版
 * （`css/main.css` 也不能加样式），所以开关的 DOM 与样式都由这个模块自己注入，
 * `index.html` 保持原样。
 *
 * 位置固定在**右下角**：画布是 `width: 100vw` 的 4:3 letterbox，右下角要么落在画布
 * 下方的黑边里，要么只压在几块地砖上 —— 不会挡住 HUD（分数 / 金币 / WORLD / TIME 都在
 * 画布顶部）。
 *
 * 除点击外还支持 `M` 键。快捷键直接挂在 `window` 上，不改原版 KEYMAP
 * （`engine/input.ts` 的按键映射保持原样，那里也没有空闲键位可用）。
 */
import { musicEnabled, onMusicEnabledChange, setMusicEnabled } from './engine/musicSwitch'

const BUTTON_ID = 'music-toggle'

const STYLE = `
#${BUTTON_ID} {
  position: fixed;
  right: 8px;
  bottom: 8px;
  z-index: 10;
  padding: 6px 10px;
  border: 2px solid #fff;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font: 12px/1 ui-monospace, Menlo, monospace;
  letter-spacing: 1px;
  cursor: pointer;
  opacity: 0.7;
}

#${BUTTON_ID}:hover,
#${BUTTON_ID}:focus-visible {
  opacity: 1;
}

#${BUTTON_ID}[aria-pressed='false'] {
  border-color: #888;
  color: #999;
}
`

function label(enabled: boolean) {
  return enabled ? '♪ 音乐 开' : '♪ 音乐 关'
}

/** 建好右下角的音乐开关。只需调用一次（`main.ts`）。 */
export function setupMusicButton() {
  if (document.getElementById(BUTTON_ID)) {
    return
  }

  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)

  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'

  const sync = (enabled: boolean) => {
    button.textContent = label(enabled)
    button.setAttribute('aria-pressed', String(enabled))
    button.title = enabled ? '关闭背景音乐（快捷键 M）' : '开启背景音乐（快捷键 M）'
  }

  button.addEventListener('click', () => {
    setMusicEnabled(!musicEnabled())
    // 别把键盘焦点留在按钮上：否则之后按空格 / 回车会再次触发它
    button.blur()
  })

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyM' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    setMusicEnabled(!musicEnabled())
  })

  onMusicEnabledChange(sync)
  sync(musicEnabled())

  document.body.appendChild(button)
}
