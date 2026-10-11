import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// Ky so release: doc keystore.properties o goc project (gitignored, khong commit).
// Neu file khong ton tai, release fallback sang debug signing de build van chay.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

android {
    namespace = "vn.io.tannhatcms.volamidle"
    compileSdk = 37

    defaultConfig {
        applicationId = "vn.io.tannhatcms.volamidle"
        minSdk = 24
        targetSdk = 35
        versionCode = 5
        versionName = "2.4.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            // Test OTA local: ./gradlew.bat assembleDebug -PotaLocal
            // -> manifest + ZIP tro ve server tools/local_ota_server.py (10.0.2.2:8000).
            // Khong co co thi debug cung dung GitHub production nhu release.
            buildConfigField(
                "boolean", "OTA_LOCAL",
                // Ho tro ca "-PotaLocal" (co truan, gia tri rong) va "-PotaLocal=true|false"
                (hasProperty("otaLocal") && findProperty("otaLocal").toString() != "false").toString(),
            )
            buildConfigField("String", "OTA_LOCAL_BASE", "\"http://10.0.2.2:8000/\"")
        }
        release {
            buildConfigField("boolean", "OTA_LOCAL", "false")
            buildConfigField("String", "OTA_LOCAL_BASE", "\"\"")
            isMinifyEnabled = false
            signingConfig = if (keystorePropsFile.exists()) signingConfigs.getByName("release")
                else signingConfigs.getByName("debug")
        }
    }

    // Ten file APK kep phien ban: volam-idle-v1.3.0-debug.apk / volam-idle-v1.3.0-release.apk
    // (mac dinh la app-debug.apk / app-release.apk — kho phan biet cac ban khi luu tru)
    // AGP 9: applicationVariants da bi xoa — dung androidComponents.onVariants
    val vn = defaultConfig.versionName ?: "?"
    androidComponents {
        onVariants { variant ->
            variant.outputs.forEach { output ->
                output.outputFileName.set("volam-idle-v$vn-${variant.name}.apk")
            }
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation("androidx.webkit:webkit:1.17.1")
    implementation("com.squareup.okhttp3:okhttp:5.5.0")
}

// Dong bo phan "code" cua game tu thu muc game/ cua project vao assets cua APK
// moi lan build. Phan media nang (img, snd, music, fx) + du lieu game JSON (jdata/)
// KHONG bundle — tai qua OTA tu raw.githubusercontent (xem OtaManager.kt +
// assets-manifest.json o goc repo; docs/DU-LIEU-MEDIA.md).
// Khong dong goi sw.js: service worker se bypass asset interceptor (request tu SW
// khong di qua shouldInterceptRequest) va lam hong viec doc asset local; game dang
// ky SW kieu fire-and-forget nen file 404 la vo hai.
val syncGameAssets = tasks.register("syncGameAssets", Copy::class) {
    from(rootDir.resolve("game")) {
        exclude("img", "snd", "music", "fx", "jdata")
        exclude(".gitignore", ".gitattributes", ".assetsignore", "wrangler.jsonc", "README.md", "sw.js")
    }
    into(layout.projectDirectory.dir("src/main/assets/game"))
    doFirst {
        layout.projectDirectory.dir("src/main/assets/game").asFile.deleteRecursively()
    }
}

tasks.named("preBuild") { dependsOn(syncGameAssets) }
