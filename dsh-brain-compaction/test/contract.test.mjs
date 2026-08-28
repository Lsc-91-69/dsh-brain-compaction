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

// ── 汇总 ──
console.log(`\n${checks - failures.length}/${checks} 契约检查通过`)
if (failures.length > 0) {
  console.error('\n契约违规:')
  for (const f of failures) console.error(' - ' + f)
  process.exit(1)
}
