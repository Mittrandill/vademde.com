const { withAppBuildGradle } = require('@expo/config-plugins');

// EAS kullanılmadığı için imzalama anahtarı bu repoda değil, geliştiricinin
// makinesindeki ~/.gradle/gradle.properties dosyasında tutulur (bkz. docs/13
// Android build rehberi). `expo prebuild` android/ klasörünü her seferinde
// yeniden ürettiğinden, release signingConfig'i doğrudan build.gradle'a değil
// bu config plugin ile enjekte ediyoruz — aksi halde her prebuild'de silinir.
//
// ~/.gradle/gradle.properties içinde beklenen anahtarlar:
//   VADEMDE_UPLOAD_STORE_FILE=C:\\keys\\vademde-upload.jks (mutlak yol)
//   VADEMDE_UPLOAD_STORE_PASSWORD=...
//   VADEMDE_UPLOAD_KEY_ALIAS=vademde-upload
//   VADEMDE_UPLOAD_KEY_PASSWORD=...
// Tanımlı değilse release build sessizce debug keystore'a düşer (CI/lokal
// geliştirmede build'in kırılmaması için); Play Console'a bu haliyle
// yüklenemez, imzalama anahtarını mutlaka ayarlayın.

const DEBUG_SIGNING_BLOCK = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const SIGNING_WITH_RELEASE = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('VADEMDE_UPLOAD_STORE_FILE')) {
                storeFile file(VADEMDE_UPLOAD_STORE_FILE)
                storePassword VADEMDE_UPLOAD_STORE_PASSWORD
                keyAlias VADEMDE_UPLOAD_KEY_ALIAS
                keyPassword VADEMDE_UPLOAD_KEY_PASSWORD
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }`;

const RELEASE_BUILD_TYPE_DEBUG_SIGNING = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_BUILD_TYPE_RELEASE_SIGNING = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.release`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes('VADEMDE_UPLOAD_STORE_FILE')) {
      if (!contents.includes(DEBUG_SIGNING_BLOCK)) {
        throw new Error(
          'withAndroidReleaseSigning: android/app/build.gradle şablonu beklenenden farklı, ' +
            'signingConfigs bloğu bulunamadı. plugins/withAndroidReleaseSigning.js dosyasını güncelleyin.'
        );
      }
      contents = contents.replace(DEBUG_SIGNING_BLOCK, SIGNING_WITH_RELEASE);
      contents = contents.replace(RELEASE_BUILD_TYPE_DEBUG_SIGNING, RELEASE_BUILD_TYPE_RELEASE_SIGNING);
    }

    config.modResults.contents = contents;
    return config;
  });
};
