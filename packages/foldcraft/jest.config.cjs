/**
 * Standalone jest config for the foldcraft package.
 *
 * The root config's next/jest SWC transform only applies to app files, so
 * package TypeScript is transformed with next/babel here instead. The package
 * is pure computation with no DOM, so the environment is node.
 */
module.exports = {
    rootDir: __dirname,
    testEnvironment: 'node',
    transform: {
        '^.+\\.(t|j)sx?$': ['babel-jest', { presets: ['next/babel'] }],
    },
    testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
};
