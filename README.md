# dsh-brain-compaction — Human-brain-style context compaction, unified

> **Since 0.1.5 this targets DeepSeek Harness 0.1.5.** See "DSH 0.1.5 compatibility" below.

A DeepSeek Harness plug-in (Cordis bundle) that **composes seven community
context-compression plug-ins into one coordinated, verifiable system** —
not a dependency collector:

| Component | Tools (namespaced) | Default | Row id |
|---|---|---|---|
| dsh-argp (atomic reference-graph pruning, 0-LLM, selective forgetting) | `recall_pruned` / `list_pruned` / `recall` | enabled | `dsh-argp` |
| dsh-compaction-instant (VCC-style near-lossless) | `recall` / `search` | disabled (unusable on 0.1.5, see below) | `brain-compaction-instant` (+`brain-tool-recall` / `brain-command-recall`) |
| @wanyantiande/dsh-headroom (tool-output compression + CCR store) | `headroom_retrieve` | disabled (needs local proxy) | `brain-headroom` |
| dsh-memory-vault (cross-session memory) | `memory_remember` / `memory_recall` / `memory_forget` | enabled | `brain-memory-vault` |
| dsh-sgme (multi-agent shared memory) | `memory_search` `wiki_*` `signal_*` `role_*` (18 tools) | disabled (needs SGME gateway) | `brain-sgme` |
| dsh-mcp-lens (lazy MCP tool catalog) | `mcp_search` / `mcp_call` | enabled (zero servers) | `brain-mcp-lens` |
| dsh-routing-suite (smart routing "We Need" chain, 0 extra LLM calls) | no model tools; assemble-time guidance section + read-only status API | enabled | `brain-routing-suite` |
| dsh-context-doctor (injection token audit) | `context_audit` | optional (GitHub-only) | `context-doctor` |
| **Unified layer (this plug-in)** | `brain_status` / `brain_verify` / `brain_recall` | enabled | `dsh-brain-compaction` |

## DSH 0.1.5 compatibility

0.1.5 changed three **runtime API shapes**. Every one of them fails at module
evaluation time (or fails silently), so a static contract test cannot see them —
which is why this release also upgrades verification from "read the source" to
"actually mount it".

| 0.1.5 change | Old shape (1.1.0 — broken on 0.1.5) | New shape (0.1.5) |
|---|---|---|
| `@deepseek-ai/dsh-settings` runtime exports narrowed to `{ SettingsProvider, SettingsConflictError, redactSecrets }` | `import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'` → **throws on import** (the whole plug-in row fails to load) | the package-level function became the registry instance method `ctx.settings.installSection(ctx, ns, schema, entry, hooks)`; a namespace is now a plain string literal; the package is imported **type-only** (zero runtime dependency) |
| settings became a service that must be resolved | — | resolved as a **soft dependency** via `ctx.inject(['settings'], …)`: when the provider is absent (headless, older, trimmed composition) the plug-in still mounts in composition-config-only mode with one warn; a provider lacking `installSection` degrades instead of throwing |
| `Session` no longer exposes `.events` | `session.events.filter(…)` → always `undefined`, so `brain_verify`'s compaction history **silently reported 0 entries** | reads `session.snapshotEvents()` (with a fallback to the old shape); before/after token comparison works again |
| the browser module table (`PLATFORM_MODULES`) no longer has `@deepseek-ai/dsh-client-runtime` | `require("@deepseek-ai/dsh-client-runtime/client")` → `missed the module table`, **the entire settings card (plus its CSS) disappears** | takes `createSnapshotStore` from the platform seed word `@deepseek-ai/dsh-client-store` (same zustand+immer engine; `getSnapshot/subscribe/set/update` contract unchanged) |

Related adjustments:

- **Dependency lines**: `dsh-argp` moves to **`^1.1.0`** (its `peerDependencies`
  name `^0.1.5-rc.1`, and it too moved to the 0.1.5 settings source thunk);
  `peerDependencies` becomes `>=0.1.5-rc.1`.
- **`dsh-compaction-instant` is currently unusable**: `0.1.4` still imports
  `installSettingsSection` / `settingsNamespace`, so enabling that row on 0.1.5
  fails at startup. The patch keeps it `disabled: true` with a comment; switch
  engines once upstream ships a fix.
- **Engine detection hardened**: argp 1.1.0 also exports `ArgpT1Engine`,
  `ArgpRecallEngine`, and `ArgpProbeEngine`; all four class names now count as
  argp, and an unknown class name is named in the report instead of a generic FAIL.
- **`dsh.client.inject`** drops the removed `dsh-client-runtime` (and the unused
  `connection`).

### Verification (new in 0.1.5)

```sh
npm run build       # esbuild bundles the host half; the client half is copied verbatim
npm run test        # 42 static contract checks (incl. 0.1.5 regression guards)
npm run test:mount  # 16 real-runtime mount checks (built artifact onto real cordis + ToolRuntime + SettingsProvider)
npm run test:client # 16 browser-half smoke checks (stub require really executes the factory)
npm run verify      # all of the above
```

`test:mount` needs a DSH installation to resolve `@deepseek-ai/*`: it probes
`$DSH_RUNTIME_ROOT` → `$DSH_HOME/profiles/node_modules` → a few common paths and
**skips** (exit 0) when none exists. It asserts what static analysis never can:
the built artifact imports, the fiber really reaches ACTIVE, all three tools
register, the settings namespace really registers and accepts a write, and
`brain_verify` really reads 2 compaction summaries out of `snapshotEvents()`.

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

**One-liner (recommended):**

```sh
dsh plugin --profile web add "github:Lsc-91-69/dsh-brain-compaction"
# restart dsh web (stop it and start again, or use the GUI's restart control)
```

**From a source checkout:**

```sh
git clone https://github.com/Lsc-91-69/dsh-brain-compaction
dsh plugin --profile web add "file:<path-to-the-clone>"
# restart dsh web
```

Use the `file:` (or `github:`) spec, never `link:` — a `link:` spec does not
install this package's sub-plug-in dependencies and the composed rows would fail
to resolve. For iterative development you may `link:` **and** `pnpm install` the
sub-deps yourself. Ship the built `lib/` either way.

### Verify the install (2 minutes)

1. **Restart `dsh web`** — the profile composes its plugin rows at boot; a
   running process never hot-loads a new bundle.
2. **Check the composed tree** (no server started, read-only):

   ```sh
   dsh --profile web --dump-config | Select-String 'brain-|compaction'
   ```

   Expected: `dsh-brain-compaction` **ENABLED**, `dsh-argp` **ENABLED**,
   `compaction-basic` **disabled** (this bundle's patch turns the stock summarizer
   off), `brain-compaction-instant` / `brain-tool-recall` / `brain-command-recall`
   **disabled** (engine exclusivity), and `brain-memory-vault` /
   `brain-mcp-lens` / `brain-routing-suite` **ENABLED**.
3. **Ask the model to run `brain_verify`** in a fresh session. A healthy install
   reports `engine: ArgpGraphEngine` and PASS for argp / memory-vault / mcp-lens /
   routing-suite; instant / headroom / sgme / context-doctor are SKIP by design.
4. **Open Settings → Plugins** — the "Brain Compaction" card is contributed by
   this plug-in's browser half. (That tab renders the intersection of the
   namespaces the Host serves and the cards the browser registered, so a missing
   card means the Host half did not mount — check the host log for an import
   error.)

### Troubleshooting a fresh install

- `The requested module '@deepseek-ai/dsh-settings' does not provide an export
  named 'installSettingsSection'` → you are on a pre-0.1.5-dsH release. This
  version (0.1.5) targets **DSH 0.1.5-rc.1+**; upgrade both sides.
- `tool "recall" is already registered` → argp and instant are both enabled;
  restore engine exclusivity (see "Engine switching").
- Duplicate row id → a sub-plug-in was also added as its own bundle; run
  `dsh plugin --profile web remove <name>` and keep this bundle's assembly.
- The profile cannot resolve `dsh-brain-compaction` → re-run
  `dsh plugin --profile web install`; the dependency must be present in the
  profile's own `node_modules`.

Optional component (Context Doctor — GitHub-only, not published to npm):

```sh
dsh plugin --profile web add "github:Zhenyu98/dsh-context-doctor#main"
```

## Install from GitHub & distribution

```sh
# any machine (append #v0.1.5 to pin a release)
dsh plugin --profile web add "github:<your-name>/dsh-brain-compaction"
# restart dsh web
```

This works because **the repository root IS the package**: `package.json`,
`lib/`, `src/`, `preset/`, `scripts/`, `test/` all sit at the top level beside
the README. pnpm resolves a `github:` spec by packing the repo root, so a layout
that nests the package one level down (e.g. `repo/<name>/package.json`) fails
with "no package.json" — verified against real GitHub tarballs: a subdirectory
layout yields a root containing only `README.md` and the subdirectory, and pnpm
has nothing to pack.

- The repo **must contain `lib/`** (build artifacts) — a GitHub install uses the
  repo as-is and does not build; contract test 5d guards this.
- Installing pulls the sub-plug-in dependencies automatically (npm versions
  resolve by row name under `nodeLinker: hoisted`); do NOT `dsh plugin add` any
  sub-plug-in separately (duplicate row ids).
- For local development use `file:` (or `link:` + `pnpm install` the sub-deps).
- Run `npm run verify` before publishing: build + **42 contract assertions** +
  **16 real-runtime mount assertions** + **16 browser-half assertions**. The
  mount suite needs a DSH install to resolve `@deepseek-ai/*` (it probes
  `$DSH_RUNTIME_ROOT` → `$DSH_HOME/profiles/node_modules` → each parent
  directory's `node_modules`) and skips cleanly when none exists.

**The agent preset ships along**: the validated `人脑式上下文压缩` preset lives
in `preset/` (compression-discipline persona + session-level argp engine row).
Copy it to `$DSH_HOME/.agent-presets/brain-compaction/`; see `preset/README.md`.

**Release checklist**: `git init`, commit everything (`.gitignore` excludes
`node_modules/`; commit `lib/`, `preset/`, `src/`, `scripts/`, `test/`,
`cordis.patch.yml`, READMEs, LICENSE), tag `v0.1.5`, then
`dsh plugin --profile web add "github:<you>/dsh-brain-compaction#v0.1.5"`.

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
   (This used to report nothing on 0.1.5 — `session.events` was removed; it now
   reads `session.snapshotEvents()`.)
2. If Context Doctor is installed, call `context_audit`: per-item token cost of
   AGENTS.md chain / skill catalog / tool schemas / MCP surface, duplicates and
   conflicts (per-request injection; compaction shrinks the conversation, not
   this baseline).
3. Run two manual compactions (`/compact`), then `brain_verify` again and
   compare `sessionTokens` and the compaction history — that is the
   before/after Token delta.
4. `brain_status` for arbitrary snapshots; `brain_recall(seq|query)` for
   unified recovery of pruned content.
5. Three shipped suites (`npm run verify`): `test/contract.test.mjs` (42 static
   contract assertions), `test/mount.test.mjs` (16 real-runtime mount
   assertions), `test/client.test.mjs` (16 browser-half smoke assertions).

## Config matrix

| Parameter | Plane | How |
|---|---|---|
| Engine choice | composition | `cordis.patch.yml` disabled flags + restart (only argp is usable on 0.1.5) |
| argp maxPasses / recencyGuard | composition | row config (default 256 / 10) |
| instant thresholdRatio / retainTurns / retainTokens / auto / checkpointCap | runtime | unified panel / settings `compaction-instant` (that plug-in is unusable on 0.1.5) |
| headroom toggle / threshold / proxy | runtime | unified panel / settings `headroom` |
| selfTestAfterBoot / verifyDetail | runtime | unified panel / settings `brain-compaction` (0.1.5: `ctx.settings.installSection`) |
| sgme baseUrl / agentKey / … | composition | row config + env vars |
| vault injectLimit / recallLimit | composition | row config (default 8 / 10) |
| mcp-lens servers / allowTools / denyTools | composition | row config (empty, fail-closed) |
| context-doctor defaultCwd / cacheTtlMs | composition | its own patch |

## Layout

```
src/host/index.ts       entry (settings soft-dependency registration, tools, events, boot self-check)
src/host/config.ts      unified config (brain-compaction namespace + schema; settings package is type-only)
src/host/integration.ts component matrix / engine arbitration / verify / unified recall
src/client.js           unified settings panel (verbatim ModuleLoader factory; platform word dsh-client-store)
cordis.patch.yml        assembly: component rows + engine exclusivity + basic disabled
scripts/build.mjs       esbuild packaging (src/host/*.ts → lib/*; falls back to the official CLI on EPERM)
test/contract.test.mjs  static contract tests (42, incl. 0.1.5 regression guards)
test/mount.test.mjs     real-runtime mount tests (16; needs a DSH install, else skipped)
test/client.test.mjs    browser-half smoke tests (16; no browser needed)
```

## Development

```sh
npm run build       # esbuild host + verbatim client copy
npm run test        # static contract tests (42)
npm run test:mount  # real-runtime mount tests (16; skipped without a DSH install)
npm run test:client # browser-half smoke tests (16)
npm run verify      # all of the above
```

## Troubleshooting

- Boot error `tool "recall" is already registered`: argp and instant are both
  enabled — restore engine exclusivity.
- Boot error duplicate row id: a sub-plug-in was previously added as its own
  bundle (`dsh plugin --profile web remove <name>`, keep this bundle’s
  assembly).
- Boot error `The requested module '@deepseek-ai/dsh-settings' does not provide
  an export named 'installSettingsSection'`: you are on a pre-0.1.5 version
  (that one only targets 0.1.0-rc.x). Upgrade to 0.1.5+.
- Startup fails after enabling the instant engine: `dsh-compaction-instant@0.1.4`
  is not 0.1.5-compatible (same removed exports). Keep that row
  `disabled: true`, or wait for an upstream release.
- The "Brain Compaction" card is missing from Settings → Plugins: either the
  host half did not mount (the host log carries the import error), or the host
  `brain-compaction` namespace failed to register — on 0.1.5 the plug-in
  configuration tab only renders the intersection of *namespaces the Host
  serves* and *card keys registered*, so a failed registration means no card
  (this is not a rendering bug). `npm run test:mount` answers this directly.
- `brain_verify` engine FAIL naming a class not in the engine table: the
  `ctx.compaction` implementation is new. If it is another argp assembly, add
  the class name to `ENGINE_CLASS_MAP` in `src/host/integration.ts`.
- `brain_verify` engine FAIL with no class name: something re-enabled
  `compaction-basic` or preempted the engine.
- A section is missing from the panel: that plug-in’s row is disabled by
  default (see table); enable and restart.

## License

MIT. Sub-plug-ins keep their own licenses (dsh-argp MIT, dsh-compaction-instant
MIT, dsh-memory-vault MIT, @wanyantiande/dsh-headroom MIT, dsh-mcp-lens
MIT/EULA, dsh-sgme MIT, dsh-context-doctor BSD-3-Clause).

