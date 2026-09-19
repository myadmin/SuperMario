/**
 * entities/BrickShrapnel.ts — ported verbatim from upstream `public/js/entities/BrickShrapnel.js`.
 */
import Entity from '../Entity'
import LifeLimit from '../traits/LifeLimit'
import Gravity from '../traits/Gravity'
import Velocity from '../traits/Velocity'
import { loadAudioBoard } from '../loaders/audio'
import { loadSpriteSheet } from '../loaders/sprite'
import type SpriteSheet from '../SpriteSheet'
import type AudioBoard from '../AudioBoard'

export function loadBrickShrapnel(audioContext: AudioContext) {
  return Promise.all([
    loadSpriteSheet('brick-shrapnel'),
    loadAudioBoard('brick-shrapnel', audioContext),
  ]).then(([sprite, audio]) => {
    return createFactory(sprite, audio)
  })
}

function createFactory(sprite: SpriteSheet, audio: AudioBoard) {
  const spinBrick = sprite.animations.get('spinning-brick')!

  function draw(this: Entity, context: CanvasRenderingContext2D) {
    sprite.draw(spinBrick(this.lifetime), context, 0, 0)
  }

  return function createBrickShrapnel() {
    const entity = new Entity()
    entity.audio = audio
    entity.size.set(8, 8)
    entity.addTrait(new LifeLimit())
    entity.addTrait(new Gravity())
    entity.addTrait(new Velocity())
    entity.draw = draw
    return entity
  }
}
