/**
 * index.ts — dsh-brain-compaction 插件（Host 半区）入口。
 *
 * Cordis registry-ready：exports { name, apply, inject, Config }。
 * - 统一配置：向 ctx.settings 注册 brain-compaction namespace（面板/用户层）。
 * - 协调工具：brain_status（状态）、brain_verify（验证）、brain_recall（统一召回）。
 * - 协同事件：监听 session/event, 对 compaction/summary 打一条摘要日志。
 * - boot 自检：按 selfTestAfterBoot 输出组件矩阵 warn（缺件不崩）。
 *
 * 本插件不 import 任何子插件包（integration.ts 全部走运行时探测），因此
 * 任何子插件缺失/禁用都不影响本插件正常挂载。
 *
 * ── DSH 0.1.5 适配 ─────────────────────────────────────────────────────────
 * 1. 包级 `installSettingsSection()` 已删除，改为注册表实例方法
 *    `ctx.settings.installSection()`；`settingsNamespace()` 工厂亦已删除，
 *    namespace 现在是普通字符串（见 config.ts 顶部注释）。
 * 2. settings 因此必须经 `ctx.inject(['settings'], …)` 解析——settings 是
 *    **软依赖**：provider 缺席（如 headless 组合或旧版 DSH）时插件照常挂载，
 *    只退化为"组合层配置"（行 config 仍生效），boot 时打一条 warn。
 * 3. `inject = ['tools']` 保持不变：settings 走软依赖，避免 provider 缺席时
 *    整个插件卡在 waiting 状态。
 * 4. `@deepseek-ai/dsh-settings` 只做 type-only import：该包在 0.1.5 的运行时
 *    导出只剩 { SettingsProvider, SettingsConflictError, redactSecrets }，
 *    任何值导入都会在模块求值期直接抛错。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  BRAIN_NAMESPACE,
  BrainSettingsSchema,
  BRAIN_DEFAULTS,
  resolveBrainSettings,
  type BrainSettings,
} from './config'
import {
  BRAIN_TOOLS,
  buildStatus,
  detectTools,
  engineOf,
  recallDispatch,
  verifyReport,
} from './integration'

export const name = 'dsh-brain-compaction'
export const inject = ['tools']

export { BrainSettingsSchema as Config }

/**
 * 把统一层 namespace 接到 settings provider 上（0.1.5 契约）。
 *
 * 写入仍走 provider 的 schema 校验 + 版本号（revision）围栏；本函数只负责
 * "注册 + 源切换"：settings 在场时以解析值为准（schema 默认 ← 行 base ← 用户
 * 文档），provider 撤离时回落到行 config。
 *
 * @param ctx - settings provider 的 scope context（由 ctx.inject 提供）。
 * @param namespace - 已注册的 brain namespace。
 * @param entry - 行 config 解析出的组合层入口值（同时是 base 与回退值）。
 * @param hooks - 源接收器、变更通知与语义校验。
 */
function installBrainSection(
  ctx: Context,
  namespace: SettingsNamespace,
  entry: BrainSettings,
  hooks: {
    setSource: (next: () => BrainSettings) => void
    onChange: (value: BrainSettings) => void
    validate?: (value: BrainSettings) => void
  },
): void {
  // settings 服务类型由 @deepseek-ai/dsh-settings 的 declare module 增强声明；
  // 0.1.5 在 Context 上暴露的是注册表实例方法 installSection(owner, …)。
  ctx.settings.installSection(ctx, namespace, BrainSettingsSchema, entry, hooks)
}

export function apply(ctx: Context, config: Record<string, unknown> = {}) {
  // ── 统一配置（settings 层与组合层合一）──────────────────────────────
  // entry = 组合层（行 config），settings provider 在场时由它接管 base 值。
  const entry = resolveBrainSettings({ ...BRAIN_DEFAULTS, ...(config ?? {}) })
  let source: () => BrainSettings = () => entry
  let settings: BrainSettings = entry

  // settings 是软依赖：provider 缺席时下面的 inject 永不回调，插件照常工作。
  ctx.inject(['settings'], (scope: Context) => {
    const settingsCtx = scope as Context & { settings: { installSection?: unknown } }
    if (typeof settingsCtx.settings?.installSection !== 'function') {
      // 旧版 DSH（包级 installSettingsSection 时代）或裁剪过的 provider：
      // 不注册、不崩，仅提示该层不可用（组合层配置仍然生效）。
      ctx.logger.warn(
        '[dsh-brain-compaction] settings provider 未暴露 installSection（DSH < 0.1.5？）：统一面板配置不可用，组合层 config 仍然生效',
      )
      return
    }
    installBrainSection(settingsCtx as Context, BRAIN_NAMESPACE, entry, {
      setSource: (next) => { source = next },
      onChange: () => { settings = resolveBrainSettings(source()) },
      validate: (value) => { resolveBrainSettings(value) },
    })
  })

  // ── 协同：压缩摘要日志（每次 compaction/summary 一行叶子数值）───────
  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'compaction/summary') return
    try {
      const data = (event.data ?? {}) as Record<string, unknown>
      const leaf = Object.fromEntries(
        Object.entries(data).filter(
          ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
        ),
      )
      ctx.logger.info('brain-compaction: summary event %s %j', String(event.seq ?? ''), leaf)
    } catch {
      /* 日志失败不影响会话 */
    }
  }, 'dsh-brain-compaction: compaction summary logger')

  // ── 工具 ────────────────────────────────────────────────────────────
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'brain_status',
    description:
      '查看人脑式上下文压缩体系的实时状态：激活的压缩引擎（argp/instant/headroom 之一）、'
      + '各集成组件（argp/instant/headroom/vault/sgme/lens/doctor）的在场性与缺失工具、'
      + '会话 token 占用、最近压缩历史。怀疑压缩/记忆层异常时先调用它。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    presentCall: () => ({ card: 'generic', title: 'Brain compaction status', kind: 'read', rawInput: '' }),
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      return buildStatus(ctx, exec?.agent?.session)
    },
  })), 'dsh-brain-compaction: brain_status')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'brain_verify',
    description:
      '验证上下文压缩体系是否正常工作：输出组件矩阵（PASS/SKIP/FAIL）、引擎服务、'
      + '会话 token 快照、最近 compaction/summary 前后对比，并接入 '
      + 'dsh-context-doctor（如已装）的注入物成本审计。装配完成后、或排查压缩问题时调用。',
    parameters: {
      detail: {
        type: 'string',
        enum: ['summary', 'developer'],
        description: 'summary 精简；developer 附带修复指引。默认使用统一配置中的 verifyDetail。',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    presentCall: () => ({ card: 'generic', title: 'Brain compaction verify', kind: 'read', rawInput: '' }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const detail = args?.detail === 'developer'
        ? 'developer'
        : args?.detail === 'summary'
          ? 'summary'
          : settings.verifyDetail
      return verifyReport(ctx, exec?.agent?.session, detail)
    },
  })), 'dsh-brain-compaction: brain_verify')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'brain_recall',
    description:
      '统一召回入口：按 seq 或关键词找回被压缩/被剪枝的内容。'
      + 'seq 未知时先 list_pruned（argp）/ search（instant）定位；'
      + '跨会话事实用 memory_recall。当前引擎不支持的程序化召回会回退为指引。',
    parameters: {
      query: { type: 'string', description: '按内容关键词/正则召回（argp 引擎支持）' },
      seq: { type: 'number', description: '按日志 seq 精确召回（argp 引擎支持）' },
      maxResults: { type: 'number', description: '关键词召回最大条数（默认 5）' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Recall content',
      kind: 'read',
      rawInput: args?.seq !== undefined ? `seq ${args.seq}` : (args?.query ?? ''),
    }),
    async execute(args) {
      return recallDispatch(ctx, {
        query: typeof args?.query === 'string' ? args.query : undefined,
        seq: typeof args?.seq === 'number' ? args.seq : undefined,
        maxResults: typeof args?.maxResults === 'number' ? args.maxResults : undefined,
      })
    },
  })), 'dsh-brain-compaction: brain_recall')

  // ── boot 自检 ───────────────────────────────────────────────────────
  if (settings.selfTestAfterBoot !== false) {
    try {
      const names = detectTools(ctx)
      const engine = engineOf(ctx)
      if (engine.id === null) {
        ctx.logger.warn('[dsh-brain-compaction] 自检：未检测到压缩引擎（compaction 服务缺失）——请确认 compaction-basic 已禁用且 argp/instant/headroom 恰有一个引擎行启用')
      }
      for (const expected of BRAIN_TOOLS) {
        if (!names.has(expected)) ctx.logger.warn('[dsh-brain-compaction] 自检：统一工具 %s 未注册', expected)
      }
      if (!names.has('recall_pruned') && !names.has('headroom_retrieve') && !names.has('search')) {
        ctx.logger.warn('[dsh-brain-compaction] 自检：未发现任何子插件工具（argp/instant/headroom/vault/lens）——依赖未安装或行未激活')
      }
    } catch (error) {
      ctx.logger.warn('[dsh-brain-compaction] 自检异常（不影响运行）：%s', error instanceof Error ? error.message : String(error))
    }
  }
}
