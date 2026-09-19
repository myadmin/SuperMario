/**
 * levelPatches.ts —— 本项目新增：**按关卡声明的「关卡补丁表」**。
 *
 * 背景：本项目的硬性约定是 `public/` 下的关卡 JSON 一字不改，而原版关卡里若干「这一格是
 * 什么 / 通向哪里」的信息根本没进 JSON——上游移植时把它们丢了。于是这些信息只能由代码补，
 * 而补它的人（各个特性模块）各自在文件顶层放了一张 `Record<关卡名, 数据>` 的表：
 *
 *   - 哪个问号块装道具、隐藏块顶出来是什么  → `features/chanceBlock.ts`
 *   - 升降桥放在哪                        → `features/lift.ts`
 *   - 结尾横管通向哪一关                  → `features/exitPipe.ts`
 *   - 走进城堡门之后去哪一关              → `features/castle.ts`
 *
 * 结果就是「**关卡内容散在五个文件里**」：想知道 1-2 有什么，得把 features/ 全翻一遍，
 * 而且新增一关内容要同时改好几个模块。本模块把这几张表收拢成一份**按关卡聚合的声明**：
 *
 * ```ts
 * patchFor('1-2') // => { powerUpBlocks, lifts, exitPipes, nextLevel }
 * ```
 *
 * 约定（有意为之）：
 *   - **只放数据，不放行为**。「怎么扫瓦片找管口」「怎么把 3 格 `metal` 拼成桥」属于实现，
 *     留在各自的特性模块里；
 *   - **不放扫描得出来的东西**。旗杆位置（顶球瓦片）、城堡门（`castle-arch`）、隐藏块本身
 *     （关卡数据里的 `metal` 瓦片）都是**从关卡数据里定位**的，不在这里重复声明；
 *   - 缺省值一律是「什么都不加」：`patchFor()` 对没登记的关卡返回空表，特性模块照旧跳过。
 */
import type { LiftSpec } from './entities/Lift'

/** 一个方块格子（关卡网格坐标，不是像素）。 */
export type BlockCell = {
  x: number
  y: number
}

/** 隐藏块顶出来的东西。 */
export type HiddenContent = 'oneup' | 'coin'

/** 隐藏块的内容声明（缺省的隐藏块出金币）。 */
export type HiddenBlockPatch =
  | (BlockCell & { content: 'oneup' })
  | (BlockCell & { content: 'coin' })

/** 砖块内容（`tiles/brick.ts` 消费）：多金币砖 / 星块。 */
export type BrickContent = 'coins10' | 'star'

/** 结尾横管的声明：按管口瓦片注入一个 `pipe-portal`。 */
export type ExitPipePatch = {
  /** 管口瓦片的样式名（用来定位管口）。 */
  mouthStyles: string[]
  /** 管口朝向：马里奥按这个方向走进管口。 */
  dir: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN'
  /** 去到哪一关。 */
  goesTo: string
  /** 门户区域：相对管口瓦片左上角的偏移与尺寸（像素）。 */
  portal: { offsetX: number; offsetY: number; width: number; height: number }
}

/** 一关的补丁。缺省字段＝这一关没有这类内容。 */
export type LevelPatch = {
  /**
   * 装道具的问号块（网格坐标）。出什么由马里奥当时的状态决定：
   * **小 → 变大蘑菇，大 / 火力 → 火花**（原版规则，见 `features/chanceBlock.ts`）。
   * 表里没有的问号块一律出金币。
   */
  powerUpBlocks?: BlockCell[]
  /**
   * 隐藏块的内容。**隐藏块本身不需要声明**——关卡数据里每个 `metal` 瓦片都是隐藏块
   * （原版把它们按底层瓦片存了下来），这里只声明「顶出来是什么」，缺省出金币。
   */
  hiddenBlocks?: HiddenBlockPatch[]
  /**
   * 内容砖（`tiles/brick.ts` + `blockContents.ts` 消费）：哪几格砖里装着东西。
   * 内容砖谁顶都出货、顶完变已使用块，**永远不碎**（原版：装东西的砖不可破坏）。
   */
  bricks?: Array<BlockCell & { content: BrickContent }>
  /** 升降桥（每台一条）。外观与往返逻辑在 `entities/Lift` + `traits/Lift`。 */
  lifts?: LiftSpec[]
  /** 结尾横管（每条声明对应一种管口瓦片）。 */
  exitPipes?: ExitPipePatch[]
  /**
   * 走进终点城堡门之后去哪一关。**没登记就不注入触发**（`coin-*` / `debug-*` 这类子关
   * 本来就不该被推进表带着跑，否则 `startWorld()` 会去加载不存在的关卡）。
   * 最后 7-3 循环回 1-1。
   */
  nextLevel?: string
  /**
   * 禁用关卡 JSON 里上游自带的 `goto` 触发器。
   *
   * 背景：上游没有「世界推进」的概念，个别关卡的 JSON 里放了一个 `goto` 触发器当
   * 关卡出口用（1-2 的在 (64,64)，写死回 1-1）。本项目的推进表接管了这些出口
   * （1-2 走注入的结尾横管 → uw-exit → 1-3），这些遗留触发器反而成了陷阱：
   * 它们就在出生坠落路径边上，玩家起跳就能碰到，会把人莫名拽回 1-1。
   * 登记了这一项的关卡，`loaders/level.ts` 会跳过 JSON 里的触发器。
   */
  disableUpstreamTriggers?: boolean
}

/**
 * 关卡内容表。坐标一律是**关卡网格坐标**（列 / 行），像素换算由各特性模块自己做。
 *
 * 每条数据后面都留了「为什么是这个值」的出处（原版关卡的实际布局 / 上游数据本身），
 * 因为这些信息在关卡 JSON 里已经不存在了，改的时候需要能核对。
 */
const LEVEL_PATCHES: Record<string, LevelPatch> = {
  '1-1': {
    // 原版 1-1 的三枚装道具的问号块（第 109 列在第 5、9 行各一枚）：
    // 用户早年那版 `_backup/js/level.js` 里写的就是 `tx === 16 || tx === 78 || tx === 109`。
    powerUpBlocks: [
      { x: 16, y: 9 },
      { x: 78, y: 9 },
      { x: 109, y: 5 },
      { x: 109, y: 9 },
    ],
    // 第 64 列第 8 行那枚孤零零的 `metal` 就是原版的隐藏 1-UP 块（与 NES 版位置一致）。
    hiddenBlocks: [{ x: 64, y: 8, content: 'oneup' }],
    // 内容砖（坐标出处：用户早年那版 `_backup/js/level.js` 的 build1_1 字符地图，
    // 它把多金币砖标在 [9][94]、星块标在 [101]，与上游 JSON 里砖块的实际位置吻合——
    // 1-1.json 的 bricks-top 段 `[94,9]` 与 `[100,2,9]` 正是这两格；星块取右面那格，
    // 与 NES 版 1-1「低砖对右面那块出星」一致）。
    bricks: [
      { x: 94, y: 9, content: 'coins10' },
      { x: 101, y: 9, content: 'star' },
    ],
    nextLevel: '1-2',
  },
  '1-2': {
    // 开场那排 5 枚问号块（col 10~14）只有第一枚装道具——原版：
    // "five ? Blocks. The first one contains a Magic Mushroom or Fire Flower,
    //  the other four ones contain coins"。
    powerUpBlocks: [{ x: 10, y: 9 }],
    lifts: [
      // 第一道坑（col 138~144）：贴着左边缘一站（col 139~141），从最高处开始下行。
      { x: 139 * 16, top: 80, bottom: 13 * 16, width: 3, startAt: 'top' },
      // 第二道坑（col 153~159）：同样贴着左边缘（col 154~156），从最低处开始上行。
      { x: 154 * 16, top: 80, bottom: 13 * 16, width: 3, startAt: 'bottom' },
    ],
    exitPipes: [
      {
        // 管口在 col 166 / row 8（x 2656 / y 128）。门户往左挪一格罩住嘴前那一格，
        // 高度 48（row 7~9）让大马里奥（32px）也装得下。
        mouthStyles: ['pipe-insert-hor-top'],
        dir: 'RIGHT',
        goesTo: 'uw-exit',
        portal: { offsetX: -16, offsetY: -16, width: 24, height: 48 },
      },
    ],
    // 上游 JSON 里有个写死回 1-1 的 goto 触发器（(64,64)，就在出生坠落路径边上）——
    // 上游时代的 1-2「出口」替身。本项目 1-2 的出口是上面的结尾横管，禁用它。
    disableUpstreamTriggers: true,
    nextLevel: '1-3',
  },
  // 原版 1-2 结尾管子通向的「地下出口」关：那边有旗杆 + 城堡，过关后接着走 1-3。
  'uw-exit': { nextLevel: '1-3' },
  '1-3': { nextLevel: '1-4' },
  '1-4': { nextLevel: '2-1' },
  '2-1': { nextLevel: '2-2' },
  '2-2': { nextLevel: '2-3' },
  '2-3': { nextLevel: '2-4' },
  '2-4': { nextLevel: '3-1' },
  '3-1': { nextLevel: '5-3' },
  '5-3': { nextLevel: '7-2' },
  '7-2': { nextLevel: '7-3' },
  '7-3': { nextLevel: '1-1' },
}

/** 没有登记的关卡共用这一张空表（不要就地改它）。 */
const NO_PATCH: LevelPatch = {}

/** 取某关的补丁表；没登记过的关卡返回空表。 */
export function patchFor(levelName: string): LevelPatch {
  return LEVEL_PATCHES[levelName] ?? NO_PATCH
}

/** 已登记补丁的关卡名（调试 / 校验用）。 */
export function patchedLevels(): string[] {
  return Object.keys(LEVEL_PATCHES)
}
