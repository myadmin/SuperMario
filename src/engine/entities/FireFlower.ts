/**
 * entities/FireFlower.ts —— 本项目新增：问号块里钻出来的火花（Fire Flower）。
 *
 * 与蘑菇一样，素材里没有这张图（`public/sprites/` 下 14 张精灵表都没有道具），所以
 * 16x16 的图形在运行时用 Canvas2D 现画，颜色取自 `tiles.png` 的调色板。
 *
 * 行为按原版 SMB：
 *   1. **钻出**：和蘑菇共用 `traits/Emerging`——锁住速度、只画方块顶边以上的部分，
 *      0.5s 冒完一个身位；
 *   2. **原地不动**：火花不像蘑菇那样走路，钻出后就停在方块顶上（没有 `Physics`，
 *      所以既不受重力也不做瓦片碰撞），并且按原版那样不断闪烁（两套调色板轮换）；
 *   3. **吃掉**：马里奥碰到它 → 变成火力形态（`PowerState.empower()`，小马里奥吃到
 *      也直接变成大号火力形态）+1000 分 → 火花消失。
 *
 * 什么时候出火花、什么时候出蘑菇由 `features/chanceBlock.ts` 决定：问号块顶开时
 * **小马里奥出蘑菇、大 / 火力马里奥出火花**（原版规则）。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import Killable from '../traits/Killable'
import Player from '../traits/Player'
import PowerState from '../traits/PowerState'
import Emerging, { drawEmergingItem } from '../traits/Emerging'
import { POWER_UP_CONSUME_SOUND } from '../fxSounds'

/** 与方块同格：16x16。 */
const SIZE = 16

/** 吃道具的分数（原版 +1000）。 */
const POWER_UP_SCORE = 1000

/** 闪烁间隔（秒）：原版火花会不停换调色板，看起来像在发光。 */
const FLASH_INTERVAL = 0.12

/** 16x16 像素图（`. ` 透明、P 花瓣、W 内圈、C 花心、G 茎叶），每行必须 16 个字符。 */
const FLOWER_ART = [
  '....PPPPPPPP....',
  '..PPPPWWWWPPPP..',
  '.PPPWWWWWWWWPPP.',
  '.PPWWWCCCCWWWPP.',
  '.PPWWCCCCCCWWPP.',
  '.PPWWCCCCCCWWPP.',
  '.PPPWWWWWWWWPPP.',
  '..PPPPWWWWPPPP..',
  '....PPPPPPPP....',
  '......GGGG......',
  '.....GGGGGG.....',
  '..GGGGGGGGGGGG..',
  '.GGGGGGGGGGGGGG.',
  '..GGGGGGGGGGGG..',
  '.....GGGGGG.....',
  '......GGGG......',
]

/**
 * 两套调色板来回换，就是原版火花的闪烁效果。
 * 橙色 `#e79c21` / 红色 `#d82800` / 白 `#fcfcfc` 都取自 `tiles.png`，绿色是水管绿。
 */
const FLOWER_PALETTES: Array<Record<string, string>> = [
  { P: '#e79c21', W: '#fcfcfc', C: '#d82800', G: '#1b9d00' },
  { P: '#d82800', W: '#e79c21', C: '#fcfcfc', G: '#1b9d00' },
]

/** 把像素图画进一张 16x16 离屏 canvas（每套调色板只建一次）。 */
function buildSprite(palette: Record<string, string>) {
  const buffer = document.createElement('canvas')
  buffer.width = SIZE
  buffer.height = SIZE

  const context = buffer.getContext('2d')!
  FLOWER_ART.forEach((row, y) => {
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

const sprites: HTMLCanvasElement[] = []

function getSprite(frame: number) {
  const index = frame % FLOWER_PALETTES.length
  if (!sprites[index]) {
    sprites[index] = buildSprite(FLOWER_PALETTES[index])
  }
  return sprites[index]
}

/**
 * 被马里奥吃到：变成火力形态 + 加分 + 消失。
 *
 * 与蘑菇一致，钻出期间不吃——否则马里奥贴着方块底边顶它时，两者包围盒会在火花还没
 * 冒出来之前就重叠，玩家只会看到分数 +1000 却看不到火花。
 */
class FlowerPickup extends Trait {
  collides(us: Entity, them: Entity) {
    if (us.getTrait(Killable).dead || !them.traits.has(Player)) {
      return
    }

    const emerging = us.getTrait(Emerging)
    if (emerging && !emerging.done) {
      return
    }

    const power = them.getTrait(PowerState)
    if (power) {
      power.empower(them)
    }

    them.getTrait(Player).score += POWER_UP_SCORE
    // 原版吃道具会冒「1000」白字（位置在马里奥身上）。
    them
      .getTrait(Player)
      .pushScorePopup(them.bounds.getCenter().x, them.bounds.top - 4, '1000')
    them.sounds.add(POWER_UP_CONSUME_SOUND)
    us.getTrait(Killable).kill()
  }
}

/**
 * 造一朵从 `(x, blockTop)` 这个方块里钻出来的火花。
 * `blockTop` 是方块的顶边 y（`Match.y1`）。
 */
export function createFireFlowerEntity(x: number, blockTop: number) {
  const flower = new Entity()
  flower.size.set(SIZE, SIZE)
  flower.pos.set(x, blockTop)

  const emerging = new Emerging()
  emerging.targetY = blockTop - SIZE

  const killable = new Killable()
  killable.removeAfter = 0

  flower.addTrait(emerging)
  flower.addTrait(killable)
  flower.addTrait(new FlowerPickup())

  flower.draw = (context) => {
    if (killable.dead) {
      return
    }

    // 闪烁：按 `lifetime` 在两套调色板之间切。钻出期间同样在闪（原版也是）。
    const frame = Math.floor(flower.lifetime / FLASH_INTERVAL)
    drawEmergingItem(context, getSprite(frame), flower, emerging, blockTop, SIZE)
  }

  return flower
}
