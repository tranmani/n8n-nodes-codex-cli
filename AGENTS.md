# AGENTS.md — instructions for AI agents working in this repo

For AI coding agents. Humans: see [`README.md`](./README.md) and [`docs/DESIGN.md`](./docs/DESIGN.md).
**If you are an agent reading this, follow it before editing.**

## What this repo is

An n8n community node (`n8n-nodes-codex-cli`) that runs OpenAI Codex via the local
`codex` CLI using a **ChatGPT subscription** (Sign in with ChatGPT) — no API key.
It is the Codex twin of `n8n-nodes-claude-cli`: same shape, `codex exec` instead
of `claude -p`.

## Where the logic lives

| Path | What | Rules |
|------|------|-------|
| `nodes/CodexSubscription/exec.ts` | `buildArgs()` (pure) + `runCodex()` (spawn + read `--output-last-message` file) | **No `n8n-workflow` import.** All real logic here or in `parse.ts`. |
| `nodes/CodexSubscription/parse.ts` | `parseCodexEvents()`, `extractJson()` | Pure, dependency-free, tested. |
| `nodes/CodexSubscription/CodexSubscription.node.ts` | n8n glue | Thin adapter only. |
| `credentials/CodexSubscriptionApi.credentials.ts` | config-only credential | **Never** add a secret — auth is the mounted `~/.codex`. |
| `__tests__/` | vitest over the pure modules | Add a test with every logic change. |

## Hard invariants — do NOT regress (there are tests)

1. **Never build a shell command string.** Use `spawn('codex', argvArray)`; the prompt is the final positional argv element. Test: buildArgs "keeps a malicious-looking prompt as a single argv element".
2. **Chat = `read-only` sandbox.** Agentic defaults to `workspace-write`; `danger-full-access`/`--full-auto` only when the user opts in.
3. **No secret in the credential.**
4. **Every invocation has a timeout** that `SIGKILL`s the process; the temp `--output-last-message` file is always cleaned up.
5. `exec.ts`/`parse.ts` stay n8n-free and pure.
6. **`package.json` must NOT list `n8n-workflow` as a dependency or peerDependency** — n8n provides it at runtime; keep it a devDependency only. (Declaring it as a peer makes n8n's community installer pull it + `isolated-vm` and trip the loader.)

## Codex CLI reference

- `codex exec <prompt>` — non-interactive. `--json` streams ndjson events. `-o/--output-last-message <file>` writes the final message (we read this for the answer). `--skip-git-repo-check` (run outside a git repo). `-m/--model`, `-s/--sandbox <read-only|workspace-write|danger-full-access>`, `--full-auto`, `-C/--cd <dir>`.
- Auth: `codex login` (Sign in with ChatGPT) → `~/.codex/auth.json`. Mount it read-only like the Claude node mounts `~/.claude`.

## Workflow for a change

```bash
npm install --ignore-scripts
npm test && npm run typecheck && npm run build
```
Add a test first (TDD). Update `docs/DESIGN.md` for architecture/invariant changes, `README.md` for param/output changes. Conventional-commit messages.

## Scope discipline

Local-exec, subscription-only by design. Do not add SSH/Docker/k8s backends or an
API-key path — propose those in an issue first.
