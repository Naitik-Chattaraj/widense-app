const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Explicitly add ttf to the asset extensions resolver to fix icon loading on web
if (config.resolver && config.resolver.assetExts) {
  if (!config.resolver.assetExts.includes('ttf')) {
    config.resolver.assetExts.push('ttf');
  }
}

module.exports = config;
