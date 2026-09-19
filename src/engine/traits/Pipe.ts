/**
 * traits/Pipe.ts — ported verbatim from upstream `public/js/traits/Pipe.js`.
 * A pipe portal interpolates a traveller from start to end over `duration`
 * seconds along `direction`, then emits EVENT_PIPE_COMPLETE.
 */
import { Vec2, Direction } from '../math'
import { Align } from '../Entity'
import Trait from '../Trait'
import PipeTraveller from './PipeTraveller'
import type Entity from '../Entity'
import type GameContext from '../GameContext'
import type Level from '../Level'

type TravellerState = {
  time: number
  start: Vec2
  end: Vec2
}

function createTravellerState(): TravellerState {
  return {
    time: 0,
    start: new Vec2(0, 0),
    end: new Vec2(0, 0),
  }
}

export function connectEntity(pipeEntity: Entity, travellerEntity: Entity) {
  const pipeTrait = pipeEntity.getTrait(Pipe)
  Align.center(pipeEntity, travellerEntity)
  if (pipeTrait.direction.equals(Direction.UP)) {
    Align.bottom(pipeEntity, travellerEntity)
  } else if (pipeTrait.direction.equals(Direction.DOWN)) {
    Align.top(pipeEntity, travellerEntity)
  } else if (pipeTrait.direction.equals(Direction.LEFT)) {
    Align.right(pipeEntity, travellerEntity)
  } else if (pipeTrait.direction.equals(Direction.RIGHT)) {
    Align.left(pipeEntity, travellerEntity)
  }
  pipeTrait.addTraveller(pipeEntity, travellerEntity)
}

export default class Pipe extends Trait {
  static EVENT_PIPE_COMPLETE = Symbol('pipe complete')

  duration = 1
  direction = new Vec2(0, 0)
  travellers = new Map<Entity, TravellerState>()

  addTraveller(pipe: Entity, traveller: Entity) {
    const pipeTraveller = traveller.getTrait(PipeTraveller)
    pipeTraveller.distance.set(0, 0)

    const state = createTravellerState()
    state.start.copy(traveller.pos)
    state.end.copy(traveller.pos)
    state.end.x += this.direction.x * pipe.size.x
    state.end.y += this.direction.y * pipe.size.y
    this.travellers.set(traveller, state)
  }

  collides(pipe: Entity, traveller: Entity) {
    if (!traveller.traits.has(PipeTraveller)) {
      return
    }

    if (this.travellers.has(traveller)) {
      return
    }

    if (traveller.getTrait(PipeTraveller).direction.equals(this.direction)) {
      const tBounds = traveller.bounds
      const pBounds = pipe.bounds
      if (
        this.direction.x &&
        (tBounds.top < pBounds.top || tBounds.bottom > pBounds.bottom)
      ) {
        return
      }
      if (this.direction.y && (tBounds.left < pBounds.left || tBounds.right > pBounds.right)) {
        return
      }
      pipe.sounds.add('pipe')
      this.addTraveller(pipe, traveller)
    }
  }

  update(pipe: Entity, gameContext: GameContext, level: Level) {
    const { deltaTime } = gameContext
    for (const [traveller, state] of this.travellers.entries()) {
      state.time += deltaTime
      const progress = state.time / this.duration
      traveller.pos.x = state.start.x + (state.end.x - state.start.x) * progress
      traveller.pos.y = state.start.y + (state.end.y - state.start.y) * progress
      traveller.vel.set(0, 0)

      const pipeTraveller = traveller.getTrait(PipeTraveller)
      pipeTraveller.movement.copy(this.direction)
      pipeTraveller.distance.x = traveller.pos.x - state.start.x
      pipeTraveller.distance.y = traveller.pos.y - state.start.y

      if (state.time > this.duration) {
        this.travellers.delete(traveller)
        pipeTraveller.movement.set(0, 0)
        pipeTraveller.distance.set(0, 0)

        level.events.emit(Pipe.EVENT_PIPE_COMPLETE, pipe, traveller)
      }
    }
  }
}
