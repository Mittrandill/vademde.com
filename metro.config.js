// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite web desteği wa-sqlite wasm modülünü asset olarak yükler.
config.resolver.assetExts.push('wasm');

module.exports = config;
