/**
 * 特性：上下往返的平台（升降桥）
 *
 * 原版 1-2 的结尾有两道 **7 格宽（112px）** 的坑。马里奥最快也只能跳约 105px，
 * 所以这两道坑在原版里是靠**会上下移动的平台**过去的——攻略的描述是
 * 「some lifts will be rising and falling; the first one moves down while the
 * right one moves up」。上游移植版没有任何会动的平台，关卡 JSON 里也没有平台
 * 实体（`public/levels/1-2.json` 只有瓦片与敌人），于是 1-2 到那两道坑就没法过了：
 * 玩家会卡在第二关里出不去。
 *
 * 本模块按「坑的位置」把平台补上——坐标是**从关卡数据本身推出来的**（坑的左右
 * 边缘、地面高度、天花板高度），左右两台一降一升（与原版描述一致）：
 *
 *   - 第一道坑：地面在 col 137 结束、col 145 恢复 → 坑 = col 138~144（x 2208~2320）
 *   - 第二道坑：地面在 col 152 结束、col 160 恢复 → 坑 = col 153~159（x 2448~2560）
 *
 * 每台 3 格宽（48px）、行程从地面高度（y 208）到天花板下方一格（y 80）。
 * 原版确切的速度/行程没有记录在关卡数据里，这里取的是能稳稳跳上跳下的值。
 *
 * **桥的位置表已经搬去 `engine/levelPatches.ts` 的 `lifts`**：本模块只负责把表里的
 * 每一台变成实体，不再自己带关卡数据。其它关卡要加桥，往那张表里补一条即可。
 */
import { registerLevelFeature } from '../levelFeatures'
import { patchFor } from '../levelPatches'
import { createLiftEntity } from '../entities/Lift'

registerLevelFeature({
  name: 'lift',
  setup(level, ctx) {
    for (const spec of patchFor(ctx.name).lifts ?? []) {
      level.entities.add(createLiftEntity(ctx.sprites, spec))
    }
  },
})
