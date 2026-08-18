import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'
import { webcrypto } from 'node:crypto'

// jsdom ships without TextEncoder/TextDecoder; browsers and Electron have
// them, and the foldcraft model parsers rely on them.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as typeof global.TextEncoder
  global.TextDecoder = TextDecoder as typeof global.TextDecoder
}

// jsdom's crypto has no subtle. Durable model sources hash blob content to
// identify a model, so without this the tests silently exercise the weaker
// fallback path instead of the one that actually ships.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
