module.exports = {
  roots: ['<rootDir>/src'],
  testEnvironment: 'jsdom',
  testEnvironmentOptions: { url: 'http://localhost:3000' },
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }], ['@babel/preset-react', { runtime: 'automatic' }]]
    }]
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/test/styleMock.cjs',
    '\\.(jpg|jpeg|png|gif|webp|svg|mp4|woff2?)$': '<rootDir>/test/fileMock.cjs'
  },
  clearMocks: true
};
