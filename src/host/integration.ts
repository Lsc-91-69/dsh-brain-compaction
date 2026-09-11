/**
 * integration.ts — 子插件的集成与协调逻辑（深度融合，非简单依赖）。
 *
 * 原则：
 * 1. 零代码耦合：不 import 任何子插件包。运行时一律通过服务探测
 *    （ctx.get('compaction') / ctx.get('tokenMeter')…）与工具注册表探测
 *    （ctx.tools.schemas()）感知"谁在场"，缺装即降级，永不炸。
 * 2. 引擎仲裁：ctx.compaction 同一上下文只允许一个实现（compaction-basic /
 *    argp / instant / headroom 互斥）。matrix 按【引擎类名 + 工具签名】判定
 *    当前激活引擎，并给出切换指引。
 * 3. 工具命名空间：子插件工具保留原厂唯一名（argp: recall_pruned /
 *    list_pruned / recall；instant: recall / search；headroom:
 *    headroom_retrieve；vault: memory_*；sgme: memory_search / wiki_ / signal_ /
 *    role_ / idea_add / demand_create / project_register…；lens: mcp_search /
 *    mcp_call；doctor: context_audit）。唯一真实冲突是 argp 与 instant 都注册
 *    工具 `recall`（tools 注册器对重名直接抛错），由引擎互斥消除；
 *    统一层新增 brain_* 前缀的稳定入口（brain_status / brain_verify /
 *    brain_recall）供预设提示词使用。
 * 4. 验证机制：brain_verify 输出组件矩阵 + 会话 token 快照 + 最近压缩历史
 *    （compaction/summary 事件，含前后对比字段），并自动接入
 *    dsh-context-doctor 的 context_audit（注入物 token 审计）。
 */
import type { Context } from '@deepseek-ai/cordis'

/** 集成组件目录：行 id、归属、预期工具、默认启用。 */
export interface BrainComponent {
  id: string
  label: string
  row: string
  /** 实际 npm 包名（无工具/无服务组件用它做 import.meta.resolve 探测）。 */
  pkg?: string
  kinds: Array<'engine' | 'compression' | 'memory' | 'mcp' | 'audit' | 'routing'>
  tools: string[]
  defaultOn: boolean
  external?: boolean
}

export const COMPONENTS: BrainComponent[] = [
  {
    id: 'argp',
    label: 'dsh-argp 原子引用图剪枝（0-LLM 压缩引擎）',
    row: 'dsh-argp',
    kinds: ['engine'],
    tools: ['recall_pruned', 'list_pruned', 'recall'],
    defaultOn: true,
  },
  {
    id: 'instant',
    label: 'dsh-compaction-instant 即时近无损引擎（VCC 式）',
    row: 'brain-compaction-instant',
    kinds: ['engine'],
    tools: ['recall', 'search'],
    defaultOn: false,
  },
  {
    id: 'headroom',
    label: '@wanyantiande/dsh-headroom 工具输出压缩 + CCR 可逆存储',
    row: 'brain-headroom',
    kinds: ['engine', 'compression'],
    tools: ['headroom_retrieve'],
    defaultOn: false,
  },
  {
    id: 'vault',
    label: 'dsh-memory-vault 跨会话记忆库',
    row: 'brain-memory-vault',
    kinds: ['memory'],
    tools: ['memory_remember', 'memory_recall', 'memory_forget'],
    defaultOn: true,
  },
  {
    id: 'sgme',
    label: 'dsh-sgme 拾光记忆引擎（多智能体共享）',
    row: 'brain-sgme',
    kinds: ['memory'],
    tools: [
      'memory_search', 'memory_get', 'memory_reject',
      'wiki_search', 'wiki_pages', 'wiki_page', 'wiki_page_update', 'wiki_page_add',
      'signal_pull', 'signal_claim', 'signal_ack',
      'idea_add', 'demand_create', 'project_register',
      'role_list', 'role_assemble', 'role_active_get', 'role_active_set',
    ],
    defaultOn: false,
  },
  {
    id: 'lens',
    label: 'dsh-mcp-lens MCP 工具懒加载（2 个模型工具）',
    row: 'brain-mcp-lens',
    kinds: ['mcp'],
    tools: ['mcp_search', 'mcp_call'],
    defaultOn: true,
  },
  {
    id: 'doctor',
    label: 'dsh-context-doctor 注入审计（context_audit）',
    row: 'context-doctor',
    pkg: 'dsh-context-doctor',
    kinds: ['audit'],
    tools: ['context_audit'],
    defaultOn: false,
    external: true,
  },
  {
    id: 'routing',
    label: 'dsh-routing-suite 智能路由（"We Need" 思维链, 0 额外 LLM 调用）',
    row: 'brain-routing-suite',
    pkg: 'dsh-routing-suite',
    kinds: ['routing'],
    tools: [],
    defaultOn: true,
  },
]

/** 统一层自己的稳定入口工具。 */
export const BRAIN_TOOLS = ['brain_status', 'brain_verify', 'brain_recall']

/**
 * 引擎类名 → 组件 id。
 * dsh-argp 1.1.0 除默认的 ArgpGraphEngine 外还导出 T1/Recall/Probe 三个
 * CompactionEngine 子类（同一包的不同装配面），任一成为 ctx.compaction 都算
 * argp 引擎在本会话生效——否则 brain_verify 会因为"不认识类名"而误报 FAIL。
 */
const ENGINE_CLASS_MAP: Record<string, string> = {
  ArgpGraphEngine: 'argp',
  ArgpT1Engine: 'argp',
  ArgpRecallEngine: 'argp',
  ArgpProbeEngine: 'argp',
  InstantCompactionEngine: 'instant',
  HeadroomCompactionEngine: 'headroom',
}

/**
 * 模块是否可解析（用于无模型工具、无服务暴露的组件——如 dsh-routing-suite,
 * 它只在 system-prompt/assemble 时注入引导段, 工具矩阵里没有它的身影）。
 * 走 ESM import.meta.resolve, 零 import 耦合; 失败一律返回 false。
 */
export function moduleResolvable(spec: string): boolean {
  try {
    const meta = import.meta as unknown as { resolve?: (s: string) => string }
    if (typeof meta.resolve !== 'function') return false
    meta.resolve(spec)
    return true
  } catch {
    return false
  }
}

/** 从 ctx.tools.schemas() 读出当前 scope 的工具名集合（容错）。 */
export function detectTools(ctx: Context): Set<string> {
  const names = new Set<string>()
  try {
    const schemas: unknown = ctx.tools?.schemas?.() ?? []
    if (Array.isArray(schemas)) {
      for (const s of schemas) {
        const n = (s as { name?: unknown })?.name
        if (typeof n === 'string' && n.length > 0) names.add(n)
      }
    }
  } catch {
    /* schema 投影失败不阻断状态工具 */
  }
  return names
}

/** 当前激活的压缩引擎组件 id（依据 ctx.compaction 实例类名）。 */
export function engineOf(ctx: Context): { id: string | null; className: string } {
  const engine = ctx.get?.('compaction')
  const className = typeof engine?.constructor?.name === 'string' ? engine.constructor.name : ''
  if (className === '') return { id: null, className: '' }
  return { id: ENGINE_CLASS_MAP[className] ?? null, className }
}

/** 当前会话 token 快照（tokenMeter.measure 的叶子字段；全程 try/catch）。 */
export function tokenSnapshot(ctx: Context, session: unknown): { totalTokens: number } | null {
  const meter = ctx.get?.('tokenMeter')
  if (meter === undefined || session === undefined || session === null) return null
  try {
    const measured = meter.measure(session)
    if (typeof measured === 'number') return { totalTokens: measured }
    if (measured !== null && typeof measured === 'object') {
      const v = measured as Record<string, unknown>
      const total = Number(v.totalTokens ?? v.tokens ?? Number.NaN)
      if (Number.isFinite(total)) return { totalTokens: total }
    }
  } catch {
    /* 计量失败不算体系故障 */
  }
  return null
}

/** 提取事件中允许跨 context 交换的叶子字段（不序列化 live 对象）。 */
function pickPrimitives(data: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
    }
  }
  return out
}

/** 会话最近的 compaction/summary 事件（含压缩前后字段，尽力提取）。 */
export function compactionHistory(session: unknown, limit = 3): {
  count: number
  last: Array<{ seq?: number; data: Record<string, string | number | boolean> }>
} {
  const events = sessionEvents(session)
  const hits: Array<{ seq?: number; data: Record<string, string | number | boolean> }> = []
  if (events !== undefined) {
    // 最近的 N 条（从尾往前扫），再按时间正序返回，读起来才是"历史"。
    for (let i = events.length - 1; i >= 0 && hits.length < limit; i -= 1) {
      const evt = events[i] as { type?: unknown; seq?: unknown; data?: unknown }
      if (evt?.type !== 'compaction/summary') continue
      hits.push({
        ...(typeof evt.seq === 'number' ? { seq: evt.seq } : {}),
        data: pickPrimitives(evt.data),
      })
    }
    hits.reverse()
  }
  return { count: countAll(events), last: hits }
}

/**
 * 读出会话日志（跨 DSH 版本的兼容读取）。
 *
 * DSH 0.1.5：`Session` 暴露 `snapshotEvents()`（可选半开区间），不再有
 * `.events` 属性——旧实现读 `session.events` 恒为 undefined，于是
 * brain_verify 的"压缩前后对比"永远报 count 0 / last []（静默失效）。
 * 这里两种形状都探测，任何异常一律降级为 undefined（不阻断状态工具）。
 */
function sessionEvents(session: unknown): readonly unknown[] | undefined {
  const carrier = session as { snapshotEvents?: unknown; events?: unknown } | null
  if (carrier === null || carrier === undefined || typeof carrier !== 'object') return undefined
  try {
    if (typeof carrier.snapshotEvents === 'function') {
      const events = (carrier.snapshotEvents as () => unknown)()
      if (Array.isArray(events)) return events
    }
    if (Array.isArray(carrier.events)) return carrier.events
  } catch {
    /* 投影失败不算体系故障 */
  }
  return undefined
}

function countAll(events: readonly unknown[] | undefined): number {
  if (!Array.isArray(events)) return 0
  let n = 0
  for (const e of events) {
    if ((e as { type?: unknown })?.type === 'compaction/summary') n += 1
  }
  return n
}

/** 组件在场性矩阵：每个组件的预期工具实际注册了几个。 */
export function componentMatrix(ctx: Context, toolNames: Set<string>): Array<{
  id: string
  label: string
  row: string
  kinds: string[]
  expected: string[]
  present: string[]
  missing: string[]
  defaultOn: boolean
  state: 'active' | 'disabled' | 'missing'
}> {
  const activeEngine = engineOf(ctx).id
  return COMPONENTS.map((c) => {
    const present = c.tools.filter((t) => toolNames.has(t))
    const missing = c.tools.filter((t) => !toolNames.has(t))
    // 无模型工具、无服务暴露的组件（如 routing）无法用工具矩阵探测,
    // 改用包可解析性（installed = 可作为行挂载; 由本插件 patch 保证挂载）。
    const toolLess = c.tools.length === 0 && c.pkg !== undefined
    if (toolLess) {
      const installed = moduleResolvable(c.pkg)
      return {
        id: c.id,
        label: c.label,
        row: c.row,
        kinds: c.kinds,
        expected: c.tools,
        present: [],
        missing: [] as string[],
        defaultOn: c.defaultOn,
        state: installed ? 'active' : 'missing',
      }
    }
    const isEngine = c.kinds.includes('engine')
    const isActiveEngine = isEngine && activeEngine === c.id
    const engineSide = !isEngine
      ? present.length > 0
      : isActiveEngine || (present.length > 0 && activeEngine === null)
    const state: 'active' | 'disabled' | 'missing' = engineSide ? 'active' : (present.length > 0 && !isEngine) ? 'active' : c.defaultOn ? 'missing' : 'disabled'
    return {
      id: c.id,
      label: c.label,
      row: c.row,
      kinds: c.kinds,
      expected: c.tools,
      present,
      missing,
      defaultOn: c.defaultOn,
      state,
    }
  })
}

/** 汇总状态（brain_status 的纯数据载荷）。 */
export function buildStatus(ctx: Context, session: unknown) {
  const toolNames = detectTools(ctx)
  const engine = engineOf(ctx)
  const matrix = componentMatrix(ctx, toolNames)
  const tokens = tokenSnapshot(ctx, session)
  const computation = compactionHistory(session, 3)
  const activeEngine = matrix.find((m) => m.kinds.includes('engine') && m.state === 'active') ?? null
  return {
    system: 'dsh-brain-compaction 人脑式上下文压缩体系',
    activeEngine: activeEngine === null ? null : { id: activeEngine.id, className: engine.className },
    components: matrix.map((m) => ({
      id: m.id,
      label: m.label,
      row: m.row,
      state: m.state,
      toolsPresent: m.present,
      toolsMissing: m.missing,
    })),
    unifiedTools: { expected: BRAIN_TOOLS, present: BRAIN_TOOLS.filter((t) => toolNames.has(t)) },
    sessionTokens: tokens,
    compaction: computation,
    note: '工具恢复/记忆类的对等工具名见 README「工具命名空间」；矩阵只读，不修改任何组件。',
  }
}

/** 验证报告（brain_verify）。detail=developer 时附带建议与指引。 */
export function verifyReport(ctx: Context, session: unknown, detail: 'summary' | 'developer') {
  const toolNames = detectTools(ctx)
  const engine = engineOf(ctx)
  const matrix = componentMatrix(ctx, toolNames)
  const tokens = tokenSnapshot(ctx, session)
  const history = compactionHistory(session, 3)
  const verdicts = matrix.map((m) => {
    const ok = m.state === 'active' && m.missing.length === 0
    const text = ok
      ? `PASS  ${m.label}（行 ${m.row}）在场，工具齐备`
      : m.state === 'disabled'
        ? `SKIP  ${m.label}（行 ${m.row}）默认禁用：${m.id === 'sgme' ? '需要 SGME 网关 + 密钥' : m.id === 'headroom' ? '需要本地 Headroom 代理' : m.id === 'instant' ? '与 argp 引擎互斥（备选引擎）' : m.id === 'doctor' ? '未安装（GitHub-only，可选）' : '组合中禁用' }`
        : `FAIL  ${m.label}（行 ${m.row}）预期在场但工具缺失: ${m.missing.join(', ') || '(无模型工具——包不可解析或未安装)'}`
    return { id: m.id, ok, text }
  })
  const engineCheck = {
    ok: engine.id !== null,
    className: engine.className === '' ? null : engine.className,
    text: engine.id
      ? `PASS  压缩引擎 ctx.compaction = ${engine.className}（→ ${engine.id}）`
      : engine.className === ''
        ? 'FAIL  未发现 ctx.compaction 压缩引擎：请检查 profile 组合（compaction-basic 必须被禁用且仅一个引擎行启用）'
        : `FAIL  发现了 ctx.compaction = ${engine.className}，但该实现不在已知引擎表内（argp/instant/headroom）——若是新引擎，请在 integration.ts 的 ENGINE_CLASS_MAP 中登记`,
  }
  const guidance = [
    '1) token 现状：' + (tokens === null ? '（无 tokenMeter 或会话不可计量）' : `会话约 ${tokens.totalTokens} tokens（tokenMeter 估算）`),
    '2) 压缩前后对比：最近一次 compaction/summary 事件数据见上（shadowed/checkpoint 字段为引擎在事件中的原样叶子值）；连续两次 /compact 后重新调用 brain_verify 即为压缩前后 Token 对比。',
    '3) 注入物成本审计：' + (toolNames.has('context_audit') ? 'context_audit 已可用，调用它获得 AGENTS.md 指令链/技能目录/工具 schema/MCP 工具面 token 成本与裁剪建议。' : 'context_audit 未安装：`dsh plugin --profile web add "github:Zhenyu98/dsh-context-doctor#main"` 后重启即可纳入本验证。'),
    '4) 若引擎行异常：确认 cordis.patch.yml 中 compaction-basic 处于 disabled，且 argp/instant/headroom 三个引擎行恰好一个未 disabled（重名工具 recall 会直接抛错）。',
  ]
  return {
    system: 'dsh-brain-compaction 验证报告',
    at: new Date().toISOString(),
    engine: engineCheck,
    verdicts,
    sessionTokens: tokens,
    compactionHistory: history,
    guidance: detail === 'developer' ? guidance : guidance.slice(0, 2),
  }
}

/**
 * brain_recall 统一召回入口：优先走引擎的程序化 API（argp 暴露
 * recall/recallQuery），不暴露程序化 recall 的引擎（instant/headroom）回退为
 * 指引文本，绝不"替子插件猜"。
 * @returns 面向模型的文本结果。
 */
export function recallDispatch(ctx: Context, args: { query?: string; seq?: number; maxResults?: number }): string {
  const engine = ctx.get?.('compaction')
  if (engine === undefined) {
    return 'brain_recall: 未发现压缩引擎（ctx.compaction）。请检查 profile 组合：compaction-basic 应被禁用，且 argp / instant / headroom 恰有一个引擎行启用。'
  }
  const limit = Number.isFinite(args.maxResults) && args.maxResults > 0 ? Math.floor(args.maxResults) : 5
  if (args.seq !== undefined && args.seq !== null && typeof (engine as { recall?: unknown }).recall === 'function') {
    try {
      const text = (engine as { recall: (s: number) => string | null }).recall(Number(args.seq))
      if (text === null) {
        return `[brain_recall seq=${args.seq}] 该 seq 未被遮蔽或不在本引擎日志中；可改用列表/搜索工具（list_pruned / recall / search），或查询记忆库。`
      }
      return `[brain_recall seq=${args.seq}]（原样取回）\n${text}`
    } catch (error) {
      return `brain_recall: 引擎 recall 失败：${error instanceof Error ? error.message : String(error)}`
    }
  }
  if (typeof args.query === 'string' && args.query.length > 0 && typeof (engine as { recallQuery?: unknown }).recallQuery === 'function') {
    try {
      return `[brain_recall query=${args.query}]\n${(engine as { recallQuery: (q: string, n: number) => string }).recallQuery(args.query, limit)}`
    } catch (error) {
      return `brain_recall: 引擎 recallQuery 失败：${error instanceof Error ? error.message : String(error)}`
    }
  }
  const className = typeof engine?.constructor?.name === 'string' ? engine.constructor.name : 'unknown'
  const hint = className === 'InstantCompactionEngine' ? 'recall / search' : className === 'HeadroomCompactionEngine' ? 'headroom_retrieve' : 'recall_pruned / list_pruned / recall'
  return `brain_recall: 当前引擎（${className}）不暴露程序化 recall；请直接调用它的模型工具：${hint}。`
}
