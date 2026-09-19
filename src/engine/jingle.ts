/**
 * jingle.ts —— 本项目新增：一次性短曲（死亡 / GAME OVER / 过关 / 城堡通关）。
 *
 * `public/audio/music/` 里有四首曲子从来没有被播放过，因为上游的 `public/music/*.json`
 * （按关卡登记的曲目表，本项目不改 `public/`）里没有它们：
 *   - `die.ogg`（2.72s）—— 马里奥死亡；
 *   - `game-over.ogg`（3.74s）—— 命扣光的 GAME OVER 屏；
 *   - `level-clear.ogg`（5.50s）—— 过地表关（抓旗杆滑到底之后）；
 *   - `castle-clear.ogg`（6.16s）—— 过城堡关（走进城堡门，见 `features/exitSequence.ts`）。
 *
 * **为什么不挂在关卡的 `MusicPlayer` 上**：那个播放器是「一关一份」的，
 * `SceneRunner.runNext()` 会调 `level.pause()` → `MusicPlayer.pauseAll()` 把它的全部曲目
 * 停掉。而死亡小曲必须**跨过关**：马里奥 1 秒后掉出画面、关卡随即重开，但小曲还有 1.7 秒
 * 没放完（原版也是让它在「WORLD 1-1 / ×N」过渡页里放完的）。所以这里用独立的播放器，
 * 生命周期与模块同长。
 *
 * 与页面右下角音乐开关（`musicSwitch.ts`）的关系：开关关掉时不放、正在放就静音、
 * **还没开播的排期一并取消**，重新打开再接着放已开播的。注意**不能**把这里登记成
 * `setMusicDriver()` 的当前播放器——那会把关卡主题曲的播放器顶掉，之后开关重新打开
 * 就没人可续播了；所以这里改为订阅开关。
 */
import { musicEnabled, onMusicEnabledChange } from './musicSwitch'

/** 曲子名 → 素材地址。 */
const JINGLES = {
  die: '/audio/music/die.ogg',
  'game-over': '/audio/music/game-over.ogg',
  'level-clear': '/audio/music/level-clear.ogg',
  'castle-clear': '/audio/music/castle-clear.ogg',
} as const

export type JingleName = keyof typeof JINGLES

let current: HTMLAudioElement | null = null
let currentName: JingleName | null = null
let pending: ReturnType<typeof setTimeout> | null = null

/** 停掉正在放的小曲，并取消还没开播的那一首（幂等）。 */
export function stopJingle() {
  if (pending !== null) {
    clearTimeout(pending)
    pending = null
  }

  if (current) {
    current.pause()
    current.currentTime = 0
  }
  current = null
  currentName = null
}

/** 正在放（或已排期）的小曲名字（没有就返回 null）。供调试与自动检查读取。 */
export function playingJingle(): JingleName | null {
  return currentName
}

/**
 * 当前小曲还剩多少秒放完（没在放、或时长还没读到就返回 0）。
 * 用来排期下一首：GAME OVER 小曲要等死亡小曲收尾（`game.ts`）。
 */
export function jingleRemaining(): number {
  if (!current) {
    return 0
  }

  const duration = current.duration
  if (!Number.isFinite(duration)) {
    return 0
  }

  return Math.max(0, duration - current.currentTime)
}

export type PlayJingleOptions = {
  /**
   * 播放前要不要掐掉正在放的小曲（默认要）。**排期「接续上一首」时必须传 false**：
   * GAME OVER 小曲按死亡小曲的剩余时长排期，排期那一刻不能把死亡小曲停掉——
   * 否则原版「先听完死亡小曲」的节奏就变成了「死亡小曲放一半被掐」（`game.ts`）。
   */
  interrupt?: boolean
}

/**
 * 放一首小曲：按需停掉上一首，再从头发起这一首（不循环）。
 *
 * `delaySeconds > 0` 时先排期、到点再放——GAME OVER 小曲要等死亡小曲收尾。
 * 排期期间 `playingJingle()` 报的是**已排期**的那一首，便于自动检查断言。
 *
 * 音乐开关关着时什么都不放（与 `MusicPlayer.playTrack` 的判断一致）；排期途中把开关
 * 关掉也会**取消**还没开播的那一首（见底部订阅）。
 * `play()` 的 Promise 可能被浏览器拒绝（没有用户手势时），与上游 `void audio.play()`
 * 一样直接忽略——本游戏的按钮是「必须点一下才开始」，正常路径上不会遇到。
 */
export function playJingle(
  name: JingleName,
  delaySeconds = 0,
  { interrupt = true }: PlayJingleOptions = {},
) {
  if (interrupt) {
    stopJingle()
  }

  if (!musicEnabled()) {
    return
  }

  if (delaySeconds > 0) {
    // 用于「上一首放完再接着放」：GAME OVER 小曲要等死亡小曲收尾（原版也是先听完
    // 死亡小曲才出现 GAME OVER 画面）。`currentName` 立刻更新，这样调试探针读到的
    // 就是「已排期」的那一首。
    currentName = name
    pending = setTimeout(() => {
      pending = null
      // 到点后再复查一次开关：排期途中关掉音乐的话，这里已经由订阅把 currentName 清掉了。
      if (currentName === name && musicEnabled()) {
        start(name)
      }
    }, delaySeconds * 1000)
    return
  }

  start(name)
}

function start(name: JingleName) {
  const audio = new Audio(JINGLES[name])
  audio.loop = false
  current = audio
  currentName = name

  audio.addEventListener('ended', () => {
    if (current === audio) {
      current = null
      currentName = null
    }
  })

  void audio.play().catch(() => undefined)
}

// ---------------------------------------------------------------- 星星音乐（无敌星主题曲）
// 与小曲同属「跨关卡播放器」，所以放在同一个模块里。星星音乐是**循环**的，
// 由 `traits/StarPower` 在吃到无敌星时起播、效果结束时停掉并恢复关卡主题曲。

let starAudio: HTMLAudioElement | null = null

/** 起播无敌星音乐（循环）。音乐开关关着时不放；重复调用先停上一遍。 */
export function playStarTheme() {
  stopStarTheme()

  if (!musicEnabled()) {
    return
  }

  starAudio = new Audio('/audio/music/starman.ogg')
  starAudio.loop = true
  void starAudio.play().catch(() => undefined)
}

/** 停掉无敌星音乐（幂等）。 */
export function stopStarTheme() {
  if (starAudio) {
    starAudio.pause()
    starAudio = null
  }
}

// 开关变化时同步两路播放：关掉就全部静音（并取消还没开播的排期），
// 重新打开把已经开播的接着放——排期中的那首不复活（与原版「关了就不响」一致）。
onMusicEnabledChange((enabled) => {
  if (!enabled) {
    if (pending !== null) {
      clearTimeout(pending)
      pending = null
    }
    if (current && !current.paused) {
      current.pause()
    }
    if (starAudio && !starAudio.paused) {
      starAudio.pause()
    }
    return
  }

  if (current) {
    void current.play().catch(() => undefined)
  }
  if (starAudio) {
    void starAudio.play().catch(() => undefined)
  }
})
