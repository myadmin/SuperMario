/**
 * boot.ts —— 本项目新增：打开页面即开始的素材预加载 + 启动画面进度。
 *
 * 原本的时间线是：打开页面 → 纯黑（Phaser 启动、bundle 解析）→ 点击 → **这时才开始**
 * 拉精灵图 / 音效 / 关卡数据 → 黑屏到「Loading 1-1...」出现。用户实测反馈「太慢、
 * 没有加载效果」。现在：
 *
 *   - `index.html` 的内联启动画面（#boot）在页面打开的一瞬间就有了（不依赖 JS）；
 *   - 本模块在 Phaser 之前执行，立即按清单 fetch 全部小体积素材（图片 / 精灵规格 /
 *     图案 / 关卡 / 音效表 / 音效），HTTP 缓存预热——点击「开始」后游戏自己的加载器
 *     再请求同一批 URL 时直接命中缓存，秒进；
 *   - 进度写进 #boot-progress（NOW LOADING n/N → READY）；
 *   - 游戏可玩（GameScene 拿到 handle 并 start）后调用 `hideBoot()` 淡出——画布上
 *     此时已经有「Loading 1-1...」和过场页，交接是无缝的。
 *
 * 音乐（public/audio/music，1.9M）不预载：它由 MusicPlayer 的 HTMLAudio 流式播放，
 * 点击后按需拉取即可。预载清单里的音效（248K）是解码前的原始文件，点击后
 * decodeAudioData 很快。
 *
 * `index.html` 不属于「public/ 逐字节原版」的冻结范围（它早已是 Vite 宿主文件），
 * 启动画面的标记与内联样式放在那里，保证零 JS 依赖、首帧即见。
 */

/** 预载清单：图片 + 精灵规格 + 图案 + 全部关卡 + 音效表 + 音效（音乐流式，不预载）。 */
const MANIFEST: string[] = [
  // 位图字体 / 精灵图集 / 瓦片图集 / 得分数字
  '/img/font.png',
  '/img/points.png',
  '/img/sprites.png',
  '/img/tiles.png',
  // 精灵规格
  '/sprites/brick-shrapnel.json',
  '/sprites/bullet.json',
  '/sprites/castle.json',
  '/sprites/cheep-gray.json',
  '/sprites/cheep-red.json',
  '/sprites/goomba-blue.json',
  '/sprites/goomba-brown.json',
  '/sprites/koopa-blue.json',
  '/sprites/koopa-green.json',
  '/sprites/mario.json',
  '/sprites/overworld.json',
  '/sprites/piranha-plant.json',
  '/sprites/underwater.json',
  '/sprites/underworld.json',
  // 图案表
  '/sprites/patterns/castle-pattern.json',
  '/sprites/patterns/overworld-pattern.json',
  '/sprites/patterns/underwater-pattern.json',
  '/sprites/patterns/underworld-pattern.json',
  // 全部关卡（小体积；顺带让后续每一关的过场都秒加载）
  '/levels/1-1.json', '/levels/1-2.json', '/levels/1-3.json', '/levels/1-4.json',
  '/levels/2-1.json', '/levels/2-2.json', '/levels/2-3.json', '/levels/2-4.json',
  '/levels/3-1.json', '/levels/5-3.json', '/levels/7-2.json', '/levels/7-3.json',
  '/levels/coin-clouds-1.json', '/levels/coin-room-1.json', '/levels/coin-room-2.json',
  '/levels/coin-room-3.json', '/levels/coin-room-4.json', '/levels/coin-room-5.json',
  '/levels/debug-coin.json', '/levels/debug-flag.json', '/levels/debug-level.json',
  '/levels/debug-pipe.json', '/levels/debug-progression.json',
  '/levels/uw-entrance.json', '/levels/uw-exit.json',
  // 音效表
  '/sounds/brick-shrapnel.json',
  '/sounds/cannon.json',
  '/sounds/flag-pole.json',
  '/sounds/mario.json',
  '/sounds/pipe-portal.json',
  // 音效（音乐不预载，流式播放）
  '/audio/fx/1up.ogg',
  '/audio/fx/bowser-die.ogg',
  '/audio/fx/bowser-fire.ogg',
  '/audio/fx/brick-bump.ogg',
  '/audio/fx/brick-destroy.ogg',
  '/audio/fx/coin.ogg',
  '/audio/fx/fireball.ogg',
  '/audio/fx/fireworks.ogg',
  '/audio/fx/flagpole.ogg',
  '/audio/fx/jump-large.ogg',
  '/audio/fx/jump.ogg',
  '/audio/fx/kick.ogg',
  '/audio/fx/pause.ogg',
  '/audio/fx/pipe.ogg',
  '/audio/fx/power-up-appears.ogg',
  '/audio/fx/power-up-consume.ogg',
  '/audio/fx/stomp.ogg',
  '/audio/fx/thwomp.ogg',
  '/audio/fx/vine.ogg',
]

import { assetUrl } from './engine/paths'

let loaded = 0

function tick() {
  const el = document.getElementById('boot-progress')
  if (!el) {
    return
  }
  el.textContent = loaded >= MANIFEST.length ? 'READY' : `NOW LOADING ${loaded}/${MANIFEST.length}`
}

/** 游戏可玩后由宿主场景调用：淡出启动画面（画布上此时已有游戏的加载页/过场页）。 */
export function hideBoot() {
  document.getElementById('boot')?.classList.add('boot-hidden')
}

// 模块即执行：main.ts 把它放在 Phaser 之前导入，尽早开跑。
for (const url of MANIFEST) {
  fetch(assetUrl(url))
    .catch(() => undefined)
    .finally(() => {
      loaded += 1
      tick()
    })
}
tick()
