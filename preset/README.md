# preset/ — `人脑式上下文压缩` Agent 预设（随仓库分发）

复制本目录到 `$DSH_HOME/.agent-presets/brain-compaction/`（Windows 示例：
`D:\DeepSeekHarness\.dsh\.agent-presets\brain-compaction\`），重启 dsh web 后
在预设选择器中即可看到「人脑式上下文压缩」。

- `agent.cordis.yml` 由「标准模式」预设派生：persona 换成压缩纪律版本；
  `compaction` 隔离组内的引擎行已替换为 `dsh-argp`（会话级引擎）。
- **本版本对齐 DSH 0.1.5**：行集合与 0.1.5 的 shipped `standard` 预设逐行同构
  （唯一新增行是 `dsh-argp`；`command-compact` + `tool-result-pruner` 仍在
  compaction 组内）。
- **引擎版本要求**：`dsh-argp` **^1.1.0**。1.1.0 的 `peerDependencies` 明确
  `@deepseek-ai/dsh-compaction@^0.1.5-rc.1`，并且自身也改用 0.1.5 的
  `ctx.settings` 源 thunk；0.3.x 线在 0.1.5 上不可靠。
- **备选引擎暂不可用**：`dsh-compaction-instant@0.1.4` 仍 `import` 0.1.5 已删除的
  包级 `installSettingsSection` / `settingsNamespace`，因此 `compaction` 组里
  的 instant 行保持注释状态——启用即模块求值期抛错。上游适配后再切换。
- `tokenMeter` 刻意不进 `compaction` realm（它属 host 平面，且拥有浏览器读取的
  context-meter 投影单元）；本组只隔离 `compaction` 与 `toolResultPruner`。
- 若你的部署标准模式构成不同（dsh 版本升级），建议在 dsh web 的预设管理里
  用「复制」重新派生，再按本文件差异手动合并（主要改动点：persona 文本 +
  compaction 组的 `compaction-basic` → `dsh-argp` 行）。
- 预设 ID `brain-compaction` 在本机唯一时直接可用；重名请改目录名与
  `preset.yml`（目录名即 ID）。
- 用 `dsh-agent-presets` 的 `standingKeyFor('brain-compaction')` 可做挂载校验：
  它会真的组合一次该预设的插件子树（不启动 agent/会话/回合），并拒绝"包无法
  解析 / 配置非法 / 行未激活 / 服务发布到 root realm"这四类失败。

## routing-suite/ — dsh-routing-suite 原生智能路由模式（可选, MIT）

来自 npm 包 `dsh-routing-suite@0.1.2` 的官方预设（源自 DSH 标准模式, MIT 许可,
归属见 https://github.com/dragonbaba/dsh-routing-suite）。把它复制到
`$DSH_HOME/.agent-presets/routing-suite/` 后, 仅当会话预设 id 恰为 `routing-suite`
时, 路由插件的 host 层才会按首条用户任务注入一句路由引导（0 次额外 LLM 调用）。
`brain-compaction` 预设已内嵌同一套 We-Need 纪律（任何首任务常驻生效）,
两者任选其一, 不要同时宣传; 若同时启用两者也在功能上不冲突（引导措辞相近）。

## 发布注意

`agent.cordis.yml` 由 DSH 标准模式预设派生, 直接分发的是某一版本快照;
不同 dsh 版本的标准模式构成可能有差异, 文档内给出手动合并差异的要点。
本目录当前快照 = **DSH 0.1.5-rc.1 的 standard 预设**。

另：`dsh-argp` 1.1.0 挂载时会调用 `cleanShippedPresets()`，对 roster 中
`trust === 'system'`（即部署自带的 shipped 预设）里仍挂 `compaction-basic` 的
预设生成 `<id>-argp` 净化副本，**只写用户根目录、绝不触碰 shipped 安装目录**。
本仓库分发的预设是**用户预设**（`trust === 'user'`），因此不会被自动改写；
装到 `$DSH_HOME/.agent-presets/` 后请以本目录内容为准。
