const { withAppBuildGradle } = require('@expo/config-plugins');

// android/app/build.gradle olmadan (EAS/expo prebuild rejenere ediyor) kalıcı kalması için
// config plugin ile enjekte edilir. Android SDK'nın varsayılan olarak seçtiği cmake;3.22.1
// paketinin içindeki ninja (1.10.2) Windows'ta uzun dosya yollarını desteklemiyor; RN'in yeni
// mimari codegen çıktısı (özellikle react-native-gesture-handler) 260 karakter sınırını aşan
// nesne dosyası yolları üretiyor ve "Filename longer than 260 characters" hatasıyla derleme
// çöküyor. cmake;3.31.6 (ninja 1.12.1) bu sınırı düzgün destekliyor — bu yüzden sürüm sabitlenir.
// `sdkmanager --sdk_root=%ANDROID_HOME% "cmake;3.31.6"` ile kurulmuş olmalı.
const ANCHOR = `android {
    ndkVersion rootProject.ext.ndkVersion`;

const REPLACEMENT = `android {
    ndkVersion rootProject.ext.ndkVersion

    externalNativeBuild {
        cmake {
            version = "3.31.6"
        }
    }`;

module.exports = function withNewerCmake(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes('version = "3.31.6"')) {
      if (!contents.includes(ANCHOR)) {
        throw new Error(
          'withNewerCmake: android/app/build.gradle şablonu beklenenden farklı, ' +
            'android { } bloğu bulunamadı. plugins/withNewerCmake.js dosyasını güncelleyin.'
        );
      }
      contents = contents.replace(ANCHOR, REPLACEMENT);
    }

    config.modResults.contents = contents;
    return config;
  });
};
