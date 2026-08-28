/**
 * config.ts — 统一配置（unified config）：dsh-brain-compaction 的 Host 侧 settings namespace。
 *
 * 设计：
 * - 本插件注册自己的 namespace `brain-compaction`，只承载"统一层"自身的旋钮
 *   （boot 自检、验证粒度）。
 * - 子插件的运行时可调项【不复制】到统一层：统一面板（客户端）通过
 *   settingsScope 逐个绑定各子插件自己的 namespace（compaction-instant /
 *   headroom），用户在一块卡片里一站式调整，但写入仍走各插件的原生校验与
 *   生效通道（installSettingsSection 的 schema + validate）。
 * - 组合级配置（argp / sgme / vault / mcp-lens / context-doctor 均无 settings
 *   命名空间）保持在 cordis.patch.yml 直配——这是 DSH 的静态组合平面；统一
 *   面板会把这些项标为"组合配置"，并给出修改指引（见 README「配置矩阵」）。
 */
import { settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** 统一层 settings namespace（kebab-case 校验由 settingsNamespace 强制）。 */
export const BRAIN_NAMESPACE: SettingsNamespace = settingsNamespace('brain-compaction')

/** 统一层自己的可调参数 schema（schemastery；行组合配置与 settings 共用）。 */
export const BrainSettingsSchema = z.object({
  /** boot 时执行一次集成自检（组件矩阵），缺失组件打 warn。默认 true。 */
  selfTestAfterBoot: z.boolean().default(true),
  /** brain_verify 输出粒度：summary | developer。默认 summary。 */
  verifyDetail: z.string().default('summary'),
})

export interface BrainSettings {
  selfTestAfterBoot: boolean
  verifyDetail: 'summary' | 'developer'
}

export const BRAIN_DEFAULTS: BrainSettings = {
  selfTestAfterBoot: true,
  verifyDetail: 'summary',
}

/**
 * 归一 + 校验（settings 写入与组合行配置都在这里收口）。
 * @param raw - 未经信任的原始配置（schema 已保证类型，这里只做语义归一）。
 */
export function resolveBrainSettings(raw: unknown): BrainSettings {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    selfTestAfterBoot: source.selfTestAfterBoot !== false,
    verifyDetail: source.verifyDetail === 'developer' ? 'developer' : 'summary',
  }
}
