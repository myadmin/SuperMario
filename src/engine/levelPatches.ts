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
 *   - **不放扫描得出来的东西**。旗杆位置（顶球瓦片）、城堡门（`castle-arch`）都是
 *     **从关卡数据里定位**的，不在这里重复声明。例外是隐藏块：上游按底层瓦片存它，
 *     「这格是隐藏块」从数据里看不出来（1-1 全图唯一一枚 `metal` 恰好是它、其余关卡
 *     的 metal 全是可见块），只能显式登记——所以 `hiddenBlocks` 是白名单兼内容表；
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

/**
 * 隐藏奖励室的管道（`features/bonusRooms.ts` 消费）。一对管分两头声明：
 *
 *   - **入口管**（dir DOWN，站上管口按 ↓）：`goesTo` 进奖励室，`backTo` 是**本关**
 *     返程出口实体的 id。接线方式对照上游自己的权威样例 `public/levels/debug-pipe.json`
 *     （入口 portal 挂 `goesTo + backTo`，出口 portal 只挂 `id`）：game.ts 的
 *     EVENT_PIPE_COMPLETE 处理器在**奖励室发出 EVENT_COMPLETE** 时重载本关并
 *     `connectEntity(backTo 实体)`，马里奥从那根管子里钻出来——所以奖励室那头的
 *     portal 恰恰**不能带 goesTo**（带了会在奖励室里直接切回 1-1 出生点、永不钻管）。
 *   - **出口管**（dir UP）：只声明 `id`。`Pipe.collides` 要求旅行者的
 *     `PipeTraveller.direction` 等于 UP——行走 / 跳跃 / 按 ↑ 都不会凑出这个状态
 *     （它只在 connectEntity 直接 addTraveller 时被置上），所以立在地上不会被误触发。
 */
export type BonusPipePatch = {
  /** 管口顶左格（管帽那行；管口占 [x, x+1] 两列）。 */
  mouth: BlockCell
  /** 进管方向：DOWN＝站管口按 ↓ 进（入口），UP＝backTo 钻出来（出口），
   *  RIGHT＝从左侧走进管口（奖励室的返程横管）。 */
  dir: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'
  /** 门户盒：相对管口顶左格左上角的偏移与尺寸（像素）。 */
  portal: { offsetX: number; offsetY: number; width: number; height: number }
  /** 入口管：进哪一关。 */
  goesTo?: string
  /** 入口管：返程时马里奥从**本关**哪个实体钻出（该实体的 id）。 */
  backTo?: string
  /** 出口管：本实体的 id，供奖励室那头的 backTo 引用。 */
  id?: string
}

/**
 * upstream 已经在关卡 JSON 里放好的奖励室返程 portal 的**碰撞盒校正**
 * （`features/bonusRooms.ts` 消费）。JSON 一字不改，只在运行时按距离找到该实体、
 * 把位置 / 尺寸改成大马里奥也能触发的值（props 不动，理由见各条数据的注释）。
 */
export type BonusPortalFix = {
  /** 现成实体的 JSON pos（像素），按距离匹配（同 exitPipe.hasPortal 的 32/48 容差）。 */
  match: [number, number]
  /** 校正后的位置与尺寸（像素）。 */
  pos: [number, number]
  size: [number, number]
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
   * 隐藏块的**白名单 + 内容表**。规则：**只有这里显式登记的格子才是隐藏块**（且仅当
   * 该格确实是 `metal` / `metal-alt` 样式，转换在 `features/chanceBlock.ts`），其余
   * `metal` / `metal-alt` 保持 JSON 原样——它们是原版里的可见实心块 / 装饰块（1-2 的
   * 六枚、3-1 的悬浮块、coin-room 的结构块都曾因旧的全局规则「每个 metal 都是隐藏块」
   * 被错误隐藏）。这张表同时是「顶出来是什么」的数据源：白名单语义与内容语义合并在
   * 同一张表是合理的——「藏不藏」与「出什么」是同一枚块的两面。
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
  /** 隐藏奖励室的进 / 出管道（每条一根管，见 BonusPipePatch 的接线说明）。 */
  bonusPipes?: BonusPipePatch[]
  /** upstream 已放好的奖励室返程 portal 的碰撞盒校正（不改 JSON）。 */
  bonusPortalFixes?: BonusPortalFix[]
  /**
   * 本项目新增：进关时**从入口水管里钻出来**（portal 的 id，须为 dir UP 的 bonusPipes）。
   *
   * 背景：1-2 结尾横管通向 uw-exit（地下出口），原版里马里奥是**从那边的管子里升上来**
   * 的；而 `bootstrapPlayer` 只会把马里奥摆到检查点（站在管口边上）。「出生钻管」由
   * `features/bonusRooms.ts` 消费：注入 UP portal 后，关卡第一帧把马里奥
   * `connectEntity` 上去，向上插值一个管高、从管口钻出站稳。
   */
  spawnThroughPortal?: string
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
    // 第 64 列第 8 行那枚孤零零的 `metal` 就是原版的隐藏 1-UP 块（与 NES 版位置一致，
    // 出处 `_backup/js/level.js` 的 `Hidden 1-UP Block (at col 64, row 8)`）。
    // 这也是 `hiddenBlocks` 白名单里目前唯一登记的格子——「metal = 隐藏块」只对 1-1
    // 成立，其余关卡的 metal 是原版的可见实心块 / 装饰块，保持 JSON 原样。
    hiddenBlocks: [{ x: 64, y: 8, content: 'oneup' }],
    // 内容砖（坐标出处：用户早年那版 `_backup/js/level.js` 的 build1_1 字符地图，
    // 它把多金币砖标在 [9][94]、星块标在 [101]，与上游 JSON 里砖块的实际位置吻合——
    // 1-1.json 的 bricks-top 段 `[94,9]` 与 `[100,2,9]` 正是这两格；星块取右面那格，
    // 与 NES 版 1-1「低砖对右面那块出星」一致）。
    bricks: [
      { x: 94, y: 9, content: 'coins10' },
      { x: 101, y: 9, content: 'star' },
    ],
    // 隐藏金币奖励室（coin-room-1）的进 / 出管。出处：用户早年那版 _backup/js/level.js
    // 的 build1_1——`placePipe(57, 4, true, '1-1-sub', 40, 160)`（第 57 列 4 格高管可进，
    // 通向地下奖励室）与 `placePipe(163, 2)`（第 163 列 2 格高管是奖励室的返程出口），
    // 与真实 SMB 1-1 布局一致。1-1.json 里两根管的瓦片都在（pipe-4h 放 [57,9]、
    // pipe-2h 放 [163,11]，管口顶分别在 y=144 / y=176，管口各占两列），只是 portal
    // 实体没进 JSON，这里补上。
    //
    // 门户盒计算（`Pipe.collides` 对竖直方向要求马里奥**左右边都落在门户内**；能否
    // 触发还要求 BoundingBox 严格重叠，即马里奥的盒必须真压进门户盒）：
    //   - 入口：管口占 x 912..944，门户取同宽 32、正好罩住两格管口——双脚都踩在管口
    //     上（左缘 ≥912、右缘 ≤944）必落在门户内；贴在管壁外侧站时必有一边越界，
    //     不会误触发。y 方向：站在管口上的马里奥脚底 y=144（Solid 会把脚精确钉在
    //     瓦片顶，重叠判断是严格大于，所以门户顶必须高于 144），取 144-16=128、高 32
    //     （罩到 y 160）——小马里奥（16 高，y 128..144）与大马里奥（32 高，y 112..144）
    //     都与之重叠；按下 ↓ 触发后向下插值门户高 32＝沉两格，视觉正好没入管口。
    //   - 出口：门户罩住两格管身（x 2608..2640，y 176..208）。connectEntity 会把
    //     马里奥对中到门户、底边对齐门户底边（y 208，管内），再向上插值门户高 32，
    //     正好停在管口顶（y 176）站稳。UP 方向不会被行走误触发（见 BonusPipePatch）。
    bonusPipes: [
      {
        mouth: { x: 57, y: 9 },
        dir: 'DOWN',
        goesTo: 'coin-room-1',
        backTo: 'bonus-exit-1-1',
        portal: { offsetX: 0, offsetY: -16, width: 32, height: 32 },
      },
      {
        mouth: { x: 163, y: 11 },
        dir: 'UP',
        id: 'bonus-exit-1-1',
        portal: { offsetX: 0, offsetY: 0, width: 32, height: 32 },
      },
    ],
    nextLevel: '1-2',
  },
  // 返程出口：coin-room-1.json 的 entities 里 upstream 已经放了一个 pipe-portal
  // （pos [206,184]，props 只有 {dir:'RIGHT'}，**没有 goesTo**）——这正是上游
  // debug-pipe.json 里「奖励室出口」的标准形态：不带 goesTo 的 portal 走完管程后，
  // game.ts 的 EVENT_PIPE_COMPLETE 处理器会把它转成本关的 EVENT_COMPLETE，触发来时
  // 入口管 backTo 登记的返程监听。所以 props 一个字都不用改，**不能**给它加
  // goesTo/backTo（加了会在奖励室里直接切回 1-1 出生点、永不钻管，见 bonusRooms.ts
  // 文件头）。唯一的问题在碰撞盒：管口脸（pipe-insert-hor-top / -bottom，behavior
  // ground）占 col 13 / row 11~12（y 176..208），大马里奥贴墙站时身体 y 176..208，
  // 顶边 176 < 门户顶 184，`Pipe.collides` 的横向检查直接 return——大马里奥出不了
  // 门。校正成 y 176、高 48（同 exitPipe.ts 修 1-2 结尾横管的思路）：小 / 大 / 蹲姿
  // 都罩住。该实体在 JSON 里没有 id，setupEntities 会把它押进 Spawner（相机靠近才
  // 放出），特性模块翻押运名单找到它再校正，见 features/bonusRooms.ts。
  'coin-room-1': {
    bonusPortalFixes: [{ match: [206, 184], pos: [206, 176], size: [24, 48] }],
  },
  // coin-room-2（1-2 的奖励室）：JSON 里没有返程 portal（entities 为空），这里按它的
  // 出口管口注入一个 RIGHT portal——管口瓦片是 exit-pipe-12h 图案的 pipe-cap-hor，
  // 落在 (13,11)（y 176~192），管脸左侧即触发区。portal 盒照 coin-room-1 校正后的
  // 尺寸（24×48、罩到地面），小 / 大马里奥贴墙站立都命中。不带 goesTo：走完管程转为
  // 本关 EVENT_COMPLETE，由来时 1-2 入口管的 backTo 接管返程（从 109 列管钻出）。
  'coin-room-2': {
    bonusPipes: [
      {
        mouth: { x: 13, y: 11 },
        dir: 'RIGHT',
        portal: { offsetX: -8, offsetY: 0, width: 24, height: 48 },
      },
    ],
  },
  // —— 以下奖励室关卡**无权威出处，未接** ——
  // _backup/js/level.js 里只有 1-1 一间地下奖励室（build1_1_sub，即本项目的
  // coin-room-1），其余奖励关没有任何「哪根管通向它 / 它通向哪」的记载，不发明：
  //   - coin-room-2..5：结构与 coin-room-1 类似（都有 exit-pipe-12h 出口管、
  //     检查点 [24,48]），但 entities 全空（连 pipe-portal 都没有），且无出处；
  //   - uw-entrance：地下管道入口的过场关（pipe-uw-entrance 图案），无出处；
  //   - coin-clouds-1：云端奖励关，连管道图案都没有，无出处。
  '1-2': {
    // 原版的隐藏金币块：1-2.json 里 6 枚 `metal` 中悬浮在半空的 5 枚
    // （[29,8] / [46,7] / [69,8] / [73,8] / [150,8]，都在头部起跳可顶的高度）——
    // 在原版里它们**不可见**，顶开才现身并出金币（用户实测报告「有些砖还没顶就
    // 不能顶了」：它们此前被渲染成用过的实心块、顶不了）。唯一例外是 [89,2]：
    // 它嵌在天花板（rows 2~3）里，是天花板的结构瓦片，保持可见（见 43ec7f2 的教训）。
    hiddenBlocks: [
      { x: 29, y: 8, content: 'coin' },
      { x: 46, y: 7, content: 'coin' },
      { x: 69, y: 8, content: 'coin' },
      { x: 73, y: 8, content: 'coin' },
      { x: 150, y: 8, content: 'coin' },
    ],
    // 原版 1-2 的奖励室管道对（三连管 col 103 / 109 / 115，高 3 / 4 / 2）：
    // **中间最高的 4 格管可进**（站上按 ↓，进 coin-room-2）——用户实测指认
    // （站上中间管按 ↓ 无反应）；返程后**从右边最矮的 2 格管里钻出来**继续往右走。
    // 接法与 1-1 的奖励室一致（入口挂 goesTo + backTo，出口只挂 id）；
    // coin-room-2 的返程 portal 注入见下方 'coin-room-2'。左侧的 3 格管是装饰，不接。
    bonusPipes: [
      {
        mouth: { x: 109, y: 9 },
        dir: 'DOWN',
        goesTo: 'coin-room-2',
        backTo: '1-2-bonus-exit',
        portal: { offsetX: 0, offsetY: -16, width: 32, height: 32 },
      },
      {
        mouth: { x: 115, y: 11 },
        dir: 'UP',
        id: '1-2-bonus-exit',
        portal: { offsetX: 0, offsetY: 0, width: 32, height: 32 },
      },
    ],
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
  // 原版里马里奥是从入口水管里**升上来**的（管子在本关左端 col 3，pipe-2h）——
  // bootstrapPlayer 只会把他摆到检查点（管口边上），这里补「出生钻管」：
  // 注入 UP portal（id uw-exit-entry）+ spawnThroughPortal 让 bonusRooms 在
  // 关卡第一帧把他 connectEntity 上去、从管口钻出。
  'uw-exit': {
    bonusPipes: [
      {
        mouth: { x: 3, y: 11 },
        dir: 'UP',
        id: 'uw-exit-entry',
        portal: { offsetX: 0, offsetY: 0, width: 32, height: 32 },
      },
    ],
    spawnThroughPortal: 'uw-exit-entry',
    nextLevel: '1-3',
  },
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
