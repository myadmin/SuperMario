/**
 * 特性：旗杆上的旗子
 *
 * 上游的 `flag-pole-green` 图案只有「顶球 + 杆 + 底座」三个 tile，整个素材库里
 * 没有任何旗子贴图（已 grep 全部 14 个精灵表确认）。因此旗子需要在运行时生成。
 *
 * 本模块负责：
 *   1. 在关卡里扫描顶球 tile（`pole-finial-green` / `pole-finial-dark-grey`）定位旗杆；
 *   2. 注入上游缺失的旗杆实体，让 `Pole` trait 生效（1-1 的 JSON 里没有 `flag-pole` 实体）；
 *   3. 用一个独立实体在杆上画旗子（旗子是 Canvas2D 现画的，不是贴图）；
 *   4. 有人抓杆时，让旗子沿杆以 `Pole.velocity` 的速度下滑到底座上方。
 *
 * 本项目新增（音频）：抓杆即停主题曲（原版如此），滑到底之后起播过关小曲——
 * 地表关用 `level-clear.ogg`，城堡关（`musicSheet` 为 `castle`）用 `castle-clear.ogg`。
 * 抓杆那一声（`flagpole.ogg`）由 `entities/FlagPole.ts` 挂的音效板负责。
 *
 * 上游图案 `flag-pole-*` 的布局（图案局部坐标）：
 *   顶球 row 0、杆 row 1..9、底座（chocolate）row 10。1-1 把图案放在 [198, 2]，
 *   于是顶球 row 2、杆 rows 3..11、底座 row 12。
 */
import { registerLevelFeature, findTiles } from '../levelFeatures'
import type { LevelGrid } from '../levelFeatures'
import Entity from '../Entity'
import Trait from '../Trait'
import Pole from '../traits/Pole'
import LevelTimer from '../traits/LevelTimer'
import Player from '../traits/Player'
import { createFlagPoleEntity } from '../entities/FlagPole'
import { playJingle, type JingleName } from '../jingle'
import { findPlayers } from '../player'
import type GameContext from '../GameContext'
import type Level from '../Level'

/**
 * 本项目新增：旗杆滑到底的事件。`features/castle.ts` 监听它来启动通关收尾序列
 * （原版：抓杆落地后马里奥自动向右走进城堡）。
 */
export const EVENT_FLAG_SLIDE_DONE = Symbol('flag slide done')

/** 上游图案里顶球的样式；1-1 是绿色，其它关卡可能用深灰（见 overworld-pattern.json）。 */
export const FINIAL_STYLES = ['pole-finial-green', 'pole-finial-dark-grey']

/** 上游图案里底座（chocolate）相对顶球的行偏移：顶球 row 0、底座 row 10。 */
const BASE_ROW_OFFSET = 10

/** 旗子尺寸（像素），与顶球 / 杆同属 16px 网格。 */
const FLAG_WIDTH = 16
const FLAG_HEIGHT = 16

/** 旗子下滑速度，与 `Pole.velocity` 保持一致。 */
const FLAG_VELOCITY = 100

/** NES 调色板。 */
const FLAG_GREEN = '#00a800'
const FLAG_WHITE = '#ffffff'
const FLAG_OUTLINE = '#000000'

type FinialHit = {
  /** 世界像素坐标（格子左上角） */
  x: number
  y: number
  indexX: number
  indexY: number
  /** 该格子所在网格的 tileSize */
  tileSize: number
}

/** 扫描所有网格，找最靠左的旗杆顶球（与 `findFirstTile` 同序）。 */
function findFinial(grids: LevelGrid[]): FinialHit | undefined {
  const hits: FinialHit[] = []
  for (const grid of grids) {
    grid.matrix.forEach((tile, indexX, indexY) => {
      if (!tile || !FINIAL_STYLES.includes(tile.style)) {
        return
      }
      hits.push({
        x: indexX * grid.tileSize,
        y: indexY * grid.tileSize,
        indexX,
        indexY,
        tileSize: grid.tileSize,
      })
    })
  }
  return hits.sort((a, b) => a.indexX - b.indexX || a.indexY - b.indexY)[0]
}

/**
 * 底座（chocolate）的像素 y。取同一列、顶球下方最近的一个 chocolate tile；
 * 找不到时退回上游图案的固定偏移（顶球 + 10 行）。
 */
function findBaseY(grids: LevelGrid[], finial: FinialHit): number {
  const base = findTiles(grids, 'chocolate')
    .filter((tile) => tile.indexX === finial.indexX && tile.indexY > finial.indexY)
    .sort((a, b) => a.indexY - b.indexY)[0]
  return base ? base.y : (finial.indexY + BASE_ROW_OFFSET) * finial.tileSize
}

/** 本项目新增：用 Canvas2D 现画的三角旗（竖直边贴杆，向右收成尖角）。 */
function drawFlag(context: CanvasRenderingContext2D) {
  context.beginPath()
  context.moveTo(1, 1)
  context.lineTo(FLAG_WIDTH - 1, FLAG_HEIGHT / 2)
  context.lineTo(1, FLAG_HEIGHT - 1)
  context.closePath()

  context.fillStyle = FLAG_GREEN
  context.fill()

  context.strokeStyle = FLAG_OUTLINE
  context.lineWidth = 1
  context.stroke()

  // 靠杆一侧加一道白色高光，贴近 NES 原版旗子的双色感。
  context.fillStyle = FLAG_WHITE
  context.fillRect(2, 3, 2, FLAG_HEIGHT - 6)
}

/**
 * 本项目新增：每帧推进旗子下滑。
 *
 * 只读 `Pole` 的公开 `travellers`，不改上游 trait。旗子跟随第一个 traveller 的
 * 高度，但只允许向下、且速度不超过 `Pole.velocity`——这样抓杆瞬间旗子不会瞬移，
 * 而是从杆顶平滑滑到底座上方。
 */
class FlagSlide extends Trait {
  pole!: Entity
  flag!: Entity
  /** 旗子顶部的初始 y（杆顶）。 */
  topY = 0
  /** 旗子顶部能达到的最大 y（底座上方）。 */
  bottomY = 0

  /** 本项目新增（音频）：过关小曲的曲名（由 `setup` 按本关的 musicSheet 选定）。 */
  jingle: JingleName = 'level-clear'

  /** 抓到杆了吗（抓到的那一刻停主题曲）。 */
  private grabbed = false
  /** 过关小曲已经起播了吗（只放一次）。 */
  private cleared = false

  update(_entity: Entity, { deltaTime }: GameContext, level: Level) {
    const pole = this.pole.getTrait(Pole)

    let targetY: number | undefined
    for (const state of pole.travellers.values()) {
      targetY = state.current.y - FLAG_HEIGHT

      if (!this.grabbed) {
        // 原版：抓住旗杆的瞬间主题曲就停，之后是抓杆音效 + 滑到底的过关小曲。
        this.grabbed = true
        level.music.pause()
        this.onGrabbed(level, state.current.y)
      }

      if (state.done && !this.cleared) {
        // 滑到底（`Pole` 的 travellers 里 state.done）＝原版起播过关小曲的时刻：
        // 马里奥从杆上下来、往城堡走的那段。
        this.cleared = true
        playJingle(this.jingle)
        // 本项目新增：通知 castle.ts 启动通关收尾序列（自动走进城堡 → 时间结算 →
        // 小曲放完 → 切关）。
        level.events.emit(EVENT_FLAG_SLIDE_DONE)
      }

      break
    }
    if (targetY === undefined) {
      return
    }

    const clamped = Math.min(Math.max(targetY, this.topY), this.bottomY)
    const current = this.flag.pos.y
    if (clamped <= current) {
      return
    }
    this.flag.pos.y = Math.min(current + FLAG_VELOCITY * deltaTime, clamped)
  }

  /**
   * 本项目新增：抓杆瞬间的两件事（都是原版规则）——
   *   1. **冻结关卡计时**：TIME 停止倒走（`traits/LevelTimer.frozen`）；
   *   2. **按抓杆高度计分**：从底到顶 100 / 400 / 800 / 2000 / 5000 五档，
   *      分数冒在旗杆上（原版会在旗杆处显示得分）。
   */
  private onGrabbed(level: Level, grabY: number) {
    for (const playerEntity of findPlayers(level.entities)) {
      playerEntity.getTrait(LevelTimer).frozen = true

      const player = playerEntity.getTrait(Player)
      const poleHeight = this.bottomY + FLAG_HEIGHT - this.topY
      // grabY 是抓杆那一刻马里奥的脚底：0 = 杆顶，1 = 杆底。五档等分，
      // 顶档给 5000（原版要跳过杆顶才拿得到，这里贴近杆顶即可）。
      const t = Math.min(1, Math.max(0, (grabY - this.topY) / poleHeight))
      const points = t < 0.12 ? 5000 : t < 0.36 ? 2000 : t < 0.6 ? 800 : t < 0.84 ? 400 : 100
      player.score += points
      player.pushScorePopup(this.pole.bounds.meridian, grabY - 16, String(points))
    }
  }
}

registerLevelFeature({
  name: 'flag',
  setup(level, ctx) {
    const finial = findFinial(ctx.grids)
    if (!finial) {
      return
    }

    const poleX = finial.x
    const poleTop = finial.y + finial.tileSize
    const poleBottom = findBaseY(ctx.grids, finial)
    const meridian = poleX + finial.tileSize / 2

    // 1) 注入旗杆实体：让 Pole trait 生效（上游 1-1 的 JSON 里没有 flag-pole 实体）。
    //    size(8,144) + offset(4,0) → left=3172、meridian=3176，正好是杆的中心线。
    const pole = createFlagPoleEntity()
    pole.pos.set(poleX, poleTop)
    pole.size.y = poleBottom - poleTop
    level.entities.add(pole)

    // 2) 旗子单独一个实体，pos 就是旗子左上角。
    //    精灵层的 buffer 只有 64x64 且以实体 pos 为原点，所以不能和 144px 高的杆共用实体。
    const flag = new Entity()
    flag.size.set(0, 0)
    flag.pos.set(meridian, poleTop)
    flag.draw = (context) => drawFlag(context)
    level.entities.add(flag)

    // 3) 代理实体每帧推进旗子下滑（参考 loaders/level.ts 的 Spawner 写法）。
    const slide = new FlagSlide()
    slide.pole = pole
    slide.flag = flag
    slide.topY = poleTop
    slide.bottomY = poleBottom - FLAG_HEIGHT
    // 本项目新增（音频）：过关小曲按关卡类型选。注意城堡关的图案里没有旗杆，
    // 过关走的是 `features/exitSequence.ts` 的门触发（那里起播 castle-clear）；
    // 这里实际只会放 level-clear——保留按 musicSheet 的选择作为兜底。
    slide.jingle = ctx.spec.musicSheet === 'castle' ? 'castle-clear' : 'level-clear'
    const animator = new Entity()
    animator.addTrait(slide)
    level.entities.add(animator)
  },
})
