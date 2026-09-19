/**
 * entities/FlagPole.ts — ported verbatim from upstream `public/js/entities/FlagPole.js`.
 * Invisible 8x144 sensor; its Pole trait catches any PoleTraveller.
 */
import Entity from '../Entity'
import Pole from '../traits/Pole'
import { loadAudioBoard } from '../loaders/audio'
import { extraFxBoard, FLAGPOLE_SOUND } from '../fxSounds'
import type AudioBoard from '../AudioBoard'

export function loadFlagPole(audioContext: AudioContext) {
  return Promise.all([loadAudioBoard('flag-pole', audioContext)]).then(([audio]) => {
    return createFactory(audio)
  })
}

/**
 * 本项目新增：不依赖 `AudioContext` 的旗杆实体工厂。
 *
 * 上游的 `loadFlagPole` 要先加载音频才返回工厂，而 `features/flag.ts` 是在关卡
 * 加载完成后才运行的，拿不到 audioContext。`Entity` 默认就带一个空 AudioBoard，
 * 所以这里直接构造一个与上游等价的实体（尺寸 / offset / Pole trait 完全一致）。
 */
export function createFlagPoleEntity(): Entity {
  const entity = new Entity()
  entity.size.set(8, 144)
  entity.offset.set(4, 0)
  entity.addTrait(new Pole())

  // 本项目新增（音频）：抓杆音效。`Pole.addTraveller()` 里那句
  // `pole.sounds.add('ride')` 是上游写的，但上游的 `loadFlagPole` 工厂才会给它挂上
  // `sounds/flag-pole.json` 的音效板；本项目的旗杆是自己注入的，默认是空板——于是抓杆
  // 一直是静默的（空板里没有缓冲，`AudioBoard.playAudio` 播的是静音）。这里补上 `ride`。
  entity.audio = extraFxBoard([FLAGPOLE_SOUND])

  return entity
}

function createFactory(audio: AudioBoard) {
  return function createFlagPole() {
    const entity = createFlagPoleEntity()
    entity.audio = audio
    return entity
  }
}
