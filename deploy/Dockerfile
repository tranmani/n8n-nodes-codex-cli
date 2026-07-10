# n8n image with the OpenAI Codex CLI baked in.
# Build:  docker build -t n8n-codex ./deploy
# Then point your n8n service at this image (see deploy/README.md).
FROM docker.n8n.io/n8nio/n8n:latest
USER root
# The subscription CLI. `codex` lands on PATH for the `node` user.
RUN npm install -g @openai/codex && codex --version
USER node
