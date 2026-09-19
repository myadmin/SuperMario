/**
 * EventEmitter.ts — ported verbatim from upstream `public/js/EventEmitter.js`.
 */
export default class EventEmitter {
  listeners: Array<{ name: symbol; callback: (...args: any[]) => void }> = []

  listen(name: symbol, callback: (...args: any[]) => void) {
    const listener = { name, callback }
    this.listeners.push(listener)
  }

  emit(name: symbol, ...args: any[]) {
    this.listeners.forEach((listener) => {
      if (listener.name === name) {
        listener.callback(...args)
      }
    })
  }
}
