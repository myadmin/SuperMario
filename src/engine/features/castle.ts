/**
 * 特性：走进城堡通关
 *
 * 上游 1-1 的结尾有城堡（`castle-small` 图案放在 [202, 8]，其中的 `castle-opening`
 * 子图案把 `castle-arch` 门放在相对 [2, 3]，即 col 204 / row 11，门洞里是
 * `tile-black`），但 1-1 的关卡 JSON 里 `triggers` 是空数组，所以马里奥走进城堡
 * 什么也不会发生。
 *
 * 本模块负责：扫描出 `castle-arch` 门，在门洞上放一个触发实体。触发后**不再直接切关**
 * （那样马里奥会瞬间消失、过关小曲被掐断），而是启动 `features/exitSequence.ts` 的
 * 通关收尾序列：自动走到门正中 → 消失 → 剩余时间换分 → 等收尾小曲放完 → 才切下一关。
 *
 * 序列有两个入口：
 *   - 城堡门触发（本文件：马里奥自己走进门洞，城堡关 / 玩家跳过旗杆直接进门都算）；
 *   - 旗杆滑到底（`features/flag.ts` 发 EVENT_FLAG_SLIDE_DONE，本文件监听后接管——
 *     原版抓杆落地后马里奥自动向右走进城堡）。
 * 两路都经 `startExitSequence` 的「每关一次」兜底，不会叠加。
 */
import { registerLevelFeature, findTiles } from '../levelFeatures'
import Entity from '../Entity'
import Trigger from '../traits/Trigger'
import { patchFor } from '../levelPatches'
import { FINIAL_STYLES, EVENT_FLAG_SLIDE_DONE } from './flag'
import { startExitSequence } from './exitSequence'
import type { JingleName } from '../jingle'

/** 城堡门瓦片的样式名（`castle-opening` 图案里唯一的那格）。 */
const ARCH_STYLES = ['castle-arch']

/**
 * 本项目新增：挑出「真正的终点城堡」。
 *
 * 一关里可能有多座城堡，`findFirstTile` 取最靠左的那枚会挑错：1-3 的城堡门在
 * col 2 / 157 / 159 / 161（起点那座是装饰），而 1-3 的检查点正好是 (40,192)，
 * 于是马里奥一出生就站在 (2,11) 那扇门的触发区里，**1-3 开场就被跳过直接进 1-4**。
 *
 * 原版的规矩是「旗杆（右侧）后面那座城堡」，所以这里改成：**取旗杆右侧最近的一枚**；
 * 没有旗杆的关卡退回取最靠右的一枚（终点城堡总在关卡右端）。
 */
function pickExitArch(
  arches: ReturnType<typeof findTiles>,
  finials: ReturnType<typeof findTiles>,
) {
  if (arches.length === 0) {
    return undefined
  }

  const pole = finials.sort((a, b) => a.indexX - b.indexX)[0]
  const sorted = arches.slice().sort((a, b) => a.indexX - b.indexX || a.indexY - b.indexY)

  if (pole) {
    const afterPole = sorted.find((arch) => arch.indexX > pole.indexX)
    if (afterPole) {
      return afterPole
    }
  }

  return sorted[sorted.length - 1]
}

/**
 * 触发区尺寸（像素）。上游 `setupTriggers()` 用 64x64，那是给 JSON 里远离玩家的
 * 关卡入口用的；门口用 64 会在马里奥还没走到城堡时就过关，所以这里只覆盖门洞：
 * 宽一格（16），高覆盖拱门 + 黑洞两格（16 + 16）。
 */
const DOOR_WIDTH = 16
const DOOR_HEIGHT = 32

registerLevelFeature({
  name: 'castle',
  setup(level, ctx) {
    // 有些关卡没有城堡（coin-* / debug-* 等），找不到门就跳过。
    const arches = ARCH_STYLES.flatMap((style) => findTiles(ctx.grids, style))
    const finials = FINIAL_STYLES.flatMap((style) => findTiles(ctx.grids, style))
    const arch = pickExitArch(arches, finials)
    if (!arch) {
      return
    }

    const next = patchFor(ctx.name).nextLevel
    if (!next) {
      return
    }

    // 收尾序列入参：门正中、下一关、交给 game.ts 的触发 spec（与 `setupTriggers()`
    // 里上游构造的同形）、收尾小曲。城堡关放 castle-clear，其余放 level-clear
    // （旗杆关的 level-clear 由 flag.ts 在滑到底时起播，序列不会重复起播）。
    const options = {
      doorX: arch.x + DOOR_WIDTH / 2,
      nextLevel: next,
      spec: { type: 'goto' as const, name: next, pos: [arch.x, arch.y] as [number, number] },
      jingle: (ctx.spec.musicSheet === 'castle' ? 'castle-clear' : 'level-clear') as JingleName,
    }

    const trigger = new Trigger()
    // 马里奥走进门洞后会连续多帧停留在触发区内，而收尾序列是异步推进的。
    // 不加锁的话会重复启动序列，这里用一次性的闭包标志兜住
    //（序列本身还有「每关一次」的第二道兜底）。
    let fired = false
    trigger.conditions.push((_entity, _touches, _gc, lvl) => {
      if (fired) {
        return
      }
      fired = true
      startExitSequence(lvl, options)
    })

    const entity = new Entity()
    entity.addTrait(trigger)
    entity.size.set(DOOR_WIDTH, DOOR_HEIGHT)
    entity.pos.set(arch.x, arch.y)
    level.entities.add(entity)

    // 旗杆滑到底（原版：抓杆落地后马里奥自动走进城堡）也走同一条收尾序列。
    // 没有旗杆的关卡（城堡关）这个事件不会发生，只走上面的门触发。
    level.events.listen(EVENT_FLAG_SLIDE_DONE, () => {
      startExitSequence(level, options)
    })
  },
})
