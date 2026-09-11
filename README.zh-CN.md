# 人脑式上下文压缩逻辑 · dsh-brain-compaction

> **0.1.5 起适配 DeepSeek Harness 0.1.5。** 详见下方「DSH 0.1.5 适配」。

一个 DeepSeek Harness 插件（Cordis bundle）。它不是"Hell World 依赖收集器"，而是把
社区里七个人脑式上下文压缩方向的插件**组装成一个统一、协同、可验证的体系**：

| 组件 | 工具（命名空间） | 默认 | 行 id |
|---|---|---|---|
| dsh-argp（原子引用图剪枝 · 0-LLM · 选择性遗忘） | `recall_pruned` / `list_pruned` / `recall` | ✅ 启用 | `dsh-argp` |
| dsh-compaction-instant（VCC 式近无损即时压缩） | `recall` / `search` | ⬜ 禁用（0.1.5 下不可用，见下） | `brain-compaction-instant` (+`brain-tool-recall`/`brain-command-recall`) |
| @wanyantiande/dsh-headroom（工具输出压缩 + CCR 可逆存储） | `headroom_retrieve` | ⬜ 禁用（需本地代理） | `brain-headroom` |
| dsh-memory-vault（跨会话记忆库） | `memory_remember` / `memory_recall` / `memory_forget` | ✅ 启用 | `brain-memory-vault` |
| dsh-sgme（拾光记忆引擎·多智能体共享） | `memory_search` `wiki_*` `signal_*` `role_*` 等 18 个 | ⬜ 禁用（需原厂网关） | `brain-sgme` |
| dsh-mcp-lens（MCP 工具懒加载） | `mcp_search` / `mcp_call` | ✅ 启用（零服务器） | `brain-mcp-lens` |
| dsh-routing-suite（智能路由 "We Need" 思维链, 0 额外 LLM 调用） | 无模型工具；assemble 注入引导段 + 只读状态 API | ✅ 启用 | `brain-routing-suite` |
| dsh-context-doctor（注入物 token 审计） | `context_audit` | ⬜ 可选（GitHub-only） | `context-doctor` |
| **统一层（本插件）** | `brain_status` / `brain_verify` / `brain_recall` | ✅ | `dsh-brain-compaction` |

## DSH 0.1.5 适配

0.1.5 把三处**运行时 API 形状**改了。它们全都是"模块求值期直接抛错/静默失效"级别，
静态契约测试看不见——所以本版本除了改代码，还把验证方式从"读源码"升级成"真挂载"。

| 0.1.5 的变化 | 旧写法（1.1.0，在 0.1.5 上必坏） | 现写法（0.1.5） |
|---|---|---|
| `@deepseek-ai/dsh-settings` 运行时导出收窄为 `{ SettingsProvider, SettingsConflictError, redactSecrets }` | `import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'` → **import 即抛**（整个插件行加载失败） | 包级函数改为注册表实例方法 `ctx.settings.installSection(ctx, ns, schema, entry, hooks)`；namespace 变成普通字符串字面量；该包**只做 type-only 导入**（运行时零依赖） |
| settings 变成需要解析的服务 | — | 走**软依赖** `ctx.inject(['settings'], …)`：provider 缺席（headless、旧版、裁剪过的组合）时插件照常挂载，退化为"组合层配置"，只打一条 warn；`installSection` 形态不符时同样降级而不是崩 |
| `Session` 不再有 `.events` 属性 | `session.events.filter(…)` → 恒为 `undefined`，`brain_verify` 的压缩历史**静默报 0 条** | 改读 `session.snapshotEvents()`（保留旧形状兜底），压缩前后对比恢复可用 |
| 浏览器模块表（`PLATFORM_MODULES`）不再有 `@deepseek-ai/dsh-client-runtime` | `require("@deepseek-ai/dsh-client-runtime/client")` → `missed the module table`，**整张设置卡片（含 CSS）消失** | 直接从平台 seed 词 `@deepseek-ai/dsh-client-store` 取 `createSnapshotStore`（同一 zustand+immer 引擎，`getSnapshot/subscribe/set/update` 契约不变） |

连带调整：

- **依赖线**：`dsh-argp` 提到 **`^1.1.0`**（其 `peerDependencies` 明确 `^0.1.5-rc.1`，且自身也
  改用 0.1.5 的 settings 源 thunk）；`peerDependencies` 改为 `>=0.1.5-rc.1`。
- **`dsh-compaction-instant` 暂不可用**：`0.1.4` 仍 `import { installSettingsSection, settingsNamespace }`
  ——在 0.1.5 上该行一旦启用即启动失败。patch 里保持 `disabled: true` 并留注释；等上游适配后再切引擎。
- **引擎识别加固**：argp 1.1.0 除 `ArgpGraphEngine` 外还导出 `ArgpT1Engine`/`ArgpRecallEngine`/
  `ArgpProbeEngine`，四个类名都认作 argp；未知类名会在报告里点名，而不是笼统 FAIL。
- **`dsh.client.inject`** 清掉已删除的 `dsh-client-runtime`（顺带移除未使用的 `connection`）。

### 验证方式（0.1.5 新增）

```sh
npm run build      # esbuild 打包 host + 逐字复制 client
npm run test       # 42 项静态契约（含 0.1.5 回归守卫：禁止改回已删除的 API 形状）
npm run test:mount # 16 项真实运行时挂载（把构建产物挂到真的 cordis + ToolRuntime + SettingsProvider）
npm run test:client# 16 项浏览器半区烟雾（桩 require 真的把 factory 跑一遍）
npm run verify     # 以上全部
```

`test:mount` 需要一个 DSH 安装来解析 `@deepseek-ai/*`：按 `$DSH_RUNTIME_ROOT` →
`$DSH_HOME/profiles/node_modules` → 若干常见路径 依次探测，都没有则**跳过**（exit 0）。
它断言的是静态测试永远看不见的东西：构建产物可 import、fiber 真的 ACTIVE、三个工具
真的注册、settings namespace 真的注册且写入生效、`brain_verify` 真的从 `snapshotEvents()`
里读出了 2 条压缩历史。

## 深度融合 = 组合 + 协调，而不是依赖

- **组装**：`cordis.patch.yml` 用 Cordis 组合机制（insert 行、包名引用、disabled 覆盖）
  把全部组件行一次装入 profile 组合树；profile 用 `nodeLinker: hoisted`，所以子插件
  作为本 bundle 的 `dependencies` 可被 loader 直接按行名解析（无需逐个 `dsh plugin add`）。
- **协调**：`src/host/integration.ts` 运行时零 import 探测——工具注册表
  (`ctx.tools.schemas()`)、服务 (`ctx.get('compaction')` / `tokenMeter`)、引擎类名
  判定当前激活引擎；任何组件缺失/禁用都优雅降级，不会崩。
- **互斥仲裁**：`ctx.compaction` 每上下文只允许一个实现。argp 与 instant 都会注册
  工具 `recall`（重名即抛错），因此 patch 里**恰好一个引擎行启用**（默认 argp）；
  `brain_verify` 会校验这一点。
- **统一面板**：Settings → Plugins → 人脑式上下文压缩。一张卡片绑定多个 settings
  namespace（本插件 + compaction-instant + headroom），哪些在场就渲染哪些小节；
  写入仍走各插件原生 scope（schema 校验 + live 生效）。
- **路由思维链（We-Need）**：`dsh-routing-suite` 是 host 行——**0 次额外 LLM 调用**,
  用正则对首条用户任务分类（修复/排查/审查→检查优先；新建/实现→直接执行并验证）,
  仅在预设 id 恰为 `routing-suite` 的会话注入一句约 90 字符的引导。深度融合 =
  本插件用自研 id `brain-routing-suite` 挂载它（状态 API/策略面可用）, 且把同一套
  We-Need 纪律**固化进 brain 预设的 persona**（任何首任务常驻生效, 不依赖 id 判断）。
  token 节省的真实机理：直接任务免去无谓探索, 维护任务避免跳过根因——减少返工轮次
  与上下文生长; 它不改变注入物的常驻成本, 请勿夸大。
  若你在此前单独安装过 dsh-routing-suite, 请先移除独立 bundle 再使用本插件的组装。

## 安装

**一条命令（推荐）：**

```sh
dsh plugin --profile web add "github:Lsc-91-69/dsh-brain-compaction"
# 重启 dsh web（dsh web 停掉再起, 或使用 GUI 的重启控件）
```

**从源码目录安装：**

```sh
git clone https://github.com/Lsc-91-69/dsh-brain-compaction
dsh plugin --profile web add "file:<克隆下来的目录路径>"
# 重启 dsh web
```

用 `file:`（或 `github:`）规格，**不要**用 `link:`——`link:` 不安装本包的子插件
依赖，组装行会解析失败。开发迭代时可以 `link:` **并**自行 `pnpm install` 子依赖。
两种方式都依赖仓库里已提交的 `lib/` 构建产物。

### 安装后验证（约 2 分钟）

1. **重启 `dsh web`**：profile 在启动时组合插件行，运行中的进程不会热加载新 bundle。
2. **核对组合树**（不启服务，只读）：

   ```sh
   dsh --profile web --dump-config | Select-String 'brain-|compaction'
   ```

   预期：`dsh-brain-compaction` **ENABLED**、`dsh-argp` **ENABLED**、
   `compaction-basic` **disabled**（本 bundle 的 patch 关掉了内置摘要引擎）、
   `brain-compaction-instant` / `brain-tool-recall` / `brain-command-recall`
   **disabled**（引擎互斥），以及 `brain-memory-vault` / `brain-mcp-lens` /
   `brain-routing-suite` **ENABLED**。
3. **在新会话里让模型调用 `brain_verify`**。健康状态应报告
   `engine: ArgpGraphEngine`，且 argp / memory-vault / mcp-lens / routing-suite
   四项 PASS；instant / headroom / sgme / context-doctor 按设计 SKIP。
4. **打开 设置 → 插件**：应能看到「人脑式上下文压缩」卡片（由本插件的浏览器半区
   提供）。该页只渲染"Host 已服务的 namespace ∩ 浏览器已注册的卡片 key"的交集，
   所以卡片不出现意味着 Host 半区没挂上——去宿主日志里找 import 错误。

### 新装常见问题

- 报 `The requested module '@deepseek-ai/dsh-settings' does not provide an export
  named 'installSettingsSection'`：装的是 0.1.5 之前的版本。本版本（0.1.5）要求
  **DSH 0.1.5-rc.1 及以上**，两边都要升。
- 报 `tool "recall" is already registered`：argp 与 instant 同时启用，恢复引擎互斥
  （见「引擎切换」）。
- 报行 id 重复：某个子插件也被单独装成了 bundle，先
  `dsh plugin --profile web remove <name>`，只保留本 bundle 的组装。
- profile 解析不到 `dsh-brain-compaction`：重跑
  `dsh plugin --profile web install`，该依赖必须落在 profile 自己的 `node_modules` 里。

可选组件（Context Doctor，GitHub-only 未发布 npm）：

```sh
dsh plugin --profile web add "github:Zhenyu98/dsh-context-doctor#main"
```

## 从 GitHub 安装与分发（给别人用时）

```sh
# 别人/另一台机器（按需加 #v0.1.5 固定版本）
dsh plugin --profile web add "github:<你的用户名>/dsh-brain-compaction"
# 重启 dsh web
```

这条命令能成立的前提是：**仓库根目录就是包本体**——`package.json`、`lib/`、`src/`、
`preset/`、`scripts/`、`test/` 与 README 并列在顶层。pnpm 解析 `github:` 规格时会
**对仓库根那一层打包**，所以"包被多套一层目录"的结构（如
`仓库/<包名>/package.json`）会因找不到根 `package.json` 而安装失败——这一点已用真实
GitHub tarball 验证：子目录结构的打包结果是根目录下只有 `README.md` 和那个子目录，
pnpm 无处可打包。

- 仓库**必须提交 `lib/`**（构建产物）——GitHub 安装直接按仓库内容安装，不跑构建；
  `test/contract.test.mjs` 的 5d 项会检查它。
- 安装即自动拉取子插件依赖（npm 版本，`nodeLinker: hoisted` 下按行名可解析）；
  不要额外 `dsh plugin add` 任一子插件，避免行 id 重复。
- 请用 `file:` 而非 `link:` 规格安装本机开发副本（`link:` 不安装子插件依赖）。
- 发布前跑一遍 `npm run verify`：构建 + **42 项契约** + **16 项真实运行时挂载**
  + **16 项浏览器半区**。挂载套件需要一份 DSH 安装来解析 `@deepseek-ai/*`（按
  `$DSH_RUNTIME_ROOT` → `$DSH_HOME/profiles/node_modules` → 各级父目录的
  `node_modules` 依次探测），都没有时会干净跳过而不是误报。

**Agent 预设一起分发**：本仓库 `preset/` 内是已验证的「人脑式上下文压缩」预设
（persona 压缩纪律 + 会话级 argp 引擎行），复制到 `$DSH_HOME/.agent-presets/brain-compaction/`
即可在预设选择器中见到；详见 `preset/README.md`。

**发布清单**：`git init` 后提交全部（`node_modules/` 已被 .gitignore 排除，
`lib/`、`preset/`、`src/`、`scripts/`、`test/`、`cordis.patch.yml`、README、
LICENSE 都提交），打 tag `v0.1.5`，然后 `dsh plugin add github:<你>/dsh-brain-compaction#v0.1.5`。

重启后新会话里让模型调用 `brain_verify`——组件矩阵 PASS / SKIP / FAIL + token 快照
+ 最近压缩历史 + context_audit 接入点，即验证完成。

## 引擎切换（argp ↔ instant ↔ headroom）

编辑插件的 `cordis.patch.yml`（或你自己的 profile patch 覆盖它）：把当前启用引擎行
加 `disabled: true`，把目标引擎行去掉 `disabled`（instant 还要同时启用
`brain-tool-recall` / `brain-command-recall`），重启。参考文件内注释。

> ⚠️ **DSH 0.1.5 下只有 `dsh-argp` 可切**：`dsh-compaction-instant@0.1.4` 仍引用已删除的
> 包级 settings 导出，启用即启动失败；headroom 0.3.0 未做启用后链路的实测。见
> 「DSH 0.1.5 适配」。

**会话级引擎**：`人脑式上下文压缩` 预设（agent.cordis.yml 的 `compaction` 组）把引擎行
直接放在会话 realm 内（默认 `dsh-argp`）——**该行才是 brain 预设会话真正使用的
压缩引擎**；host 层的引擎行服务于不带压缩组的预设。切换时两处要保持一致（同理把
预设组内的 `compaction-basic` 换成 `dsh-argp`，该预设已替你做）。

## 验证机制（压缩前后 Token 对比）

1. 会话中调用 `brain_verify`（summary）：得到引擎状态 + 组件矩阵 + 当前 token + 最近
   `compaction/summary` 事件叶子字段（shadowed/checkpoint 前后数值）。
   （0.1.0 时代这里恒为空——`session.events` 在 0.1.5 已被移除；现在走
   `session.snapshotEvents()`。）
2. 若已装 Context Doctor：调用 `context_audit`，得到 AGENTS.md 指令链 / 技能目录 /
   工具 schema / MCP 工具面的逐项 token 成本、重复与冲突（常驻注入物，压缩不降低
   这部分；真正被压缩的是会话历史）。
3. 连续两次手动压缩（`/compact`）后再次 `brain_verify`：比较两次
   `sessionTokens` 与 `compaction/computation` 差值——即压缩前后 Token 对比。
4. `brain_status` 任意时刻快照；`brain_recall(seq|query)` 统一召回被剪内容。
5. 三层自带测试（`npm run verify`）：`test/contract.test.mjs` 42 项静态契约、
   `test/mount.test.mjs` 16 项真实运行时挂载、`test/client.test.mjs` 16 项浏览器半区烟雾。

## 配置矩阵

| 参数 | 层 | 调整方式 |
|---|---|---|
| 引擎选择（argp/instant/headroom） | 组合 | `cordis.patch.yml`（改 disabled，重启）；0.1.5 下仅 argp 可用 |
| argp maxPasses / recencyGuard | 组合 | 行 `config`（本插件的 patch 默认 256/10） |
| instant thresholdRatio/retainTurns/retainTokens/auto/checkpointCap | 运行时 | 统一面板 / settings `compaction-instant`（0.1.5 下该插件暂不可用） |
| headroom 压缩开关/阈值/代理参数 | 运行时 | 统一面板（headroom 启用后）/ settings `headroom` |
| 本插件 selfTestAfterBoot / verifyDetail | 运行时 | 统一面板 / settings `brain-compaction`（0.1.5：`ctx.settings.installSection`） |
| sgme baseUrl/agentKey/…（网关） | 组合 | 行 `config` + 环境变量（patch 注释） |
| vault injectLimit/recallLimit | 组合 | 行 `config`（默认 8/10） |
| mcp-lens servers/allowTools/denyTools | 组合 | 行 `config`（默认空, fail-closed） |
| context-doctor defaultCwd/cacheTtlMs | 组合 | 其自身 patch |

## 目录结构

```
src/host/index.ts       插件入口（apply：settings 软依赖注册、工具注册、事件监听、boot 自检）
src/host/config.ts      unified config（brain-compaction namespace + schema, type-only 依赖 settings 包）
src/host/integration.ts 组件矩阵/引擎仲裁/验证报告/统一召回（运行时探测, 零 import 耦合）
src/client.js           统一配置面板（逐字发布, ModuleLoader factory, 平台词 dsh-client-store）
cordis.patch.yml        组装：组件行 + 引擎互斥 + compaction-basic 禁用
scripts/build.mjs       esbuild 打包（src/host/*.ts → lib/*；EPERM 时回落官方 CLI 二进制）
test/contract.test.mjs  静态契约测试（42 项，含 0.1.5 回归守卫）
test/mount.test.mjs     真实运行时挂载测试（16 项，需 DSH 安装；缺则跳过）
test/client.test.mjs    浏览器半区烟雾测试（16 项，无需浏览器）
```

## 开发

```sh
npm run build       # esbuild 打包 host + 逐字复制 client（需要 esbuild 可解析）
npm run test        # 静态契约测试（42 项）
npm run test:mount  # 真实运行时挂载测试（16 项；无 DSH 安装则跳过）
npm run test:client # 浏览器半区烟雾测试（16 项）
npm run verify      # 以上全部
```

## 常见问题

- **启动报 `tool "recall" is already registered`**：argp 与 instant 同时启用了——把
  引擎互斥恢复到一个启用。
- **启动报行 id 重复**：之前单独 `dsh plugin add` 过子插件——先 `dsh plugin --profile
  web remove dsh-argp` 等，再保留本 bundle 的组装。
- **启动报 `SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not
  provide an export named 'installSettingsSection'`**：装的是 0.1.5 之前的版本（那版只
  适配 0.1.0-rc.x）。升级到 0.1.5+。
- **启用 instant 引擎后启动失败**：`dsh-compaction-instant@0.1.4` 未适配 0.1.5（同样的
  已删除导出）。保持该行 `disabled: true`，或等上游发新版。
- **设置页看不到「人脑式上下文压缩」卡片**：两种可能——(a) Host 半区没挂上（宿主日志里
  会有 import 错误）；(b) 0.1.5 的插件配置页只渲染
  「Host 已服务的 namespace ∩ 已注册的卡片 key」的交集，所以 Host 端
  `brain-compaction` namespace 注册失败时卡片**不会**出现（这不是渲染 bug）。
  `npm run test:mount` 能直接判出 namespace 是否注册成功。
- **`brain_verify` 引擎 FAIL 且提示"不在已知引擎表内"**：`ctx.compaction` 是某个新引擎
  实现。若是 argp 的新装配面，把类名加进 `src/host/integration.ts` 的 `ENGINE_CLASS_MAP`。
- **`brain_verify` 引擎 FAIL（无类名）**：profile 的 `cordis.patch.yml` 里 compaction-basic
  行被其它层重新启用，或被 argp 之外的东西抢占。
- **面板里某小节不见**：对应子插件行处于 disabled（默认禁用项见上表），先启用再重启。

## 许可证

MIT；子插件各自遵循其原始许可证（dsh-argp MIT、dsh-compaction-instant MIT、
dsh-memory-vault MIT、@wanyantiande/dsh-headroom MIT、dsh-mcp-lens MIT(EULA 见包内)、
dsh-sgme MIT、dsh-context-doctor BSD-3-Clause）。

