// 生成缺失的 12 份关卡数据（World 3 / 6 / 7 / 8 + uw-exit 小关）
// 布局依据原版 SMB 各世界公开地图资料重建；原版敌人不全的用现有实体替代（_note 注明）
import { writeFileSync } from 'node:fs'

const G = 208 // 地面顶 y（row 13）

function overworldBase(W) {
  return {
    spriteSheet: 'overworld', musicSheet: 'overworld', patternSheet: 'overworld-pattern',
    layers: [
      { tiles: [{ style: 'sky', ranges: [[0, W, 0, 15]] }] },
      { tiles: [] },
    ],
      entities: [],
    entities: [],
  }
}
function addGround(lv, segs) {
  lv.layers[0].tiles.push({ style: 'ground', behavior: 'ground', ranges: segs.map(([s, e]) => [s, e - s + 1, 13, 2]) })
}
function deco(lv, W) {
  for (let c = 2; c < W - 20; c += 45) lv.layers[1].tiles.push({ pattern: 'hill-large', ranges: [[c, 10]] })
  for (let c = 20; c < W - 24; c += 45) lv.layers[1].tiles.push({ pattern: 'hill-small', ranges: [[c, 11]] })
  for (let c = 12; c < W - 26; c += 30) lv.layers[1].tiles.push({ pattern: 'bush-triple', ranges: [[c, 12]] })
  for (let c = 6; c < W - 12; c += 28) lv.layers[1].tiles.push({ pattern: 'cloud-single', ranges: [[c, 3]] })
}
function pipe(lv, col, h, piranha) {
  lv.layers[1].tiles.push({ pattern: `pipe-${h}h`, ranges: [[col, 13 - h]] })
  if (piranha) lv.entities.push({ name: 'piranha-plant', pos: [col * 16 + 8, (13 - h) * 16 - 24] })
}
function flagCastle(lv, flagCol, castleCol) {
  lv.layers[1].tiles.push({ pattern: 'flag-pole-green', ranges: [[flagCol, 2]] })
  lv.layers[1].tiles.push({ pattern: 'castle-small', ranges: [[castleCol, 8]] })
}
function goomba(lv, col, y = 192) { lv.entities.push({ name: 'goomba-brown', pos: [col * 16, y] }) }
function goombaB(lv, col, y = 192) { lv.entities.push({ name: 'goomba-blue', pos: [col * 16, y] }) }
function koopa(lv, col, y = 184) { lv.entities.push({ name: 'koopa-green', pos: [col * 16, y] }) }
function koopaB(lv, col, y = 184) { lv.entities.push({ name: 'koopa-blue', pos: [col * 16, y] }) }
function bricks(lv, col, len, row) { lv.layers[1].tiles.push({ style: 'bricks', behavior: 'brick', ranges: [[col, len, row]] }) }
function chances(lv, cols, row) { lv.layers[1].tiles.push({ style: 'chance', behavior: 'chance', ranges: cols.map((c) => [c, row]) }) }
function coins(lv, col, len, row) { lv.layers[1].tiles.push({ style: 'coin', behavior: 'coin', ranges: [[col, len, row]] }) }
function castleBase(W, ckptY = 96) {
  return {
    spriteSheet: 'castle', musicSheet: 'castle', patternSheet: 'castle-pattern',
    checkpoints: [[40, ckptY]],
    layers: [
      { tiles: [{ style: 'sky', ranges: [[0, W, 0, 15]] }] },
      { tiles: [] },
    ],
      entities: [],
    entities: [],
  }
}
function castleFloor(lv, segs) {
  lv.layers[1].tiles.push({ style: 'ground', behavior: 'ground', ranges: segs.map(([s, e]) => [s, e - s + 1, 10, 5]) })
}
function lava(lv, s, len) {
  lv.layers[1].tiles.push({ style: 'waves', ranges: [[s, len, 12]] })
  lv.layers[1].tiles.push({ style: 'tile-red', ranges: [[s, len, 13, 2]] })
}
function bridge(lv, s, len) { lv.layers[1].tiles.push({ pattern: 'bridge', ranges: [[s, len, 9, 1]] }) }
function castleEnd(lv, bridgeCols, toadCol) {
  if (bridgeCols) { lava(lv, bridgeCols[0], bridgeCols[1]); bridge(lv, bridgeCols[0], bridgeCols[1]) }
  lv.layers[1].tiles.push({ pattern: 'toad', ranges: [[toadCol, 11]] })
}
function undergroundBase(W, ckpt = [[40, 48]]) {
  return {
    spriteSheet: 'underworld', musicSheet: 'underworld', patternSheet: 'underworld-pattern',
    checkpoints: ckpt,
    layers: [
      { tiles: [
        { style: 'sky', ranges: [[0, W, 0, 15]] },
        { style: 'ground', behavior: 'ground', ranges: [[0, W, 13, 2]] },
      ] },
      { tiles: [] },
    ],
      entities: [],
  }
}
function ugShell(lv, W) {
  lv.layers[1].tiles.push({ style: 'bricks', behavior: 'brick', ranges: [[0, 1, 2, 11]] })
  lv.layers[1].tiles.push({ style: 'bricks', behavior: 'brick', ranges: [[6, W - 12, 2, 2]] })
}
function note(lv, text) { lv._note = text }
function write(name, lv) { writeFileSync(`public/levels/${name}.json`, JSON.stringify(lv)); console.log('wrote', name) }

// ---------------- 6-1 地表
{
  const lv = overworldBase(190); lv.checkpoints = [[40, 192]]
  addGround(lv, [[0, 60], [64, 105], [110, 143], [148, 189]])
  deco(lv, 190)
  pipe(lv, 18, 2); pipe(lv, 30, 3, true); pipe(lv, 44, 2, true); pipe(lv, 90, 4, true); pipe(lv, 122, 3)
  bricks(lv, 52, 3, 9); chances(lv, [55, 57], 9); bricks(lv, 100, 4, 9); coins(lv, 61, 3, 9); coins(lv, 106, 4, 8)
  chances(lv, [124, 126], 9); bricks(lv, 130, 3, 9)
  ;[26, 38, 72, 76, 96, 100, 126, 152, 156, 164].forEach((c) => goomba(lv, c))
  ;[58, 118].forEach((c) => koopa(lv, c))
  flagCastle(lv, 178, 182)
  note(lv, 'World 6-1 重建：依 MarioWiki/NESMaps 的 6-1 布局要点编排（起伏地形 + 食人花管群）。原版敌人部分为 Lakitu/Spiny，用现有实体替代。')
  write('6-1', lv)
}
// ---------------- 6-2 地下
{
  const lv = undergroundBase(176)
  ugShell(lv, 176)
  lv.layers[0].tiles[1].ranges = [[0, 80, 13, 2], [84, 58, 13, 2], [146, 30, 13, 2]]
  bricks(lv, 14, 5, 9); chances(lv, [22, 24], 9); coins(lv, 30, 6, 8); bricks(lv, 44, 4, 5); coins(lv, 44, 4, 4)
  bricks(lv, 60, 3, 9); chances(lv, [66, 68], 9); coins(lv, 84, 8, 8); bricks(lv, 96, 4, 5)
  bricks(lv, 110, 5, 9); chances(lv, [118, 119], 9); coins(lv, 130, 6, 8); pipe(lv, 138, 2)
  ;[30, 44, 70, 90, 110, 120, 140, 152].forEach((c) => goombaB(lv, c))
  ;[60, 100, 130].forEach((c) => koopaB(lv, c))
  lv.layers[1].tiles.push({ pattern: 'exit-pipe-8h', ranges: [[164, 2]] })
  note(lv, 'World 6-2 重建：地下关骨架同 1-2（天花板/左墙/坠入开场），砖块迷宫与金币带按 6-2 布局要点编排。原版敌人缺失的用地下蓝款替代。')
  write('6-2', lv)
}
// ---------------- 6-3 运动关（树平台）
{
  const lv = overworldBase(160); lv.checkpoints = [[40, 192]]
  addGround(lv, [[0, 18], [142, 159]])
  deco(lv, 160)
  const plats = [[24, 8], [34, 9], [44, 8], [56, 10], [66, 9], [78, 8], [90, 10], [102, 9], [114, 8], [126, 10]]
  for (const [c, r] of plats) {
    lv.layers[1].tiles.push({ style: 'tree-large-top', behavior: 'ground', ranges: [[c, 3, r, 1]] })
    lv.layers[1].tiles.push({ style: 'tree-large-bottom', behavior: 'ground', ranges: [[c, 3, r + 1, 1]] })
    lv.layers[1].tiles.push({ style: 'tree-trunk', ranges: [[c + 1, r + 2, 1, 12 - r]] })
    coins(lv, c, 3, r - 2)
  }
  ;[44, 66, 90, 114].forEach((c, i) => koopa(lv, c, plats[i][1] * 16 - 24))
  ;[8, 14, 146, 152].forEach((c) => goomba(lv, c))
  flagCastle(lv, 148, 152)
  note(lv, 'World 6-3 重建：树平台运动关，骨架同 3-1（两端地面 + 中部深坑），树平台用 tree-large-top/bottom + behavior ground 搭建（树图案本身无碰撞）。原版敌人缺失的用现有实体替代。')
  write('6-3', lv)
}
// ---------------- 6-4 城堡
{
  const lv = castleBase(170)
  castleFloor(lv, [[0, 60], [64, 93], [98, 117], [122, 139], [140, 169]])
  lava(lv, 61, 3); lava(lv, 94, 4); lava(lv, 118, 4)
  bricks(lv, 20, 6, 5); chances(lv, [30, 32], 5); bricks(lv, 70, 5, 5); bricks(lv, 100, 5, 5)
  chances(lv, [130, 132], 5); bricks(lv, 150, 4, 5)
  lv.entities.push({ name: 'cannon', pos: [30 * 16, 8 * 16] }, { name: 'cannon', pos: [110 * 16, 8 * 16] })
  ;[30, 80, 130].forEach((c) => koopaB(lv, c, 144))
  ;[50, 110].forEach((c) => goombaB(lv, c, 144))
  lv.layers[1].tiles.push({ pattern: 'toad', ranges: [[156, 11]] })
  note(lv, 'World 6-4 重建：城堡骨架同 1-4（厚地板 + 熔岩 + 砖迷宫）。原版 Bowser 战无法实现（无素材），结尾 toad 房间收尾，通关由主线 exitTrigger 注入。')
  write('6-4', lv)
}
// ---------------- uw-exit-6
{
  const lv = overworldBase(20); lv.checkpoints = [[40, 192]]
  addGround(lv, [[0, 19]])
  lv.layers[1].tiles.push({ pattern: 'flag-pole-green', ranges: [[11, 2]] })
  lv.layers[1].tiles.push({ pattern: 'castle-small', ranges: [[15, 8]] })
  note(lv, '6-2 出口过场：地面 + 旗杆 + 城堡（同 uw-exit 结构）。')
  write('uw-exit-6', lv)
}
// ---------------- 8-3 地表（8-1/8-2 已由前期任务产出）
{
  const lv = overworldBase(190); lv.checkpoints = [[40, 192]]
  addGround(lv, [[0, 50], [55, 94], [100, 137], [142, 189]])
  deco(lv, 190)
  pipe(lv, 20, 2, true); pipe(lv, 70, 3); pipe(lv, 118, 2, true)
  bricks(lv, 34, 4, 9); chances(lv, [40, 42], 9); bricks(lv, 62, 4, 9); chances(lv, [66, 68], 9)
  coins(lv, 51, 4, 8); coins(lv, 96, 4, 8); bricks(lv, 124, 4, 9); chances(lv, [130, 131], 9)
  ;[20, 30, 42, 60, 64, 80, 84, 110, 114, 130, 134, 150].forEach((c) => goomba(lv, c))
  ;[50, 70, 90, 120].forEach((c) => koopa(lv, c))
  flagCastle(lv, 178, 182)
  note(lv, 'World 8-3 重建：地表运动关（敌意密度按 8-3 提高布局）。原版敌人缺失的用现有实体替代。')
  write('8-3', lv)
}
// ---------------- 8-4 最终城堡
{
  const lv = castleBase(190)
  castleFloor(lv, [[0, 40], [44, 73], [78, 103], [108, 131], [136, 159], [160, 189]])
  lava(lv, 41, 3); lava(lv, 74, 4); lava(lv, 104, 4); lava(lv, 132, 4)
  bridge(lv, 41, 3); bridge(lv, 104, 4)
  bricks(lv, 12, 6, 5); chances(lv, [24, 26], 5); bricks(lv, 50, 6, 5); chances(lv, [60, 62], 5)
  bricks(lv, 84, 5, 5); bricks(lv, 114, 5, 5); chances(lv, [124, 125], 5); bricks(lv, 144, 5, 5)
  lv.entities.push({ name: 'cannon', pos: [24 * 16, 8 * 16] }, { name: 'cannon', pos: [60 * 16, 8 * 16] }, { name: 'cannon', pos: [124 * 16, 8 * 16] })
  ;[30, 60, 90, 120, 150].forEach((c) => koopaB(lv, c, 144))
  ;[20, 50, 80, 110, 140].forEach((c) => goombaB(lv, c, 144))
  lv.layers[1].tiles.push({ pattern: 'toad', ranges: [[170, 11]] })
  note(lv, 'World 8-4 最终城堡重建：最长城堡（多段熔岩桥 + 砖迷宫 + 炮台）。原版 Bowser 战与公主结局无法实现（无素材），结尾 toad 房间收尾，通关由主线 exitTrigger 注入后循环回 1-1。')
  write('8-4', lv)
}
// ---------------- 7-1 地表
{
  const lv = overworldBase(190); lv.checkpoints = [[40, 192]]
  addGround(lv, [[0, 55], [59, 103], [108, 147], [152, 189]])
  deco(lv, 190)
  pipe(lv, 22, 3, true); pipe(lv, 70, 2); pipe(lv, 96, 4, true); pipe(lv, 130, 3)
  bricks(lv, 40, 5, 9); chances(lv, [46, 48], 9); bricks(lv, 76, 4, 9); coins(lv, 56, 3, 8)
  coins(lv, 104, 4, 8); bricks(lv, 118, 4, 9); chances(lv, [136, 138], 9)
  ;[18, 36, 44, 66, 80, 98, 112, 120, 140, 160].forEach((c) => goomba(lv, c))
  ;[52, 90, 125].forEach((c) => koopa(lv, c))
  flagCastle(lv, 178, 182)
  note(lv, 'World 7-1 重建：地表关（管群 + 敌阵布局按 7-1 要点编排）。原版敌人缺失的用现有实体替代。')
  write('7-1', lv)
}
// ---------------- 7-4 城堡
{
  const lv = castleBase(170)
  castleFloor(lv, [[0, 50], [54, 85], [90, 117], [122, 137], [142, 169]])
  lava(lv, 51, 3); lava(lv, 86, 4); lava(lv, 118, 4)
  bridge(lv, 51, 3); bridge(lv, 118, 4)
  bricks(lv, 14, 6, 5); chances(lv, [26, 28], 5); bricks(lv, 60, 5, 5); chances(lv, [70, 72], 5)
  bricks(lv, 94, 5, 5); bricks(lv, 126, 4, 5); chances(lv, [148, 150], 5)
  lv.entities.push({ name: 'cannon', pos: [26 * 16, 8 * 16] }, { name: 'cannon', pos: [70 * 16, 8 * 16] })
  ;[30, 70, 110].forEach((c) => koopaB(lv, c, 144))
  ;[40, 100, 130].forEach((c) => goombaB(lv, c, 144))
  lv.layers[1].tiles.push({ pattern: 'toad', ranges: [[160, 11]] })
  note(lv, 'World 7-4 重建：城堡骨架同 1-4（熔岩桥 + 砖迷宫）。原版 Bowser 战无法实现（无素材），toad 房间收尾，通关由主线 exitTrigger 注入。')
  write('7-4', lv)
}
// ---------------- 3-2 地下
{
  const lv = undergroundBase(160)
  ugShell(lv, 160)
  lv.layers[0].tiles[1].ranges = [[0, 70, 13, 2], [74, 40, 13, 2], [118, 42, 13, 2]]
  bricks(lv, 12, 5, 9); chances(lv, [20, 21], 9); coins(lv, 28, 6, 8); bricks(lv, 40, 4, 5)
  bricks(lv, 56, 4, 9); chances(lv, [62, 63], 9); coins(lv, 78, 6, 8); bricks(lv, 92, 5, 9)
  chances(lv, [100, 101], 9); coins(lv, 124, 6, 8); pipe(lv, 108, 2)
  ;[24, 40, 60, 80, 100, 130].forEach((c) => goombaB(lv, c))
  ;[50, 90].forEach((c) => koopaB(lv, c))
  lv.layers[1].tiles.push({ pattern: 'exit-pipe-8h', ranges: [[150, 2]] })
  note(lv, 'World 3-2 重建：地下关骨架同 1-2。原版敌人缺失的用地下蓝款替代。')
  write('3-2', lv)
}
// ---------------- 3-3 运动关（树平台）
{
  const lv = overworldBase(150); lv.checkpoints = [[40, 192]]
  addGround(lv, [[0, 16], [134, 149]])
  deco(lv, 150)
  const plats = [[20, 8], [30, 9], [40, 8], [52, 10], [62, 9], [74, 8], [86, 10], [98, 9], [110, 8], [122, 10]]
  for (const [c, r] of plats) {
    lv.layers[1].tiles.push({ style: 'tree-large-top', behavior: 'ground', ranges: [[c, 3, r, 1]] })
    lv.layers[1].tiles.push({ style: 'tree-large-bottom', behavior: 'ground', ranges: [[c, 3, r + 1, 1]] })
    coins(lv, c, 3, r - 2)
  }
  ;[40, 62, 86, 110].forEach((c, i) => koopa(lv, c, plats[i][1] * 16 - 24))
  ;[6, 10, 138, 142].forEach((c) => goomba(lv, c))
  flagCastle(lv, 140, 144)
  note(lv, 'World 3-3 重建：树平台运动关（骨架同 3-1）。树平台用 tree-large-top/bottom + behavior ground 搭建。原版敌人缺失的用现有实体替代。')
  write('3-3', lv)
}
// ---------------- 3-4 城堡
{
  const lv = castleBase(150)
  castleFloor(lv, [[0, 45], [49, 76], [81, 104], [109, 149]])
  lava(lv, 46, 3); lava(lv, 77, 4); lava(lv, 105, 4)
  bridge(lv, 46, 3); bridge(lv, 105, 4)
  bricks(lv, 14, 6, 5); chances(lv, [24, 26], 5); bricks(lv, 56, 5, 5); chances(lv, [64, 65], 5)
  bricks(lv, 86, 5, 5); chances(lv, [94, 95], 5); bricks(lv, 116, 5, 5)
  lv.entities.push({ name: 'cannon', pos: [24 * 16, 8 * 16] }, { name: 'cannon', pos: [64 * 16, 8 * 16] })
  ;[30, 60, 90, 120].forEach((c) => koopaB(lv, c, 144))
  ;[40, 70, 100].forEach((c) => goombaB(lv, c, 144))
  lv.layers[1].tiles.push({ pattern: 'toad', ranges: [[140, 11]] })
  note(lv, 'World 3-4 重建：城堡骨架同 1-4（熔岩桥 + 砖迷宫）。原版 Bowser 战无法实现（无素材），toad 房间收尾，通关由主线 exitTrigger 注入。')
  write('3-4', lv)
}
// ---------------- uw-exit-3
{
  const lv = overworldBase(20); lv.checkpoints = [[40, 192]]
  addGround(lv, [[0, 19]])
  lv.layers[1].tiles.push({ pattern: 'flag-pole-green', ranges: [[11, 2]] })
  lv.layers[1].tiles.push({ pattern: 'castle-small', ranges: [[15, 8]] })
  note(lv, '3-2 出口过场：地面 + 旗杆 + 城堡（同 uw-exit 结构）。')
  write('uw-exit-3', lv)
}
console.log('ALL DONE')
