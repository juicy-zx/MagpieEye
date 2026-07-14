import org.gradle.api.provider.ListProperty
import org.gradle.api.provider.Property

/**
 * uiv.screenshot 插件 DSL(P0-8 产品化)。
 * 默认"零覆盖":全部开关默认不注入/空集,目标工程 Test task 既有配置优先。
 */
abstract class UivScreenshotExtension {
    /**
     * 是否注入 -Djava.awt.headless=true(默认 false)。
     * codex 决断:headless 若真渲染必需 → 目标工程显式 opt-in,插件不无条件强加。
     */
    abstract val headless: Property<Boolean>

    /**
     * 受控转发给 test worker JVM 的系统属性 key(默认空集)。
     * gradlew -D 只落在 daemon JVM,须显式声明才转发给 fork 出的 test worker。
     * codex 决断:项目显式声明的受控映射,不硬编码闭集、不扩大成任意透传。
     */
    abstract val forwardSystemProperties: ListProperty<String>

    /**
     * 受控转发为 test worker 系统属性的 Gradle 属性 key(默认空集)。
     * 同为项目显式声明的受控映射。
     */
    abstract val forwardGradleProperties: ListProperty<String>
}
