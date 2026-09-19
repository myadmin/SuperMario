# 关卡编写规范（新增关卡必读）

新增关卡 = `public/levels/` 下新增一个 JSON + 在 `src/engine/levelPatches.ts` 登记
推进/内容数据（后者由主线完成，新关卡作者只需在报告里给出需要的数据）。

## JSON Schema

```json
{
  "spriteSheet":  "overworld | underworld | underwater | castle",
  "musicSheet":   "overworld | underworld | underwater | castle",
  "patternSheet": "<同主题>-pattern",
  "checkpoints":  [[40, 192]],
  "layers": [ { "tiles": [ { "style": "ground", "behavior": "ground",
                              "ranges": [[0, 69, 13, 2]] } ] } ],
  "entities": [ { "name": "goomba-brown", "pos": [352, 192] } ]
}
```

- `ranges` 三种形态：`[xStart, xLen, yStart, yLen]`（矩形）、`[xStart, xLen, y]`（同一行横向段）、`[x, y]`（单格）。
- **注意**：`loaders/level.ts` 的 `expandTiles` 对同一段 range 的所有格子**复用同一个 tile 对象**——
  不同行为/不同内容的格子必须拆成独立条目（例如单独一枚 `metal` 不要并进大段砖里）。
- 必须有 `checkpoints`（校验器强制）：地表/城堡 `[[40, 192]]`，地下（从天花板坠入）`[[40, 48]]`。

## 主题 → 三表映射（按原版世界设计）

| 关型 | spriteSheet | musicSheet | patternSheet | 参考关卡 |
|---|---|---|---|---|
| 地表（X-1/X-3 运动关） | overworld | overworld | overworld-pattern | levels/1-1.json、3-1.json |
| 地下（X-2） | underworld | underworld | underworld-pattern | levels/1-2.json |
| 水下（X-2 水关） | underwater | underwater | underwater-pattern | levels/2-2.json |
| 城堡（X-4） | castle | castle | castle-pattern | levels/1-4.json |

**写新关前先通读同主题的参考关卡**，拷贝它的结构约定（地下关的天花板/左墙、地表关的
地面两行、水关的水体与珊瑚、城堡关的墙与入口阶梯）。

## 行为（behavior）语义

| style | behavior | 语义 |
|---|---|---|
| ground | ground | 实心地面（水下/城堡同） |
| bricks / bricks-top | brick | **可顶可碎的砖**（大马里奥碎、小马里奥弹） |
| chance | chance | 问号块（顶开出金币；装道具的坐标在 levelPatches 登记） |
| coin | coin | 金币瓦片（碰到 +1 金币 +200 分） |
| metal | ground | 可见的实心块（原版隐藏块另在 levelPatches 的 hiddenBlocks 白名单登记） |
| 无 behavior | ∅ | 纯装饰（云/山/灌木/天砖等），不碰撞 |

## 结尾（三类）

1. **地表关**：结尾放 `pattern: flag-pole-green`（旗杆）+ `pattern: castle-small`
   （含 castle-arch 门洞）——`features/castle.ts` 自动在门洞注入通关触发，推进到
   levelPatches 登记的 `nextLevel`。旗杆在最右侧阶梯后 6~8 格，城堡紧随其后。
2. **地下关（X-2）**：结尾放 `pattern: exit-pipe-8h`（横向出口管），
   levelPatches 里按 `exitPipes` 登记横管门户（goesTo 指向下一个地表过场关）。
3. **水关**：结尾是出水管（游进去按方向键）→ 直接进入下一关。

## 实体（校验器强制白名单）

goomba-brown / goomba-blue（地下、城堡用蓝色款）/ koopa-green / koopa-blue /
cheep-slow / cheep-fast / cheep-slow-wavy / cheep-fast-wavy（水关）/
bullet（配 cannon 使用）/ cannon / piranha-plant（放在管口上沿：pos.y = 管口顶 y - 24）/
pipe-portal（配 props：`{"dir":"DOWN","goesTo":{"name":"..."},"backTo":"..."}`）。
敌人 y 坐标：站在地面（row 13，顶 y=208）上的 16 高敌人 pos.y = 192；乌龟 24 高 pos.y = 184。

## 坐标约定

- 1 格 = 16px；地面占 rows 13-14（y 208 起）；可玩高度 rows 0-12。
- 关卡宽度：地表 180~212 格，地下/城堡 160~200 格。
- 出生点与第一格地面之间不要有坑。
