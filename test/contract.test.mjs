/**
 * test/contract.test.mjs — 静态契约测试（无外部依赖，node --test 或直接 node 运行）。
 *
 * 校验 dsh-brain-compaction 的组装契约：
 * 1. bundle 声明：package.json.dsh.bundle.patch 指向 cordis.patch.yml。
 * 2. patch 插入的每个行 name 都必须能在 node_modules 解析（dep 或自身）。
 * 3. 引擎互斥：compaction-basic 被禁用；argp / brain-compaction-instant /
 *    brain-headroom 三个引擎行中恰好一个未禁用（argp 与 instant 的工具
 *    `recall` 重名, tools 注册器会直接抛错 → 必须互斥）。
 * 4. 统一面板与 host 工具名一致（src/client.js 注册 id 与包名一致）。
 * 5. 可分发性回归（曾发生/易踩的坑）。
 * 6. **DSH 0.1.5 适配回归**：源码里绝不能再出现 0.1.5 已删除的 API 形状
 *    （包级 installSettingsSection / settingsNamespace、session.events、
 *    @deepseek-ai/dsh-client-runtime）。运行时侧由 test/mount.test.mjs 与
 *    test/client.test.mjs 真正跑一遍，这里守住"别改回去"。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
let checks = 0
const ok = (name) => { checks += 1; console.log(`PASS  ${name}`) }
const bad = (name, detail) => { checks += 1; failures.push(`${name}: ${detail}`); console.error(`FAIL  ${name}: ${detail}`) }

// ── 1. bundle 声明 ──
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
pkg.dsh?.bundle?.patch === './cordis.patch.yml'
  ? ok('package.json dsh.bundle.patch → ./cordis.patch.yml')
  : bad('bundle 声明', 'dsh.bundle.patch 缺失或不为 ./cordis.patch.yml')
existsSync(join(root, pkg.dsh?.bundle?.patch ?? ''))
  ? ok('cordis.patch.yml 存在')
  : bad('cordis.patch.yml', '文件缺失')

// ── 2. patch 行 name 可解析（对应 package.json dependencies + 自身）──
const patchText = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const rowNames = [...patchText.matchAll(/^\s*-\s*id: [^\n]+?\n\s*name:\s*['"]?([^'"\n\s]+)/gm)]
  .map((m) => m[1])
const resolvable = new Set([pkg.name, ...Object.keys(pkg.dependencies ?? {})])
const norm = (name) => {
  const parts = name.split('/')
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}
for (const name of rowNames) {
  const base = norm(name)
  if (resolvable.has(base)) ok(`行可解析: ${name}`)
  else bad('行不可解析', `${name} 不在 dependencies 中（hoisted linker 下无法被 loader 解析）`)
}

// ── 3. 引擎互斥 ──
const engineRows = ['dsh-argp', 'brain-compaction-instant', 'brain-headroom']
const lines = patchText.split(/\r?\n/)
const disabledBy = new Map() // id -> boolean
let currentId = null
for (const line of lines) {
  const idMatch = /^\s*-\s*id:\s*([\w.-]+)/.exec(line)
  if (idMatch) currentId = idMatch[1].trim()
  if (/disabled:\s*true/.test(line) && currentId !== null) disabledBy.set(currentId, true)
}
const basicDisabled = patchText.includes('- id: compaction-basic') && disabledBy.has('compaction-basic')
basicDisabled ? ok('compaction-basic 已禁用') : bad('compaction-basic 禁用', '未找到 compaction-basic disabled: true')

const enabledEngines = engineRows.filter((id) => !disabledBy.has(id))
enabledEngines.length === 1
  ? ok(`引擎互斥成立（启用: ${enabledEngines[0]}）`)
  : bad('引擎互斥', `应恰好一个引擎行未 disabled，实际: ${enabledEngines.join(', ') || '(无)'}`)

// 0.1.5：默认引擎必须是已适配的 argp（instant 上游未适配，启用即启动失败）。
enabledEngines[0] === 'dsh-argp'
  ? ok('默认启用引擎 = dsh-argp（0.1.5 已适配的那个）')
  : bad('默认引擎', `实际启用 ${enabledEngines[0]}；DSH 0.1.5 下只应启用 dsh-argp`)

// ── 4. 名称一致性 ──
const client = readFileSync(join(root, 'src/client.js'), 'utf8')
client.includes('id: "dsh-brain-compaction"')
  ? ok('client 注册 id 与包名一致')
  : bad('client 注册 id', 'src/client.js 未以 dsh-brain-compaction 注册 ModuleLoader id')
pkg.name === 'dsh-brain-compaction' ? ok('包名 dsh-brain-compaction') : bad('包名', pkg.name)

// ── 5. 可分发性回归（曾发生/易踩的坑）───────────────────────────────
// 5a. mcp-lens 的 cachePath 是 schema 唯一 required 字段；必须存在且经
//     dshHomePath 解析（相对路径依赖进程 cwd, 对他人不可移植）。
const mcpRow = patchText.split(/^\s*- id: brain-mcp-lens\s*$/m)[1] ?? ''
mcpRow.includes('cachePath') && mcpRow.includes("dshHomePath('mcp-lens/catalog.json')")
  ? ok('mcp-lens cachePath 使用 loader 的 dshHomePath（$DSH_HOME 内, 可移植）')
  : bad('mcp-lens cachePath', 'brain-mcp-lens 行缺少 cachePath 或未用 dshHomePath()')

// 5b. headroom 的 serviceConfigSchema: port 为 min(1)..max(65535), port: 0 会在
//     启用时校验失败；代理参数应留空由代码兜底/统一面板配置。
if (/headroom:\n\s+autoInstall: false/.test(patchText) && !/port:\s*0/.test(patchText)) {
  ok('headroom 行不再使用 port: 0（schema min(1), 已改由代码兜底）')
} else {
  bad('headroom port', 'headroom 行配置异常（应只保留 headroom.autoInstall: false）')
}

// 5c. sgme 行必须带非空 baseUrl 默认值（启用时 schema/连接不至于空串）。
if (/baseUrl: !!js process\.env\.SGME_BASE_URL \?\? '[^']+'/.test(patchText)) {
  ok('sgme baseUrl 带非空默认值')
} else {
  bad('sgme baseUrl', 'sgme 行 baseUrl 缺省值可能为空字符串')
}

// 5d. 构建产物必须随仓库提交（GitHub 安装者不跑构建）。
if (existsSync(join(root, 'lib/index.js')) && existsSync(join(root, 'lib/client.js'))) {
  ok('lib/ 构建产物已在仓库中（lib/index.js + lib/client.js）')
} else {
  bad('lib/', 'lib/ 缺失——GitHub 安装者无法免构建安装, 请 npm run build 后提交')
}

// 5e. routing 集成：行 id 必须为 brain-routing-suite（若用 dsh-routing-suite 会与该插件
//     自身 bundle 行的 id 重名 → 启动失败, 且 /routing-suite/api 路由双挂载）。
if (patchText.includes('- id: brain-routing-suite') && !/^\s*- id: dsh-routing-suite\s*$/m.test(patchText)) {
  ok('routing 行 id = brain-routing-suite（不与原插件自身行重名）')
} else {
  bad('routing 行 id', '缺少 brain-routing-suite 行, 或出现了重复的 dsh-routing-suite 行 id')
}

// 5f. routing 行配置：enabled + strategy 存在（auto|inspect-first|direct）。
const routingRow = patchText.split(/^\s*- id: brain-routing-suite\s*$/m)[1] ?? ''
routingRow.includes('enabled: true') && /strategy:\s*(auto|inspect-first|direct)/.test(routingRow)
  ? ok('routing 行配置齐全（enabled: true, strategy: auto）')
  : bad('routing 行配置', 'brain-routing-suite 行缺少 enabled/strategy')

// ── 6. DSH 0.1.5 适配回归 ─────────────────────────────────────────────
const hostIndex = readFileSync(join(root, 'src/host/index.ts'), 'utf8')
const hostConfig = readFileSync(join(root, 'src/host/config.ts'), 'utf8')
const hostIntegration = readFileSync(join(root, 'src/host/integration.ts'), 'utf8')
const hostAll = hostIndex + hostConfig + hostIntegration
const builtIndex = readFileSync(join(root, 'lib/index.js'), 'utf8')

/** 是否存在对某个名字的**值**导入（`import { … }` 而非 `import type { … }`）。 */
const valueImports = (source, name) =>
  new RegExp(String.raw`^import\s*\{[^}]*\b${name}\b[^}]*\}\s*from`, 'm').test(source)

// 6a. 包级 installSettingsSection / settingsNamespace 在 0.1.5 已被删除
//     （运行时导出只剩 SettingsProvider / SettingsConflictError / redactSecrets）。
//     任何值导入都会在模块求值期抛错 → 插件整行加载失败。
if (valueImports(hostAll, 'installSettingsSection')) {
  bad('0.1.5 已删除 API', '仍值导入 installSettingsSection（0.1.5 无此导出）')
} else {
  ok('未值导入已删除的 installSettingsSection')
}
if (valueImports(hostAll, 'settingsNamespace')) {
  bad('0.1.5 已删除 API', '仍值导入 settingsNamespace（0.1.5 无此导出）')
} else {
  ok('未值导入已删除的 settingsNamespace')
}
const settingsImports = hostAll.split(/\r?\n/).filter(line => line.includes("from '@deepseek-ai/dsh-settings'"))
const nonTypeSettingsImports = settingsImports.filter(line => !line.startsWith('import type '))
nonTypeSettingsImports.length === 0
  ? ok('@deepseek-ai/dsh-settings 只做 type-only 导入（运行时零依赖）')
  : bad('dsh-settings 导入', `存在值导入: ${nonTypeSettingsImports.join(' | ')}`)

// 6b. 0.1.5 的注册入口是注册表实例方法 ctx.settings.installSection(owner, …)。
hostIndex.includes('ctx.settings.installSection')
  ? ok('使用 0.1.5 的 ctx.settings.installSection 注册入口')
  : bad('settings 注册', '未使用 ctx.settings.installSection（0.1.5 契约）')

// 6c. settings 是软依赖：必须经 ctx.inject(['settings'], …) 解析，且带降级保护。
hostIndex.includes("ctx.inject(['settings']")
  ? ok("settings 经 ctx.inject(['settings'], …) 软依赖解析")
  : bad('settings 软依赖', '未使用 ctx.inject 解析 settings（provider 缺席时会卡在 waiting）')
const hasShapeGuard = /typeof\s+settingsCtx\.settings\?\.installSection\s*!==\s*'function'/.test(hostIndex)
hasShapeGuard
  ? ok('settings provider 形态不匹配时降级而非崩溃')
  : bad('settings 降级', '缺少 installSection 形态检查（旧版/裁剪 provider 会崩）')

// 6d. 0.1.5 的 Session 没有 .events（读日志要用 snapshotEvents()）。
if (hostIntegration.includes('snapshotEvents')) {
  ok('会话日志读取走 snapshotEvents()（0.1.5 契约）')
} else {
  bad('会话日志读取', '未使用 snapshotEvents()（0.1.5 已移除 session.events，压缩历史会静默为空）')
}

// 6e. 构建产物同样不得残留已删除的 API（防止"改了 src 忘了 build"）。
const hasRemovedApi = builtIndex.includes('installSettingsSection') || builtIndex.includes('settingsNamespace')
if (hasRemovedApi) {
  bad('构建产物', 'lib/index.js 仍引用已删除的 settings API（请 npm run build）')
} else {
  ok('lib/index.js 无已删除 API 残留')
}
builtIndex.includes('installSection')
  ? ok('lib/index.js 已包含 0.1.5 的 installSection 调用')
  : bad('构建产物', 'lib/index.js 未包含 installSection 调用（请 npm run build）')
builtIndex.includes('snapshotEvents')
  ? ok('lib/index.js 已包含 snapshotEvents 读取路径')
  : bad('构建产物', 'lib/index.js 未包含 snapshotEvents（请 npm run build）')

// 6f. 浏览器半区：0.1.5 的模块表只有 @deepseek-ai/dsh-client-store。
//     旧 dsh-client-runtime 已不在平台 seed 词里，require 落空会整卡消失。
//     注意只看 require/import 调用——源码注释里提到该包名是允许的（那正是
//     "为什么不用它"的说明），所以不能按裸包名判负。
const requiresStaleRuntime = /require\(\s*["']@deepseek-ai\/dsh-client-runtime/.test(client)
  || /^\s*import\s[^\n]*@deepseek-ai\/dsh-client-runtime/m.test(client)
if (requiresStaleRuntime) {
  bad('客户端模块', 'client.js 仍 require @deepseek-ai/dsh-client-runtime（0.1.5 模块表已无此项）')
} else {
  ok('client.js 不再 require 已删除的 dsh-client-runtime')
}
client.includes('require("@deepseek-ai/dsh-client-store")')
  ? ok('client.js 从 @deepseek-ai/dsh-client-store 取 createSnapshotStore')
  : bad('客户端模块', 'client.js 未从 @deepseek-ai/dsh-client-store 取 store')
const clientInject = pkg.dsh?.client?.inject ?? []
const staleRuntimeInject = clientInject.some((name) => name.includes('dsh-client-runtime'))
if (staleRuntimeInject) {
  bad('dsh.client.inject', '仍声明 @deepseek-ai/dsh-client-runtime')
} else {
  ok('dsh.client.inject 已移除 dsh-client-runtime')
}
clientInject.includes('@deepseek-ai/dsh-client-ui-settings')
  ? ok('dsh.client.inject 声明 @deepseek-ai/dsh-client-ui-settings（settingsScope 提供方）')
  : bad('dsh.client.inject', '缺少 @deepseek-ai/dsh-client-ui-settings')

// 6g. 版本门：peer 必须落在 0.1.5 之后（否则用户可能装到不兼容的旧运行时）。
const peerTools = pkg.peerDependencies?.['@deepseek-ai/dsh-tools'] ?? ''
peerTools.includes('0.1.5')
  ? ok(`peer @deepseek-ai/dsh-tools 声明 0.1.5 基线（${peerTools}）`)
  : bad('peer 版本门', `@deepseek-ai/dsh-tools=${peerTools} 未声明 0.1.5 基线`)
peerTools.includes('0.1.0-rc.6')
  ? bad('peer 版本门', '仍声明 0.1.0-rc.6 兼容（该线没有 installSection 契约）')
  : ok('不再声明 0.1.0-rc.6 兼容')
const argpDep = pkg.dependencies?.['dsh-argp'] ?? ''
if (/^[\^~]?1\./.test(argpDep)) {
  ok(`dsh-argp 依赖 = ${argpDep}（0.1.5 适配线 1.x）`)
} else {
  bad('dsh-argp 依赖', `${argpDep} 未落在 0.1.5 适配线（1.x）`)
}

// 6h. 运行时测试必须随包提供（静态测试看不见 API 形状）。
existsSync(join(root, 'test/mount.test.mjs'))
  ? ok('test/mount.test.mjs 存在（真实运行时挂载验证）')
  : bad('test/mount.test.mjs', '缺少运行时挂载测试')
existsSync(join(root, 'test/client.test.mjs'))
  ? ok('test/client.test.mjs 存在（浏览器半区烟雾验证）')
  : bad('test/client.test.mjs', '缺少客户端烟雾测试')

// ── 汇总 ──
console.log(`\n${checks - failures.length}/${checks} 契约检查通过`)
if (failures.length > 0) {
  console.error('\n契约违规:')
  for (const f of failures) console.error(' - ' + f)
  process.exit(1)
}
