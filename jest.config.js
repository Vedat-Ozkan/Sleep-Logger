module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'babel-jest',
      { presets: ['babel-preset-expo'] },
    ],
  },
};
