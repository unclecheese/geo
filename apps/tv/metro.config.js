const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * apps/tv is not an npm workspace (RN tooling fights hoisting), so core is a
 * file: dep. Metro must watch packages/core (raw TS, transpiled by RN's babel
 * preset — no build step) and resolve modules from both node_modules trees.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const repoRoot = path.resolve(__dirname, '../..');

const config = {
  watchFolders: [path.resolve(repoRoot, 'packages/core')],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
