/**
 * EventBuffer.ts — ported verbatim from upstream `public/js/EventBuffer.js`.
 * Deferred events: emitted during the update pass, consumed in finalize().
 */
export default class EventBuffer {
  events: Array<{ name: symbol; args: any[] }> = []

  emit(name: symbol, ...args: any[]) {
    const event = { name, args }
    this.events.push(event)
  }

  process(name: symbol, callback: (...args: any[]) => void) {
    this.events.forEach((event) => {
      if (event.name === name) {
        callback(...event.args)
      }
    })
  }

  clear() {
    this.events.length = 0
  }
}
