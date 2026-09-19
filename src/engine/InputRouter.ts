/**
 * InputRouter.ts — ported verbatim from upstream `public/js/InputRouter.js`.
 */
import type Entity from './Entity'

export default class InputRouter {
  receivers = new Set<Entity>()

  addReceiver(receiver: Entity) {
    this.receivers.add(receiver)
  }

  dropReceiver(receiver: Entity) {
    this.receivers.delete(receiver)
  }

  route(routeInput: (entity: Entity) => void) {
    for (const receiver of this.receivers) {
      routeInput(receiver)
    }
  }
}
