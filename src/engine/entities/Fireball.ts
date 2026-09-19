/**
 * entities/Fireball.ts —— 本项目新增：火力马里奥发射的火球。
 *
 * 上游完全没有这个实体（也没有火力形态），8x8 的图形和蘑菇一样在运行时用 Canvas2D
 * 现画，颜色取自 `tiles.png` 的调色板（红圈 + 橙身 + 白心，两帧轮换当旋转）。
 *
 * 行为按原版 SMB / 用户早年那版实现的参数：
 *   - 以 250px/s 沿发射方向飞出，初速带一点下坠，落到地面时**弹起**（约 1.5 格高）；
 *   - 撞到墙（左右）就消失，撞到天花板则丢掉竖直速度往下落；
 *   - 碰到敌人把它**打翻**（`traits/Flipped` 的 `flipKill`），火球自己同时消失
 *     （原版也是一发一个）；
 *   - **不吃道具、不碰马里奥**：本项目的道具用 `Killable.removeAfter = 0`、马里奥是
 *     `Infinity`，所以这里只打 `removeAfter > 0` 的实体（也就是敌人）；
 *   - 飞出画面或活过 4 秒就消失；同时在场的火球最多 2 枚（由 `traits/Fire.ts` 控制）。
 *
 * 瓦片碰撞复用上游的 `Physics` + `Solid`：`Solid` 把火球贴回瓦片表面，紧跟其后的
 * `Fireball` 行为再根据撞到的方向决定「弹起 / 消失」——所以 trait 顺序不能调换
 * （`Solid` 必须排在 `Fireball` 前面，否则归零速度会发生在贴面之前）。
 *
 * **为什么反弹不能写在 `obstruct` 里**（本项目修正）：
 * `TileCollider.checkY` 一次会把这个高度上**同一行的每一格瓦片**挨个交给处理器，而
 * `tiles/ground.ts` 这类处理器是**每格重新读一次 `entity.vel.y`** 来判断这是「落地」还是
 * 「顶天花板」的。原来的写法在 `obstruct(BOTTOM)` 里就地把竖直速度翻成 -280，于是同一行
 * 的**第二格**瓦片读到的已经是负速度、被当成天花板：`Solid` 把 `bounds.top` 贴到那格瓦片
 * 的**底边**，火球被瞬移进地面 / 砖墙内部（一次 24px 起），紧接着横向碰撞把它判死；
 * 如果它落点正好压在格子边界上躲过了横判，下一次反弹又会被同一机制推得更深——连着几帧
 * 楔在墙里，看起来就是「子弹掉进墙里、弹不出来」。
 *
 * 现在 `obstruct` 只记一个 `landed`，真正的反弹放到 `update`（Physics 已跑完、整轮瓦片
 * 扫描也结束了）里做：扫描期间竖直速度保持 `Solid` 归零后的 0，第二格瓦片什么都不会做。
 *
 * **为什么命中判定放在 `update` 里而不是 `collides` 里**（本项目修正）：
 * `Level.update()` 一帧的顺序是「所有实体 update」→「所有实体两两碰撞」→「finalize」。
 * 如果命中判定放在 `collides`（碰撞阶段），它和「敌人撞到马里奥」是同一轮里的两件事，
 * 谁先谁后只取决于实体在集合里的插入顺序 —— 而马里奥永远排在新生成的火球前面，
 * 于是近距离对射时会出现「火球在这一帧打死了它、它在同一帧里也打死了马里奥」。
 * 放到 `update` 里（Physics 之后、所有碰撞检测之前）就没有这个问题：命中一旦发生，
 * 被命中者在本帧剩下的时间里已经是 `killed` 状态，任何碰撞检测都“到不了它“。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Killable from '../traits/Killable'
import Physics from '../traits/Physics'
import Solid from '../traits/Solid'
import Player from '../traits/Player'
import { flipKill } from '../traits/Flipped'
import { Sides, type Side } from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 火球 8x8（原版尺寸）。 */
export const FIREBALL_SIZE = 8

const SIZE = FIREBALL_SIZE

/** 水平速度（px/s）。 */
const SPEED = 250

/** 落地反弹后的竖直速度（向上，px/s）：配合关卡重力 1500 大约跳起 1.5 格。 */
const BOUNCE_SPEED = 280

/** 初速的竖直分量（向下，px/s）：出膛时略往下，像被抛出去。 */
const MUZZLE_VY = 100

/** 存活时长上限（秒）。 */
const LIFE = 4

/** 两帧轮换当作旋转（原版是 4 帧，这里够用且更省）。 */
const SPIN_INTERVAL = 0.06

/** 8x8 像素图（`. ` 透明、R 红圈、O 橙身、W 白心）。 */
const FIREBALL_ART = [
  [
    '..RRRR..',
    '.ROOOOR.',
    'ROOWWOOR',
    'ROWWOORR',
    'ROWWOORR',
    'ROOWWOOR',
    '.ROOOOR.',
    '..RRRR..',
  ],
  [
    '..RRRR..',
    '.ROOOOR.',
    'ROOOWWOR',
    'ROOWWOOR',
    'ROOWWOOR',
    'ROOOWWOR',
    '.ROOOOR.',
    '..RRRR..',
  ],
]

const FIREBALL_PALETTE: Record<string, string> = {
  R: '#d82800',
  O: '#e79c21',
  W: '#fcfcfc',
}

function buildSprite(art: string[]) {
  const buffer = document.createElement('canvas')
  buffer.width = SIZE
  buffer.height = SIZE

  const context = buffer.getContext('2d')!
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = FIREBALL_PALETTE[row[x]]
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
  const index = frame % FIREBALL_ART.length
  if (!sprites[index]) {
    sprites[index] = buildSprite(FIREBALL_ART[index])
  }
  return sprites[index]
}

/**
 * 火球行为：反弹、撞墙消失、打死敌人。
 * 也是「场上现有几枚火球」的标记（`traits/Fire.ts` 靠 `entities` 里有没有这个 trait 来数）。
 */
export default class Fireball extends Trait {
  /** 已经该消失了（本帧 update 里从关卡实体集合删掉）。 */
  dead = false

  /** 还能活多久（秒）。 */
  life = LIFE

  /** 这一帧落到了瓦片上（`Solid` 已把 vel.y 归零），真正的弹起在本帧的 `update` 里。 */
  private landed = false

  obstruct(_entity: Entity, side: Side) {
    if (side === Sides.LEFT || side === Sides.RIGHT) {
      this.dead = true
    } else if (side === Sides.BOTTOM) {
      // 落地：**不在这里改速度**（见文件头「为什么反弹不能写在 obstruct 里」）。
      this.landed = true
    }
    // 顶到天花板：`Solid` 已经把 vel.y 归零，接下来自然下落，不用做任何事。
  }

  /**
   * 这一发火球能不能打死 `them`。
   *
   * 判据是「带 Killable 且 `removeAfter > 0`」：道具（蘑菇 / 火花）也有 Killable，但它
   * 们的 `removeAfter = 0`（吃到才消失），马里奥是 `Infinity`，两种都不该被火球干掉。
   * 已经判死（`killed`）/ 已经死了（`dead`）的不再重复打 —— 否则一发火球会浪费在尸体上。
   */
  private canHit(them: Entity) {
    if (them.traits.has(Player)) {
      return false
    }

    const killable = them.getTrait(Killable)
    return !!killable && killable.removeAfter > 0 && !killable.killed && !killable.dead
  }

  /**
   * 命中判定（在 `update` 里跑，见文件头）：谁跟我重叠、我还活着，就打翻谁。
   */
  private checkHits(entity: Entity, level: Level) {
    if (this.dead) {
      return
    }

    level.entities.forEach((candidate) => {
      if (this.dead || candidate === entity) {
        return
      }

      if (entity.bounds.overlaps(candidate.bounds) && this.canHit(candidate)) {
        flipKill(candidate)
        this.dead = true
      }
    })
  }

  update(entity: Entity, { deltaTime }: GameContext, level: Level) {
    if (this.dead) {
      level.entities.delete(entity)
      return
    }

    // 落地反弹（见文件头）：Physics 这一帧已经先加过一次重力，这里补回来，弹起的
    // 竖直初速与「就地赋值 -BOUNCE_SPEED」时完全等价。
    if (this.landed) {
      this.landed = false
      entity.vel.y = -BOUNCE_SPEED + level.gravity * deltaTime
    }

    // Physics 已经先按这一帧的速度把火球挪到位了，所以这里的重叠就是「这一帧打中了谁」。
    this.checkHits(entity, level)
    if (this.dead) {
      level.entities.delete(entity)
      return
    }

    this.life -= deltaTime

    const camera = level.camera
    const offscreen =
      entity.bounds.right < camera.pos.x - SIZE ||
      entity.bounds.left > camera.pos.x + camera.size.x + SIZE ||
      entity.bounds.top > 240

    if (this.life <= 0 || offscreen) {
      level.entities.delete(entity)
    }
  }
}

/**
 * 造一枚从 `(x, y)` 出发、朝 `direction`（+1 右 / -1 左）飞的火球。
 * `x` / `y` 是火球的左上角。
 */
export function createFireballEntity(x: number, y: number, direction: number) {
  const fireball = new Entity()
  fireball.size.set(SIZE, SIZE)
  fireball.pos.set(x, y)
  fireball.vel.set(direction * SPEED, MUZZLE_VY)

  fireball.addTrait(new Physics())
  // 顺序要紧：Solid 先把火球贴回瓦片表面并归零速度，Fireball 再决定弹起还是消失。
  fireball.addTrait(new Solid())
  fireball.addTrait(new Fireball())

  fireball.draw = (context) => {
    const frame = Math.floor(fireball.lifetime / SPIN_INTERVAL)
    context.drawImage(getSprite(frame), 0, 0)
  }

  return fireball
}
