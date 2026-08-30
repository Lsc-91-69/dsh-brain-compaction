# dsh-brain-compaction — Human-brain-style context compaction, unified

A DeepSeek Harness plug-in (Cordis bundle) that **composes seven community
context-compression plug-ins into one coordinated, verifiable system** —
not a dependency collector:

| Component | Tools (namespaced) | Default | Row id |
|---|---|---|---|
| dsh-argp (atomic reference-graph pruning, 0-LLM, selective forgetting) | `recall_pruned` / `list_pruned` / `recall` | enabled | `dsh-argp` |
| dsh-compaction-instant (VCC-style near-lossless) | `recall` / `search` | disabled (alternative engine) | `brain-compaction-instant` (+`brain-tool-recall` / `brain-command-recall`) |
| @wanyantiande/dsh-headroom (tool-output compression + CCR store) | `headroom_retrieve` | disabled (needs local proxy) | `brain-headroom` |
| dsh-memory-vault (cross-session memory) | `memory_remember` / `memory_recall` / `memory_forget` | enabled | `brain-memory-vault` |
| dsh-sgme (multi-agent shared memory) | `memory_search` `wiki_*` `signal_*` `role_*` (18 tools) | disabled (needs SGME gateway) | `brain-sgme` |
| dsh-mcp-lens (lazy MCP tool catalog) | `mcp_search` / `mcp_call` | enabled (zero servers) | `brain-mcp-lens` |
| dsh-routing-suite (smart routing "We Need" chain, 0 extra LLM calls) | no model tools; assemble-time guidance section + read-only status API | enabled | `brain-routing-suite` |
| dsh-context-doctor (injection token audit) | `context_audit` | optional (GitHub-only) | `context-doctor` |
| **Unified layer (this plug-in)** | `brain_status` / `brain_verify` / `brain_recall` | enabled | `dsh-brain-compaction` |

## Deep integration = composition + coordination, not dependencies

- **Assemble**: `cordis.patch.yml` mounts every component row through the Cordis
  composition mechanism (row insertion, package-name references, disabled
  overrides). The profile uses `nodeLinker: hoisted`, so sub-plugins listed as
  regular `dependencies` resolve by row name — no per-plugin `dsh plugin add`.
- **Coordinate**: `src/host/integration.ts` probes at runtime with zero imports —
  tool registry (`ctx.tools.schemas()`), services (`ctx.get('compaction')`,
  `tokenMeter`), engine class name. Any missing/disabled component degrades
  gracefully.
- **Arbitrate**: `ctx.compaction` allows exactly one implementation per context.
  argp and instant both register the tool `recall` (duplicates throw), so the
  patch keeps exactly one engine row enabled (argp by default); `brain_verify`
  validates this.
- **One panel**: Settings → Plugins → Brain Compaction binds multiple settings
  namespaces (this plug-in + compaction-instant + headroom) in one card; writes
  still go through each plug-in’s native scope (schema-validated, live-applied).
- **Routing chain (We-Need)**: `dsh-routing-suite` is a host row — **zero extra
  LLM calls**; it regex-classifies the first user task (fix/diagnose/review →
  inspect-first; build/create/implement → direct) and appends one ~90-char
  guidance line, but only for sessions whose preset id is exactly `routing-suite`.
  Deep integration: mounted under the unique id `brain-routing-suite` (status API
  and strategy surface stay available), and the same We-Need discipline is baked
  into the brain preset persona (always-on for any first task, no id check). The
  honest token story: direct tasks skip redundant exploration, maintenance tasks
  never skip root cause — fewer wasted turns, less context growth; it does NOT
  lower per-request injection cost. If you previously installed the standalone
  bundle, remove it before using this assembly.

## Install

```sh
dsh plugin --profile web add "file:D:/deepseek-harness/.plugins/dsh-brain-compaction"
# restart dsh web
```

(Ship the built `lib/`. Use the `file:` spec — a `link:` spec would not install this
package's sub-plug-in dependencies and the composed rows would fail to resolve. For
iterative development you may switch to `link:` and `pnpm install` the sub-deps yourself.)

Optional component (Context Doctor — GitHub-only, not published to npm):

```sh
dsh plugin --profile web add "github:Zhenyu98/dsh-context-doctor#main"
```

## Install from GitHub & distribution

```sh
# any machine (append #v1.0.0 to pin a release)
dsh plugin --profile web add "github:<your-name>/dsh-brain-compaction"
# restart dsh web
```

- The repo **must contain `lib/`** (build artifacts) — a GitHub install uses the
  repo as-is and does not build; contract test 5d guards this.
- Installing pulls the 6 sub-plug-in dependencies automatically (npm versions
  resolve by row name under `nodeLinker: hoisted`); do NOT `dsh plugin add` any
  sub-plug-in separately (duplicate row ids).
- For local development use `file:` (or `link:` + `pnpm install` the sub-deps).
- Run `npm run verify` before publishing (build + 15 contract assertions incl.
  distribution regressions).

**The agent preset ships along**: the validated `人脑式上下文压缩` preset lives
in `preset/` (compression-discipline persona + session-level argp engine row).
Copy it to `$DSH_HOME/.agent-presets/brain-compaction/`; see `preset/README.md`.

**Release checklist**: `git init`, commit everything (`.gitignore` excludes
`node_modules/`; commit `lib/`, `preset/`, `src/`, `scripts/`, `test/`,
`cordis.patch.yml`, READMEs, LICENSE), tag `v1.0.0`, then
`dsh plugin --profile web add "github:<you>/dsh-brain-compaction#v1.0.0"`.

In a fresh session ask the model to run `brain_verify` — component matrix
(PASS/SKIP/FAIL), session token snapshot, recent compaction history, and the
context_audit hook, all in one report.

## Engine switching (argp ↔ instant ↔ headroom)

Edit the plug-in’s `cordis.patch.yml` (or override its rows in your own profile
patch): set `disabled: true` on the currently enabled engine row, remove
`disabled` from the target row (instant also needs `brain-tool-recall` and
`brain-command-recall` enabled), restart.

**Session-level engine**: the `人脑式上下文压缩` preset places its engine row
inside the per-session `compaction` realm in `agent.cordis.yml` (default
`dsh-argp`) — that row is the engine brain-preset sessions actually use; the
host-level engine row serves presets without their own compaction group. Keep
the two planes consistent when switching (the preset already replaced
`compaction-basic` with `dsh-argp` for you).

## Verification (before/after token comparison)

1. Call `brain_verify` (summary): engine state + component matrix + current
   tokens + recent `compaction/summary` leaf fields (shadowed/checkpoint).
2. If Context Doctor is installed, call `context_audit`: per-item token cost of
   AGENTS.md chain / skill catalog / tool schemas / MCP surface, duplicates and
   conflicts (per-request injection; compaction shrinks the conversation, not
   this baseline).
3. Run two manual compactions (`/compact`), then `brain_verify` again and
   compare `sessionTokens` and the compaction history — that is the
   before/after Token delta.
4. `brain_status` for arbitrary snapshots; `brain_recall(seq|query)` for
   unified recovery of pruned content.
5. Contract test `node test/contract.test.mjs` (15 assertions: row
   resolvability, compaction-basic disabled, engine exclusivity, panel id).

## Config matrix

| Parameter | Plane | How |
|---|---|---|
| Engine choice | composition | `cordis.patch.yml` disabled flags + restart |
| argp maxPasses / recencyGuard | composition | row config (default 256 / 10) |
| instant thresholdRatio / retainTurns / retainTokens / auto / checkpointCap | runtime | unified panel / settings `compaction-instant` |
| headroom toggle / threshold / proxy | runtime | unified panel / settings `headroom` |
| selfTestAfterBoot / verifyDetail | runtime | unified panel / settings `brain-compaction` |
| sgme baseUrl / agentKey / … | composition | row config + env vars |
| vault injectLimit / recallLimit | composition | row config (default 8 / 10) |
| mcp-lens servers / allowTools / denyTools | composition | row config (empty, fail-closed) |
| context-doctor defaultCwd / cacheTtlMs | composition | its own patch |

## Layout

```
src/host/index.ts       entry (settings registration, tools, events, boot self-check)
src/host/config.ts      unified config (brain-compaction namespace + schema)
src/host/integration.ts component matrix / engine arbitration / verify / unified recall
src/client.js           unified settings panel (verbatim ModuleLoader factory)
cordis.patch.yml        assembly: component rows + engine exclusivity + basic disabled
scripts/build.mjs       esbuild packaging (src/host/*.ts → lib/*)
test/contract.test.mjs  contract tests
```

## Development

```sh
npm run build   # esbuild host + verbatim client copy
npm run test    # contract tests (15)
```

## Troubleshooting

- Boot error `tool "recall" is already registered`: argp and instant are both
  enabled — restore engine exclusivity.
- Boot error duplicate row id: a sub-plug-in was previously added as its own
  bundle (`dsh plugin --profile web remove <name>`, keep this bundle’s
  assembly).
- `brain_verify` engine FAIL: something re-enabled `compaction-basic` or
  preempted the engine.
- A section is missing from the panel: that plug-in’s row is disabled by
  default (see table); enable and restart.

## License

MIT. Sub-plug-ins keep their own licenses (dsh-argp MIT, dsh-compaction-instant
MIT, dsh-memory-vault MIT, @wanyantiande/dsh-headroom MIT, dsh-mcp-lens
MIT/EULA, dsh-sgme MIT, dsh-context-doctor BSD-3-Clause).
