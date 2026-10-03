import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Ky so release: doc keystore.properties o goc project (gitignored, khong commit).
// Neu file khong ton tai, release fallback sang debug signing de build van chay.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

android {
    namespace = "vn.name.mrkiet.volam"
    compileSdk = 35

    defaultConfig {
        applicationId = "vn.name.mrkiet.volam"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
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

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePropsFile.exists()) signingConfigs.getByName("release")
                else signingConfigs.getByName("debug")
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
}

// Dong bo file game tu thu muc game/ cua project vao assets cua APK moi lan build.
// Khong dong goi sw.js: service worker se bypass asset interceptor (request tu SW
// khong di qua shouldInterceptRequest) va lam hong viec doc asset local; game dang
// ky SW kieu fire-and-forget nen file 404 la vo hai.
val syncGameAssets = tasks.register("syncGameAssets", Copy::class) {
    from(rootDir.resolve("game")) {
        exclude(".gitignore", ".gitattributes", ".assetsignore", "wrangler.jsonc", "README.md", "sw.js")
    }
    into(layout.projectDirectory.dir("src/main/assets/game"))
    doFirst {
        layout.projectDirectory.dir("src/main/assets/game").asFile.deleteRecursively()
    }
}

tasks.named("preBuild") { dependsOn(syncGameAssets) }
