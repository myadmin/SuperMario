/**
 * 特性模块入口 —— 只要被 import，各模块就会自行 `registerLevelFeature()`。
 * `src/game.ts` 导入本文件一次即可。
 *
 * 新增特性时：在 features/ 下加一个模块，在这里补一行 import。
 */
import './chanceBlock'
import './flag'
import './castle'
import './lift'
import './exitPipe'
