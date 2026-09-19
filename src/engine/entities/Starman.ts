/**
 * entities/Starman.ts —— 本项目新增：无敌星（Super Star）。
 *
 * 素材里没有星星贴图（`public/sprites/` 下 14 张精灵表都没有，蘑菇 / 火花同款情况），
 * 所以 16x16 的图形照例在运行时用 Canvas2D 现画，颜色取自 `tiles.png` 的调色板，
 * 两帧轮换当「闪光」。出处：问号块 / 砖块里顶出（本项目由 `levelPatches.ts` 的
 * `bricks` 内容表决定哪几格砖出星，1-1 是第 101 列那块砖，与 NES 版一致）。
 *
 * 行为按原版 SMB：
 *   1. **钻出**：与蘑菇 / 火花共用 `traits/Emerging`——0.5s 从方块里冒出来，
 *      期间只画方块顶边以上的部分、不可拾取；
 *   2. **弹跳前进**：以 60px/s 水平移动，每次落地以约 2 格高的弹跳继续
 *      （原版星星落地就弹，永不停）；撞墙掉头（复用 `PendulumMove` +
 *      `Solid`）；掉出画面底部就删除；
 *   3. **拾取**：马里奥碰到它 → 无敌（`traits/StarPower`）+1000 分 → 星星消失。
 *
 * **为什么反弹不能写在 `obstruct` 里**：与火球同一个坑（见 `entities/Fireball.ts`
 * 文件头的完整分析）——`TileCollider.checkY` 会把同一行的每一格瓦片挨个交给处理器，
 * 在 `obstruct` 里翻速度会污染同一行的第二格。所以 `obstruct` 只记 `landed`，
 * 真正的反弹放到 `update`（整轮瓦片扫描结束后）里做。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Killable from '../traits/Killable'
import PendulumMove from '../traits/PendulumMove'
import Physics from '../traits/Physics'
import Solid from '../traits/Solid'
import Player from '../traits/Player'
import StarPower from '../traits/StarPower'
import Emerging, { drawEmergingItem } from '../traits/Emerging'
import { Sides, type Side } from '../Entity'
import { POWER_UP_CONSUME_SOUND } from '../fxSounds'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 与方块同格：16x16。 */
const SIZE = 16

/** 水平移动速度（px/s）：原版星星跑得不快，追得上也容易错过。 */
const WALK_SPEED = 60

/** 落地反弹后的竖直速度（向上，px/s）：约 2 格高。 */
const BOUNCE_SPEED = 260

/** 吃到无敌星的分数（原版 +1000）。 */
const STAR_SCORE = 1000

/** 16x16 像素图（`.` 透明、Y 星体、K 眼睛、W 高光），两帧轮换当闪光。 */
const STAR_ART = [
  [
    '.......YY.......',
    '......YYYY......',
    '......YYYY......',
    '.YYYYYYYYYYYYYY.',
    '..YYYYYYYYYYYY..',
    '...YYYYYYYYYY...',
    '...YKYYYYYYKY...',
    '...YKYYYYYYKY...',
    '...YYYYYYYYYY...',
    '..YYYYYYYYYYYY..',
    '..YYYYY..YYYYY..',
    '.YYYY......YYYY.',
    '.YY..........YY.',
    'YYY..........YYY',
    'YY............YY',
    '................',
  ],
  [
    '.......WW.......',
    '......YYYY......',
    '......YYYY......',
    '.YYYYYYYYYYYYYY.',
    '..YYYYYYYYYYYY..',
    '...YYYYYYYYYY...',
    '...YKYYYYYYKY...',
    '...YKYYYYYYKY...',
    '...YYYYYYYYYY...',
    '..YYYYYYYYYYYY..',
    '..YYYYY..YYYYY..',
    '.YYYY......YYYY.',
    '.YY..........YY.',
    'YYYY........YYYY',
    'YY............YY',
    '................',
  ],
]

/** NES 调色板：星体黄、眼睛黑、高光白。 */
const STAR_PALETTE: Record<string, string> = {
  Y: '#fcbc3c',
  K: '#000000',
  W: '#fcfcfc',
}

function buildSprite(art: string[]) {
  const buffer = document.createElement('canvas')
  buffer.width = SIZE
  buffer.height = SIZE

  const context = buffer.getContext('2d')!
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = STAR_PALETTE[row[x]]
      if (!color) {
        continue
      }
      context.fillStyle = color
      context.fillRect(x, y, 1, 1)
    }
  })

  return buffer
}

const sprites: HTMLCanvasElement[] = []

function getSprite(frame: number) {
  const index = frame % STAR_ART.length
  if (!sprites[index]) {
    sprites[index] = buildSprite(STAR_ART[index])
  }
  return sprites[index]
}

/** 弹跳：落地后按固定速度弹起（反弹在 `update` 里做，见文件头说明）。 */
class Bounce extends Trait {
  /** 这一帧落到了瓦片上（`Solid` 已把 vel.y 归零）。 */
  private landed = false

  obstruct(_entity: Entity, side: Side) {
    if (side === Sides.BOTTOM) {
      this.landed = true
    }
  }

  update(entity: Entity, { deltaTime }: GameContext, level: Level) {
    if (this.landed) {
      this.landed = false
      // Physics 这一帧已经先加过一次重力，这里补回来，与「就地赋值 -BOUNCE_SPEED」等价。
      entity.vel.y = -BOUNCE_SPEED + level.gravity * deltaTime
    }

    // 掉出画面底部（坑）就删掉——星星不会自己回来。
    if (entity.bounds.top > 240) {
      level.entities.delete(entity)
    }
  }
}

/**
 * 被马里奥吃到：无敌（`traits/StarPower`）+ 1000 分 + 消失。
 * 钻出期间不可拾取（与蘑菇 / 火花同一条规则）。
 */
class StarPickup extends Trait {
  collides(us: Entity, them: Entity) {
    if (us.getTrait(Killable).dead || !them.traits.has(Player)) {
      return
    }

    const emerging = us.getTrait(Emerging)
    if (emerging && !emerging.done) {
      return
    }

    const player = them.getTrait(Player)
    player.score += STAR_SCORE
    player.pushScorePopup(them.bounds.getCenter().x, them.bounds.top - 4, '1000')
    them.getTrait(StarPower).start()
    them.sounds.add(POWER_UP_CONSUME_SOUND)
    us.getTrait(Killable).kill()
  }
}

/**
 * 造一颗从 `(x, blockTop)` 这个方块里钻出来的无敌星。
 * `blockTop` 是方块的顶边 y（`Match.y1`）：星星从方块的格子里开始，往上钻一个身位。
 */
export function createStarmanEntity(x: number, blockTop: number) {
  const star = new Entity()
  star.size.set(SIZE, SIZE)
  star.pos.set(x, blockTop)

  const emerging = new Emerging()
  emerging.targetY = blockTop - SIZE
  // 钻完才开始走动 + 弹跳（钻出期间速度被锁成 0）。
  emerging.onDone = (entity) => {
    entity.getTrait(PendulumMove).enabled = true
  }

  const walk = new PendulumMove()
  walk.speed = WALK_SPEED
  walk.enabled = false

  const killable = new Killable()
  killable.removeAfter = 0

  star.addTrait(emerging)
  star.addTrait(new Physics())
  // 顺序要紧：Solid 先贴面并归零速度，Bounce 再决定弹起（与 Fireball 同构）。
  star.addTrait(new Solid())
  star.addTrait(walk)
  star.addTrait(new Bounce())
  star.addTrait(killable)
  star.addTrait(new StarPickup())

  star.draw = (context) => {
    if (killable.dead) {
      return
    }

    // 闪光：按 `lifetime` 在两帧之间切，钻出期间同样在闪。
    const frame = Math.floor(star.lifetime / 0.12)
    drawEmergingItem(context, getSprite(frame), star, emerging, blockTop, SIZE)
  }

  return star
}
