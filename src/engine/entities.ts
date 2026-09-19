/**
 * entities.ts — ported verbatim from upstream `public/js/entities.js`.
 * Builds the entity-factory registry; brickShrapnel is pooled (8 instances).
 */
import { loadMario } from './entities/Mario'
import { loadGoombaBrown, loadGoombaBlue } from './entities/Goomba'
import { loadKoopaGreen, loadKoopaBlue } from './entities/Koopa'
import {
  loadCheepSlow,
  loadCheepFast,
  loadCheepSlowWavy,
  loadCheepFastWavy,
} from './entities/CheepCheep'
import { loadPiranhaPlant } from './entities/PiranhaPlant'
import { loadBullet } from './entities/Bullet'
import { loadCannon } from './entities/Cannon'
import { loadBrickShrapnel } from './entities/BrickShrapnel'
import { loadPipePortal } from './entities/PipePortal'
import { loadFlagPole } from './entities/FlagPole'
import type { EntityFactory } from './GameContext'
import type Entity from './Entity'

function createPool<T extends Entity>(size: number) {
  const pool: T[] = []

  return function createPooledFactory(factory: () => T) {
    for (let i = 0; i < size; i++) {
      pool.push(factory())
    }

    let count = 0
    return function pooledFactory(): T {
      const entity = pool[count++ % pool.length]
      entity.lifetime = 0
      return entity
    }
  }
}

export async function loadEntities(audioContext: AudioContext): Promise<EntityFactory> {
  const entityFactories: EntityFactory = {}

  function setup(loader: (ctx: AudioContext) => Promise<any>) {
    return loader(audioContext)
  }

  function addAs(name: string) {
    return function addFactory(factory: any) {
      entityFactories[name] = factory
    }
  }

  await Promise.all([
    setup(loadMario).then(addAs('mario')),
    setup(loadPiranhaPlant).then(addAs('piranha-plant')),
    setup(loadGoombaBrown).then(addAs('goomba-brown')),
    setup(loadGoombaBlue).then(addAs('goomba-blue')),
    setup(loadKoopaGreen).then(addAs('koopa-green')),
    setup(loadKoopaBlue).then(addAs('koopa-blue')),
    setup(loadCheepSlow).then(addAs('cheep-slow')),
    setup(loadCheepFast).then(addAs('cheep-fast')),
    setup(loadCheepSlowWavy).then(addAs('cheep-slow-wavy')),
    setup(loadCheepFastWavy).then(addAs('cheep-fast-wavy')),
    setup(loadBullet).then(addAs('bullet')),
    setup(loadCannon).then(addAs('cannon')),
    setup(loadPipePortal).then(addAs('pipe-portal')),
    setup(loadFlagPole).then(addAs('flag-pole')),
    setup(loadBrickShrapnel).then(createPool<Entity>(8)).then(addAs('brickShrapnel')),
  ])

  return entityFactories
}
