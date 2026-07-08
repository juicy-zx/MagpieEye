plugins {
    `kotlin-dsl`
}

gradlePlugin {
    plugins {
        register("uivScreenshot") {
            id = "uiv.screenshot"
            implementationClass = "UivScreenshotConventionPlugin"
        }
    }
}
