/**
 * 特性：瓦片行为修正 —— 把上游关卡 JSON 里写错的瓦片行为在加载时改正。
 *
 * 上游把一批「砖」的 behavior 写成了 `ground`，于是砖块只是实心块：顶上去毫无反应，
 * 大马里奥也顶不碎——实测报告「1-2 砖块顶不动」。按原版 SMB，`bricks` / `bricks-top`
 * 样式全部是可顶 / 可碎的砖（`tiles/brick.ts` 的 `brick` 行为：小马里奥弹一下、
 * 大马里奥碎掉、内容砖出货；内容砖表 `blockContents` 只认坐标不认样式，不受影响）。
 * 全关卡的审计结果是：
 *
 *   - `bricks → ground`：1-2、2-4、coin-room-1..5
 *   - `bricks-top → ground`：2-1、3-1
 *   - 本来就对的可能忽略不计：1-1（`bricks-top → brick`）与 debug-level（`bricks → brick`）
 *
 * 于是这里把这两个样式的 behavior 统一设回 `brick`。对已经正确的关卡再设一遍是
 * 幂等的，没有副作用；`public/` 逐字节不改，修正只发生在内存里的 tile 对象上。
 *
 * **只改上游明确标了实心的砖**（behavior 为 `ground` 或 `brick`），behavior 缺省的
 * `bricks` 一律不动——城堡图案（`castle-small` / `castle-wall-*` / `castle-large`，
 * 见 `public/sprites/patterns/overworld-pattern.json`）的墙正是 `bricks` 样式、
 * 但没有 behavior：它们是**非实心的背景装饰**，马里奥要能「走进城堡」（收尾序列的
 * 自动走位一直走到门洞里）。实测教训：无条件转换曾把它们变成实心墙，马里奥被挡在
 * 城堡门口，通关序列永远走不完。
 *
 * 为什么在共享 tile 对象上直接改 behavior、而不是像 `consumeBlock` 那样换新对象：
 * `loaders/level.ts` 的 `expandTiles` 对**同一段 range 的所有格子复用同一个 tile 对象**
 * （1-2 的 `[39,1,7,3]` 就是 7×3 格共享一个对象），在这上面改 `behavior` 会整段 range
 * 一起生效——**这正是想要的**：一整段砖都是砖，不存在「这段里某一格不是砖」的情况。
 * 反倒是换外观 / 单格行为（问号块顶完变实心）才需要逐格写新对象，那里怕的就是连坐。
 */
import { registerLevelFeature } from '../levelFeatures'

/** 按原版 SMB 是「砖」的样式：可顶 / 可碎（`tiles/brick.ts` 注册的 `brick` 行为）。 */
const BRICK_STYLES = new Set(['bricks', 'bricks-top'])

registerLevelFeature({
  name: 'tile-behaviors',
  setup(_level, ctx) {
    for (const grid of ctx.grids) {
      grid.matrix.forEach((tile) => {
        if (
          tile &&
          BRICK_STYLES.has(tile.style) &&
          (tile.behavior === 'ground' || tile.behavior === 'brick')
        ) {
          tile.behavior = 'brick'
        }
      })
    }
  },
})
