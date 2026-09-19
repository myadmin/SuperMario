/**
 * KeyboardState.ts — ported verbatim from upstream `public/js/KeyboardState.js`.
 * De-duplicates keydown/keyup so a mapping callback only fires on transitions.
 */
const PRESSED = 1
const RELEASED = 0

export default class KeyboardState {
  /** Holds the current state of a given key */
  keyStates = new Map<string, number>()

  /** Holds the callback functions for a key code */
  keyMap = new Map<string, (keyState: number) => void>()

  addMapping(code: string, callback: (keyState: number) => void) {
    this.keyMap.set(code, callback)
  }

  handleEvent(event: KeyboardEvent) {
    const { code } = event

    if (!this.keyMap.has(code)) {
      // Did not have key mapped.
      return
    }

    event.preventDefault()

    const keyState = event.type === 'keydown' ? PRESSED : RELEASED

    if (this.keyStates.get(code) === keyState) {
      return
    }

    this.keyStates.set(code, keyState)

    this.keyMap.get(code)!(keyState)
  }

  /**
   * Upstream subscribed directly to `window`. Here the registrar is injected so
   * the host can feed us Phaser's keyboard events instead — same events, same
   * preventDefault semantics, but routed through the engine's input plugin.
   */
  listenTo(register: (listener: (event: KeyboardEvent) => void) => void) {
    register((event: KeyboardEvent) => this.handleEvent(event))
  }
}
