/**
 * entities/Mushroom.ts —— 本项目新增：方块里钻出来的蘑菇（变大蘑菇 / 加命蘑菇）。
 *
 * 上游完全没有道具系统：`public/sprites/` 下 14 个精灵表逐个确认过，没有蘑菇（也没有
 * 火花 / 星星）贴图，所以 16x16 的图形像旗子（`features/flag.ts`）一样在运行时用
 * Canvas2D 现画，颜色取 `tiles.png` 的调色板。
 *
 * 两种蘑菇共用同一张像素图，只有伞盖颜色不同——这正是原版的做法：
 *   - `power-up`（红伞）：马里奥变大 + 1000 分，由问号块顶出；
 *   - `one-up`（绿伞，颜色取水管绿 `#1b9d00`）：只加一条命、不加分，由隐藏块顶出
 *     （见 `levelPatches.ts` 里各关的 `hiddenBlocks` 声明）。
 *
 * 行为按原版 SMB：
 *   1. 从方块内部往上钻出来 —— 钻出期间不做瓦片碰撞（把速度锁成 0，Physics 在速度为 0
 *      时直接返回），并且只画方块顶边以上的部分，看起来才像从方块里冒出来。
 *      这段位移与裁剪与火花共用（`traits/Emerging`）；
 *   2. 钻出来后向右走（撞墙掉头、走出平台会掉下去），重力与瓦片碰撞复用上游
 *      `Physics` + `Solid` + `PendulumMove`；
 *   3. 马里奥碰到它就吃掉，蘑菇消失（`Killable.removeAfter = 0`，下一帧从关卡里移除）。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Killable from '../traits/Killable'
import PendulumMove from '../traits/PendulumMove'
import Physics from '../traits/Physics'
import PowerState from '../traits/PowerState'
import Solid from '../traits/Solid'
import Player from '../traits/Player'
import Emerging, { drawEmergingItem } from '../traits/Emerging'
import { POWER_UP_CONSUME_SOUND } from '../fxSounds'

/** 蘑菇与方块同格：16x16。 */
const SIZE = 16

/** 走路速度（px/s）：原版道具比敌人慢，玩家来得及追。 */
const WALK_SPEED = 45

/** 吃变大蘑菇的分数（原版 +1000；加命蘑菇不加分）。 */
const POWER_UP_SCORE = 1000

/** NES 调色板（取自 `public/img/tiles.png` 的实际像素）：红伞 / 水管绿 / 白斑 / 奶油色菌柄 / 黑眼睛。 */
const CAP_COLOR = '#d82800'
const ONE_UP_CAP_COLOR = '#1b9d00'
const SPOT_COLOR = '#fcfcfc'
const STEM_COLOR = '#fcbc74'
const EYE_COLOR = '#000000'

/** 两种蘑菇。 */
export type MushroomKind = 'power-up' | 'one-up'

/** 16x16 像素图（`. ` 透明、R 伞盖、W 白斑、C 菌柄、K 眼睛），每行必须 16 个字符。 */
const MUSHROOM_ART = [
  '................',
  '.....RRRRRR.....',
  '...RRRRRRRRRR...',
  '..RRWWWRRWWWRR..',
  '.RRWWWWRRWWWWRR.',
  '.RWWWWWRRWWWWWR.',
  '.RWWWWWRRWWWWWR.',
  '..RWWWWRRWWWWR..',
  '..RRRRRRRRRRRR..',
  '..CCCCCCCCCCCC..',
  '.CCCCCCCCCCCCCC.',
  '.CCKKCCCCCCKKCC.',
  '.CCKKCCCCCCKKCC.',
  '.CCCCCCCCCCCCCC.',
  '..CCCCCCCCCCCC..',
  '................',
]

const PALETTES: Record<MushroomKind, Record<string, string>> = {
  'power-up': {
    R: CAP_COLOR,
    W: SPOT_COLOR,
    C: STEM_COLOR,
    K: EYE_COLOR,
  },
  'one-up': {
    R: ONE_UP_CAP_COLOR,
    W: SPOT_COLOR,
    C: STEM_COLOR,
    K: EYE_COLOR,
  },
}

/** 把像素图画进一张 16x16 离屏 canvas（每种蘑菇只建一次，之后每帧都是 drawImage）。 */
function buildSprite(kind: MushroomKind) {
  const palette = PALETTES[kind]
  const buffer = document.createElement('canvas')
  buffer.width = SIZE
  buffer.height = SIZE

  const context = buffer.getContext('2d')!
  MUSHROOM_ART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]]
      if (!color) {
        continue
      }
      context.fillStyle = color
      context.fillRect(x, y, 1, 1)
    }
  })

  return buffer
}

const sprites: Partial<Record<MushroomKind, HTMLCanvasElement>> = {}

function getSprite(kind: MushroomKind) {
  let sprite = sprites[kind]
  if (!sprite) {
    sprite = buildSprite(kind)
    sprites[kind] = sprite
  }
  return sprite
}

/**
 * 被马里奥吃到：变大加 1000 分 / 加一条命，然后消失。
 *
 * 钻出期间不吃：蘑菇还没冒出方块，只在方块那一格里，玩家碰不到它。否则马里奥贴着
 * 方块底边顶它时，两者包围盒会重叠（方块底边 160 vs 蘑菇起始底边 160），蘑菇会在
 * 「钻出来之前」就被吃掉 —— 玩家只会看到分数 +1000、马里奥变大，却看不到蘑菇。
 */
class MushroomPickup extends Trait {
  kind: MushroomKind = 'power-up'

  collides(us: Entity, them: Entity) {
    if (us.getTrait(Killable).dead || !them.traits.has(Player)) {
      return
    }

    // 还在往上钻：这一帧不可拾取（下一次碰撞检测就会正常生效）。
    const emerging = us.getTrait(Emerging)
    if (emerging && !emerging.done) {
      return
    }

    const player = them.getTrait(Player)

    if (this.kind === 'one-up') {
      // 原版的 1-UP：只加一条命（命数在关卡开头的 "MARIO ×N" 页与 GAME OVER 结算里可见），
      // 不加分；音效由 `Player.addLives` 播放。
      player.addLives(1)
      us.getTrait(Killable).kill()
      return
    }

    const power = them.getTrait(PowerState)
    if (power) {
      power.grow(them)
    }

    player.score += POWER_UP_SCORE
    // 原版吃道具会冒「1000」白字（位置在马里奥身上）。
    player.pushScorePopup(them.bounds.getCenter().x, them.bounds.top - 4, '1000')
    them.sounds.add(POWER_UP_CONSUME_SOUND)
    us.getTrait(Killable).kill()
  }
}

/**
 * 造一个从 `(x, blockTop)` 这个方块里钻出来的蘑菇。
 * `blockTop` 是方块的顶边 y（`Match.y1`）：蘑菇从方块的格子里开始，往上钻一个身位。
 */
export function createMushroomEntity(x: number, blockTop: number, kind: MushroomKind = 'power-up') {
  const mushroom = new Entity()
  mushroom.size.set(SIZE, SIZE)
  mushroom.pos.set(x, blockTop)

  const emerging = new Emerging()
  emerging.targetY = blockTop - SIZE
  // 钻完之后才开走动（钻出期间速度被锁成 0，`PendulumMove.enabled = false` 只是双保险）。
  emerging.onDone = (mushroom) => {
    mushroom.getTrait(PendulumMove).enabled = true
  }

  const walk = new PendulumMove()
  walk.speed = WALK_SPEED
  walk.enabled = false

  const killable = new Killable()
  killable.removeAfter = 0

  const pickup = new MushroomPickup()
  pickup.kind = kind

  mushroom.addTrait(emerging)
  mushroom.addTrait(new Physics())
  mushroom.addTrait(new Solid())
  mushroom.addTrait(walk)
  mushroom.addTrait(killable)
  mushroom.addTrait(pickup)

  mushroom.draw = (context) => {
    if (killable.dead) {
      return
    }

    drawEmergingItem(context, getSprite(kind), mushroom, emerging, blockTop, SIZE)
  }

  return mushroom
}

/** 本项目新增：加命蘑菇（绿伞），供隐藏块顶出。 */
export function createOneUpMushroomEntity(x: number, blockTop: number) {
  return createMushroomEntity(x, blockTop, 'one-up')
}
