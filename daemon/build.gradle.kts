plugins {
    kotlin("jvm") version "2.3.21"
    kotlin("plugin.serialization") version "2.3.21"
    application
}

repositories {
    mavenCentral()
    maven("https://repo.gradle.org/gradle/libs-releases")
}

dependencies {
    implementation("org.gradle:gradle-tooling-api:9.5.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    runtimeOnly("org.slf4j:slf4j-simple:2.0.17")
    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass = "com.magpie.uiv.daemon.MainKt"
    applicationName = "uiv-render-daemon"
}

tasks.test {
    useJUnitPlatform()
}
