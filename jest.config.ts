import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you soon)
    '^@/(.*)$': '<rootDir>/src/$1',
    '^jspdf$': '<rootDir>/src/test/mocks/jspdf.ts',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  testPathIgnorePatterns: ['<rootDir>/.next/'],
  // Add more setup options before each test is run
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/types.ts',
    '!src/app/layout.tsx',
    '!src/app/page.tsx',
    '!src/app/api/**',
    '!**/node_modules/**',
  ],
  testMatch: [
      "<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}",
      "<rootDir>/__tests__/**/*.{spec,test}.{js,jsx,ts,tsx}"
  ],
}

/**
 * ESM dependencies that must be transformed rather than skipped.
 *
 * `three` ships its add-ons (`examples/jsm/**`) as untranspiled ESM, and
 * `src/lib/modelThumbnail.ts` imports GLTFLoader from there. Jest ignores
 * node_modules by default, so that import threw "Cannot use import statement
 * outside a module" and took down every suite that transitively reaches it —
 * Asset3DPreview, AssetVault and the whole EditorView suite.
 */
const ESM_PACKAGES = ['three', 'three-stdlib', '@react-three', '@monogrid/gainmap-js']

// next/jest builds its own `transformIgnorePatterns` and overwrites whatever the
// user config sets, so they have to be adjusted after the fact. The patterns are
// OR'd — adding one more entry cannot un-ignore a path that an existing pattern
// already matches — so the packages are injected into next's own negative
// lookahead instead. Injecting (rather than replacing the list) keeps next's
// internal allowances working across Next upgrades.
const buildConfig = async (): Promise<Config> => {
  const jestConfig = await createJestConfig(config)()
  const allow = ESM_PACKAGES.join('|')
  return {
    ...jestConfig,
    transformIgnorePatterns: (jestConfig.transformIgnorePatterns ?? []).flatMap((pattern) => {
      if (!pattern.includes('node_modules')) return [pattern]
      // Blanket ignore — replace outright, it would shadow everything else.
      if (pattern === '/node_modules/') return [`/node_modules/(?!(${allow})/)`]
      return [pattern.replace(/\(\?!\(/g, `(?!(${allow}|`)]
    }),
  }
}

export default buildConfig
