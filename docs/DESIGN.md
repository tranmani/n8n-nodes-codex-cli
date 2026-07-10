# Design — n8n-nodes-codex-cli

## Goal

An n8n community node that runs OpenAI Codex through the **local, subscription-
authenticated Codex CLI** (Sign in with ChatGPT) — no OpenAI API key. The Codex
twin of `n8n-nodes-claude-cli`.

## Why build it (vs adopt)

A 2026-07 survey of npm found no community node that combines: shells out to the
Codex CLI + subscription auth + **auditable source** + any maintenance signal.
The best-downloaded candidates ship placeholder/mismatched repos (unverifiable
provenance); the closest real analog publishes no repo at all. Since a good Codex
node is a near-mechanical fork of the (owned, audited) Claude node, building it —
with source we control — is the sound choice.

## Non-goals

- No API-key path (that's the first-party n8n OpenAI node's job).
- No streaming to the n8n UI (n8n returns once; we read the final message).
- Local exec only — no SSH/Docker/k8s backends.

## Architecture

```
                         n8n workflow
                              │  items
                              ▼
   CodexSubscription.node.ts ── reads params + credential
                              │
             runCodex(input)  │  exec.ts
                              ▼
    spawn('codex', ['exec', …, '--output-last-message', tmp, prompt])   ← no shell
                              │
        codex CLI (subscription auth from ~/.codex)
                       ┌──────┴───────┐
             tmp file  │              │  stdout (--json events)
        (final message)▼              ▼
                    read text    parseCodexEvents() (usage/session)
                              │
                              ▼   extractJson() for JSON mode
                        item.json { text, data?, inputTokens, … }
```

### Modules

| File | Responsibility | Depends on |
|------|----------------|------------|
| `nodes/CodexSubscription/exec.ts` | `buildArgs()` (pure argv) + `runCodex()` (spawn + read output file) | node stdlib only |
| `nodes/CodexSubscription/parse.ts` | `parseCodexEvents()`, `extractJson()` | nothing |
| `nodes/CodexSubscription/CodexSubscription.node.ts` | n8n I/O glue | `n8n-workflow`, the two above |
| `credentials/CodexSubscriptionApi.credentials.ts` | binary path, default model, timeout (no secret) | `n8n-workflow` |

`exec.ts`/`parse.ts` import nothing from n8n → unit-tested in isolation; the node
file is a thin adapter.

## The output-file mechanism

Unlike `claude -p` (which prints the answer as JSON to stdout), `codex exec` is an
agent that streams progress. We use `--output-last-message <tmpfile>` to get the
final assistant message reliably, and `--json` to mine events for token usage.
`runCodex` creates the temp file, runs, reads it, and always deletes it.

## Security invariants

1. **No shell** — `spawn('codex', argvArray)`; prompt is the final positional arg (tested against injection).
2. **Sandbox by default** — Chat runs `read-only`; Agentic `workspace-write`; `danger-full-access`/`--full-auto` only on explicit opt-in.
3. **No secret in the credential** — auth is the mounted `~/.codex`.
4. **Timeouts kill**; the temp output file is always cleaned up.

## Packaging lesson (inherited)

`n8n-workflow` stays a **devDependency only** — never a dependency/peerDependency.
Declaring it as a peer makes n8n's community-node installer pull it + `isolated-vm`
and trip the loader ("Cannot set properties of undefined").

## Deployment

`deploy/Dockerfile` extends `n8nio/n8n` and `npm i -g @openai/codex`; the compose
snippet mounts host `~/.codex` read-only so the container inherits the ChatGPT
login. No Docker socket, no SSH.
