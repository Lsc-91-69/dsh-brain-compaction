/**
 * index.ts — dsh-brain-compaction 插件（Host 半区）入口。
 *
 * Cordis registry-ready：exports { name, apply, inject, Config }。
 * - 统一配置：注册 brain-compaction settings namespace（面板/用户层）。
 * - 协调工具：brain_status（状态）、brain_verify（验证）、brain_recall（统一召回）。
 * - 协同事件：监听 session/event, 对 compaction/summary 打一条摘要日志。
 * - boot 自检：按 selfTestAfterBoot 输出组件矩阵 warn（缺件不崩）。
 *
 * 本插件不 import 任何子插件包（integration.ts 全部走运行时探测），因此
 * 任何子插件缺失/禁用都不影响本插件正常挂载。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installSettingsSection } from '@deepseek-ai/dsh-settings'
import {
  BRAIN_NAMESPACE,
  BrainSettingsSchema,
  BRAIN_DEFAULTS,
  resolveBrainSettings,
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

export function apply(ctx, config = {}) {
  // ── 统一配置（settings 层与组合层合一）──────────────────────────────
  let source = () => ({ ...BRAIN_DEFAULTS, ...(config ?? {}) })
  let settings = resolveBrainSettings(source())
  installSettingsSection(ctx, BRAIN_NAMESPACE, BrainSettingsSchema, source(), {
    setSource: (next) => { source = next },
    onChange: () => { settings = resolveBrainSettings(source()) },
    validate: (value) => { resolveBrainSettings(value) },
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
