# n8n-nodes-codex-cli

Run **OpenAI Codex** in [n8n](https://n8n.io) through your **local,
subscription-authenticated Codex CLI** (Sign in with ChatGPT) — **no OpenAI API
key**. One node, two operations (**Chat** and **Agentic**), local execution, **no
Docker socket and no SSH** to set up.

> ⚠️ Community node. It shells out to the `codex` CLI, which runs inside the n8n
> process's environment. Read [Security](#security) and the
> [ToS caveat](#terms-of-service) before using it in production.

This is the Codex twin of [`n8n-nodes-claude-cli`](https://github.com/tranmani/n8n-claude-cli-bridge)
— same shape, `codex exec` instead of `claude -p`.

## Why this node

The first-party n8n **OpenAI** node is API-key only. This node uses your **ChatGPT
Plus/Pro subscription** via the Codex CLI:

- **Chat** — plain prompt → answer (read-only sandbox), with an optional **JSON**
  response mode (parsed for you, one auto-retry on invalid JSON).
- **Agentic** — let Codex use tools / edit files with a chosen **sandbox**
  (`read-only` / `workspace-write` / `danger-full-access`), optional **Full Auto**,
  and a working directory.
- **Local exec only** — `spawn('codex', …)`. No socket, no SSH, no API key.

## Install

n8n → **Settings → Community nodes → Install** → `n8n-nodes-codex-cli`.

The `codex` CLI must be available and logged in **in the same environment as
n8n**. See [`deploy/`](./deploy/README.md) for a ready-made n8n image with the CLI
baked in and your subscription mounted read-only.

## Credential — "Codex Subscription (Local CLI)"

Holds **no secret** (auth lives in `~/.codex`). Fields:

| Field | Default | Purpose |
|-------|---------|---------|
| Codex Binary Path | `codex` | Path to the executable |
| Default Model | *(blank)* | e.g. `gpt-5-codex` |
| Timeout (seconds) | `120` | Kill a hung invocation |

## How it works

Drives `codex exec <prompt> --json --output-last-message <tmpfile> --skip-git-repo-check`.
The final assistant message is read from the temp file; `--json` events are mined
for token usage. Arguments are passed as an argv array (no shell → no injection).

## Output

```json
{
  "text": "…the model's answer…",
  "data": { "…": "…" },          // only in Chat + JSON mode
  "model": "gpt-5-codex",
  "inputTokens": 120,
  "outputTokens": 8,
  "sessionId": "sess_…"
}
```

## Security

- **No shell** — arguments passed as argv (test for the `"; rm -rf /` case).
- **Chat = read-only sandbox**; Agentic defaults to `workspace-write`. Enable
  `danger-full-access` / Full Auto only for trusted workflows.
- **Read-only auth mount**, unprivileged `node` user (see `deploy/`).

## Terms of service

Driving a ChatGPT **subscription** through automation may conflict with OpenAI's
subscription terms — subscriptions are intended for interactive use; the **API**
is the sanctioned path for programmatic/high-volume use. Confirm this fits your
plan before relying on it.

## Development

```bash
npm install --ignore-scripts   # n8n-workflow pulls a native dep only needed at n8n runtime
npm test                       # vitest — pure exec/parse logic
npm run typecheck
npm run build                  # tsc -> dist/ + icon copy
```

Architecture: [`docs/DESIGN.md`](./docs/DESIGN.md). Agent notes: [`AGENTS.md`](./AGENTS.md).

## License

[MIT](./LICENSE)
