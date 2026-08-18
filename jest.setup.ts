import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'

// jsdom ships without TextEncoder/TextDecoder; browsers and Electron have
// them, and the foldcraft model parsers rely on them.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as typeof global.TextEncoder
  global.TextDecoder = TextDecoder as typeof global.TextDecoder
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
