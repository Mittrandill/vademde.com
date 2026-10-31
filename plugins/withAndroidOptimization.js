const { withAppBuildGradle } = require('@expo/config-plugins');

// R8's default proguard-android.txt disables optimization. Keep the optimized
// Android rules when Expo regenerates the project; library consumer rules still apply.
module.exports = function withAndroidOptimization(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    const plain = /getDefaultProguardFile\((['"])proguard-android\.txt\1\)/g;
    if (!plain.test(contents) && !contents.includes('proguard-android-optimize.txt')) {
      throw new Error('Android release ProGuard defaults were not found; review the Expo Gradle template.');
    }
    config.modResults.contents = contents.replace(plain, 'getDefaultProguardFile("proguard-android-optimize.txt")');
    return config;
  });
};
