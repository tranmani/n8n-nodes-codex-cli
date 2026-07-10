# Deploying — Codex CLI inside n8n

This node shells out to `codex`, so the CLI must exist **in the same environment
as n8n** and be logged in with your ChatGPT subscription. Two pieces:

1. an n8n image that includes the CLI (`Dockerfile` here), and
2. the subscription auth, shared into the container from your host `~/.codex`.

## 1. Build the image

```bash
docker build -t n8n-codex ./deploy
```

## 2. Compose snippet

```yaml
services:
  n8n:
    image: n8n-codex               # the image built above
    restart: unless-stopped
    ports:
      - "127.0.0.1:5678:5678"      # keep it loopback; front it with a proxy for remote access
    environment:
      - CODEX_HOME=/home/node/.codex
    volumes:
      - n8n_data:/home/node/.n8n
      # Share your ChatGPT subscription login, READ-ONLY:
      - ${HOME}/.codex:/home/node/.codex:ro

volumes:
  n8n_data:
```

## 3. Install the node

Once published to npm: n8n → **Settings → Community nodes → Install** →
`n8n-nodes-codex-cli`. For local dev, mount your built `dist/` into
`/home/node/.n8n/nodes/node_modules/n8n-nodes-codex-cli`.

## 4. Add the credential

Create a **Codex Subscription (Local CLI)** credential. It stores no secret —
just the binary path (`codex`), an optional default model, and a timeout.

## Auth-portability caveat (read this)

The node only works if `codex` inside the container is actually authenticated.
`codex login` performs a **Sign in with ChatGPT** OAuth flow and stores tokens in
`~/.codex/auth.json`:

- **File-based** (`~/.codex/auth.json`) → the read-only mount above carries it into
  the container. Verify with:
  ```bash
  docker exec -it <n8n> codex exec --skip-git-repo-check "reply with OK"
  ```
- The OAuth login is interactive (browser). Easiest is to run `codex login` **on
  the host** first, then mount `~/.codex`. If the CLI must refresh tokens and the
  mount is read-only, either mount read-write or re-run `codex login` on the host.

## Security notes

- The mount is **read-only** and Codex runs as the unprivileged `node` user.
- **Chat** uses a `read-only` sandbox; **Agentic** defaults to `workspace-write`.
  Only enable `danger-full-access` / Full Auto for workflows you trust — they let
  Codex change the container.
- **Terms of service:** driving a ChatGPT **subscription** through automation may
  conflict with OpenAI's subscription terms (subscriptions are intended for
  interactive use; the API is the sanctioned path for programmatic/high-volume
  use). Confirm before relying on it operationally.
