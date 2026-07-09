module.exports = {
  preset: 'react-native',
  // @geobean/core resolves to its TypeScript source (a symlinked workspace, so
  // its realpath is outside node_modules and Babel transforms it). Two knock-on
  // needs: the injected @babel/runtime helpers must resolve to this app's copy,
  // and core's ESM-only geometry deps (d3-*, delaunator) must be transformed
  // rather than ignored.
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:.*/)?(react-native|@react-native(-community)?|@react-navigation|d3-geo|d3-array|internmap|delaunator|robust-predicates)/)',
  ],
};
