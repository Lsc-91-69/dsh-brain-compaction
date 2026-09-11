/**
 * test/mount.test.mjs — 真实运行时挂载测试（DSH 0.1.5）。
 *
 * 为什么需要它：契约测试（contract.test.mjs）是纯静态的，只能证明 YAML/包名
 * 层面的组装正确；而 0.1.5 这一轮的不兼容恰恰**全部是运行时 API 形状**：
 *   - 包级 installSettingsSection / settingsNamespace 被删除（模块求值期抛错）；
 *   - Session 不再有 .events（压缩历史静默为空）；
 *   - 浏览器模块表不再有 @deepseek-ai/dsh-client-runtime（卡片 require 落空）。
 * 静态测试对以上三点全部 PASS。本文件把**构建产物** lib/index.js 挂到真实的
 * cordis Context + ToolRuntime + SettingsProvider 上，断言：
 *   1. lib/index.js 可被 import（模块求值不抛错）；
 *   2. apply 后 brain_status / brain_verify / brain_recall 三个工具已注册；
 *   3. brain-compaction settings namespace 注册成功，且 resolve 出组合层值；
 *   4. settings 写入走 provider 的 schema 校验（revision 围栏）；
 *   5. brain_verify 在"有 compaction/summary 历史"的会话上真的读出历史
 *      （0.1.5 snapshotEvents() 路径）；
 *   6. 引擎/组件探测在缺件时优雅降级（不再抛错）。
 *
 * 运行时依赖：需要一份 DSH 安装（提供 @deepseek-ai/cordis、dsh-tools、
 * dsh-settings）。默认按「$DSH_HOME/profiles/node_modules → 仓库根」的顺序
 * 解析；两者都不存在时**跳过**（exit 0），以便在无部署的 CI 上不误报。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const failures = []
let checks = 0
const ok = (name) => { checks += 1; console.log(`PASS  ${name}`) }
const bad = (name, detail) => { checks += 1; failures.push(`${name}: ${detail}`); console.error(`FAIL  ${name}: ${detail}`) }
const skip = (name, why) => { console.log(`SKIP  ${name}（${why}）`) }

/**
 * 从候选根目录里找到含 @deepseek-ai/cordis 的那个。
 *
 * 探测顺序（任一命中即可）：
 *  1. 显式覆盖：`$DSH_RUNTIME_ROOT`；
 *  2. 本机 DSH 部署：`$DSH_HOME/profiles/node_modules`（默认 ~/.dsh，本机是
 *     D:\DeepSeekHarness\.dsh）；
 *  3. **向上遍历本文件所在目录的每一级 `node_modules`** —— 插件既可能躺在
 *     `<repo>/node_modules`（file: 安装），也可能躺在 `.plugins/<name>`（那里
 *     的上一级 `.plugins/node_modules` 是部署侧 junction）；
 *  4. 两个常见兜底路径。
 *
 * 3 是 0.1.5 之后补上的：插件从"多套一层目录"改成"仓库根就是包"以后，原先写死的
 * `process.cwd()/../../deepseek-harness/node_modules` 会失效，导致挂载测试静默跳过。
 */
function findRuntimeRoot() {
  const roots = []
  if (process.env.DSH_RUNTIME_ROOT) roots.push(process.env.DSH_RUNTIME_ROOT)
  if (process.env.DSH_HOME) roots.push(join(process.env.DSH_HOME, 'profiles', 'node_modules'))

  // 3. 从本文件位置向上逐级找 node_modules
  const here = dirname(fileURLToPath(import.meta.url))
  let cursor = here
  for (let depth = 0; depth < 6; depth += 1) {
    roots.push(join(cursor, 'node_modules'))
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }

  roots.push('D:/DeepSeekHarness/.dsh/profiles/node_modules')
  roots.push('D:/deepseek-harness/node_modules')
  for (const root of roots) {
    if (existsSync(join(root, '@deepseek-ai', 'cordis', 'package.json'))) return root
  }
  return undefined
}

const runtimeRoot = findRuntimeRoot()
if (runtimeRoot === undefined) {
  skip('真实运行时挂载测试', '未找到 DSH 安装（设 DSH_RUNTIME_ROOT 或 DSH_HOME 后可跑）')
  console.log(`\n0/0 挂载检查（已跳过）`)
  process.exit(0)
}
console.log(`# runtime root: ${runtimeRoot}\n`)

/** 按目录解析一个裸包名（支持 @scope/name 与 subpath）。 */
function resolveIn(roots, spec) {
  const parts = spec.split('/')
  const pkg = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  const rest = spec.slice(pkg.length)
  for (const root of roots) {
    const pkgDir = join(root, pkg)
    if (!existsSync(join(pkgDir, 'package.json'))) continue
    if (rest === '') return pkgDir
    const sub = join(pkgDir, rest)
    if (existsSync(sub)) return sub
  }
  return undefined
}
const searchRoots = [runtimeRoot, join(runtimeRoot, '..')]
const cordisDir = resolveIn(searchRoots, '@deepseek-ai/cordis')
const toolsDir = resolveIn(searchRoots, '@deepseek-ai/dsh-tools')
const settingsDir = resolveIn(searchRoots, '@deepseek-ai/dsh-settings')
const systemPromptDir = resolveIn(searchRoots, '@deepseek-ai/dsh-system-prompt')

if (cordisDir === undefined || toolsDir === undefined || settingsDir === undefined) {
  skip('真实运行时挂载测试', 'cordis / dsh-tools / dsh-settings 未同时在场')
  console.log(`\n0/0 挂载检查（已跳过）`)
  process.exit(0)
}

/** 读一个包的 exports["."] 入口（import 条件下的）绝对路径。 */
function entryOf(pkgDir) {
  const meta = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  const dot = meta.exports?.['.']
  const rel = typeof dot === 'string'
    ? dot
    : dot?.import?.default ?? dot?.import ?? dot?.default ?? meta.main
  return pathToFileURL(join(pkgDir, rel)).href
}

const { Context } = await import(entryOf(cordisDir))
const { ToolRuntime } = await import(entryOf(toolsDir))
const { SettingsProvider } = await import(entryOf(settingsDir))

// ── 1. 构建产物可 import（模块求值期不抛错）──────────────────────────────
const pluginEntry = pathToFileURL(resolve('lib/index.js')).href
let plugin
try {
  plugin = await import(pluginEntry)
  ok('lib/index.js 可被 import（0.1.5 导出面已在求值期通过）')
} catch (error) {
  bad('lib/index.js import', error instanceof Error ? error.message : String(error))
  console.log(`\n${checks - failures.length}/${checks} 挂载检查通过`)
  process.exit(1)
}

// ── 内存 settings provider（最小真实子类, 与官方测试夹具同构）──────────
class MemorySettings extends SettingsProvider {
  constructor(ctx, doc = {}) {
    super(ctx)
    this.doc = structuredClone(doc)
  }
  get writable() { return true }
  load() { return Promise.resolve(structuredClone(this.doc)) }
  async persist(ns, section) {
    this.doc[ns] = structuredClone(section)
  }
}

const ctx = new Context()
// ToolRuntime 静态依赖 systemPrompt（0.1.5 起），必须先在场——否则 tools
// 服务永远不出现，本插件会一直 PENDING。这里挂真实的 SystemPrompt 行。
if (systemPromptDir !== undefined) {
  const { SystemPrompt } = await import(entryOf(systemPromptDir))
  await ctx.plugin(SystemPrompt, {
    includeHarnessIdentity: true,
    includeRuntimeContext: false,
    personaPrefix: '',
    personaSuffix: '',
  })
} else {
  skip('SystemPrompt 行', '未找到 @deepseek-ai/dsh-system-prompt（ToolRuntime 可能停在 PENDING）')
}
const toolsFiber = await ctx.plugin(ToolRuntime)
await toolsFiber
const settingsFiber = await ctx.plugin(MemorySettings)
await settingsFiber

// ── 2. 挂载插件本体 ─────────────────────────────────────────────────────
const fiber = await ctx.plugin(plugin)
await fiber
// cordis FiberState：0=PENDING, 1=LOADING, 2=ACTIVE, 3=FAILED, 4=DISPOSED
const state = fiber?.state
state === 2
  ? ok('插件 fiber 已 ACTIVE（依赖解析完成）')
  : bad('插件 fiber', `state=${String(state)}（期望 2=ACTIVE；0=PENDING 说明依赖服务缺席）`)

// ── 3. 三个统一工具已注册 ───────────────────────────────────────────────
const names = new Set()
try {
  for (const s of ctx.tools.schemas()) if (typeof s?.name === 'string') names.add(s.name)
} catch (error) {
  bad('ctx.tools.schemas()', String(error))
}
for (const tool of ['brain_status', 'brain_verify', 'brain_recall']) {
  names.has(tool) ? ok(`工具已注册: ${tool}`) : bad('工具注册', `${tool} 不在注册表中`)
}

// ── 4. settings namespace 注册 + 组合层值 ───────────────────────────────
let descriptor
try {
  descriptor = ctx.settings.describe().find(d => String(d.ns) === 'brain-compaction')
} catch (error) {
  bad('ctx.settings.describe()', String(error))
}
if (descriptor === undefined) {
  bad('settings namespace', 'brain-compaction 未注册（0.1.5 面板卡片不会出现）')
} else {
  ok('settings namespace 已注册: brain-compaction')
  descriptor.value?.selfTestAfterBoot === true
    ? ok('schema 默认值生效（selfTestAfterBoot=true）')
    : bad('schema 默认值', `selfTestAfterBoot=${JSON.stringify(descriptor.value?.selfTestAfterBoot)}`)
  descriptor.value?.verifyDetail === 'summary'
    ? ok('verifyDetail 默认 summary（联合类型 schema 可用）')
    : bad('verifyDetail 默认', `verifyDetail=${JSON.stringify(descriptor.value?.verifyDetail)}`)
}

// ── 5. settings 写入走 provider 校验 ────────────────────────────────────
if (descriptor !== undefined) {
  try {
    await ctx.settings.update('brain-compaction', { verifyDetail: 'developer' })
    const after = ctx.settings.get('brain-compaction')
    after?.verifyDetail === 'developer'
      ? ok('settings 写入生效（update + resolve）')
      : bad('settings 写入', `verifyDetail=${JSON.stringify(after?.verifyDetail)}`)
  } catch (error) {
    bad('settings 写入', error instanceof Error ? error.message : String(error))
  }
}

// ── 6. brain_verify 真的读出压缩历史（0.1.5 snapshotEvents 路径）────────
const fakeSession = {
  snapshotEvents: () => ([
    { type: 'user/message', seq: 1, data: { text: 'hello' } },
    { type: 'compaction/summary', seq: 2, data: { compactionId: 'c1', shadowedTokenCount: 1234, provider: 'deepseek' } },
    { type: 'assistant/message', seq: 3, data: { text: 'ok' } },
    { type: 'compaction/summary', seq: 4, data: { compactionId: 'c2', shadowedTokenCount: 999, model: 'flash' } },
  ]),
}
// exec.agent.session 是会话的来源（工具读的正是它），所以夹具要挂在 agent 上。
const exec = {
  callId: 'test-call',
  name: 'brain_verify',
  arguments: {},
  signal: new AbortController().signal,
  agent: { session: fakeSession },
}
const verifyTool = ctx.tools.get('brain_verify')
if (verifyTool === undefined) {
  bad('brain_verify 执行', '工具未注册')
} else {
  try {
    const report = await verifyTool.execute({ detail: 'developer' }, exec)
    report?.compactionHistory?.count === 2
      ? ok('brain_verify 读出 2 条 compaction/summary 历史（snapshotEvents 路径）')
      : bad('压缩历史', `count=${JSON.stringify(report?.compactionHistory?.count)}（0 表示仍在读旧的 .events）`)
    report?.compactionHistory?.last?.length === 2
      ? ok('压缩历史 last 字段已提取（新→旧扫尾后正序）')
      : bad('压缩历史 last', JSON.stringify(report?.compactionHistory?.last))
    report?.compactionHistory?.last?.[1]?.data?.shadowedTokenCount === 999
      ? ok('最新一条历史在前（leaf 字段可读）')
      : bad('压缩历史顺序', JSON.stringify(report?.compactionHistory?.last))
    Array.isArray(report?.verdicts) && report.verdicts.length > 0
      ? ok(`组件矩阵已产出（${report.verdicts.length} 项，缺件优雅降级）`)
      : bad('组件矩阵', 'verdicts 为空')
    report?.engine?.ok === false
      ? ok('无压缩引擎时引擎判定为 FAIL 而非抛错（软依赖降级）')
      : bad('引擎判定', `engine=${JSON.stringify(report?.engine)}`)
  } catch (error) {
    bad('brain_verify 执行', error instanceof Error ? `${error.message}\n${error.stack}` : String(error))
  }
}

// ── 7. brain_status 可执行 ──────────────────────────────────────────────
const statusTool = ctx.tools.get('brain_status')
if (statusTool !== undefined) {
  try {
    const status = await statusTool.execute({}, { ...exec, name: 'brain_status' })
    Array.isArray(status?.components)
      ? ok(`brain_status 产出 ${status.components.length} 个组件状态`)
      : bad('brain_status', JSON.stringify(status).slice(0, 200))
  } catch (error) {
    bad('brain_status 执行', error instanceof Error ? error.message : String(error))
  }
}

// ── 8. brain_recall 在无引擎时给出指引而非崩溃 ──────────────────────────
const recallTool = ctx.tools.get('brain_recall')
if (recallTool !== undefined) {
  try {
    const text = await recallTool.execute({ query: 'anything' }, { ...exec, name: 'brain_recall' })
    typeof text === 'string' && text.includes('brain_recall')
      ? ok('brain_recall 无引擎时回退为指引文本')
      : bad('brain_recall', String(text).slice(0, 200))
  } catch (error) {
    bad('brain_recall 执行', error instanceof Error ? error.message : String(error))
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────
console.log(`\n${checks - failures.length}/${checks} 挂载检查通过`)
if (failures.length > 0) {
  console.error('\n挂载失败:')
  for (const f of failures) console.error(' - ' + f)
  process.exit(1)
}

