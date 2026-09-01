# iwillbuild-image-safeguard-poc

Private Cloudflare Worker — Image Safeguard POC classifier.

## Security contract

- POST only. All other methods → 405.
- Authentication via `X-Safeguard-Token` header (constant-time compare).
- Content-Type must be `image/jpeg`, `image/png`, or `image/webp`.
- Magic bytes independently verified — Content-Type header not trusted.
- Content-Length enforced before body allocation (10 MB hard limit).
- Structural and dimension/pixel limits enforced before model submission.
- Returns **only**: `clear` | `privacy_signal` | `unavailable` | `failed`.
- **Never** infers identity, age, gender, ethnicity, intent, or criminality.
- No image bytes, tokens, or raw model output in any log or response.
- No R2 binding. No storage. No queues. No writes of any kind.

## Bindings

| Binding | Type | Purpose |
|---|---|---|
| `AI` | Workers AI | Face detection inference only |
| `SAFEGUARD_TOKEN` | Worker secret | Authentication |

No R2, KV, D1, Queue, Durable Object, or Cron bindings.

## Response schema

```json
{
  "result": "clear" | "privacy_signal" | "unavailable" | "failed",
  "approximateFaceCount": 0,
  "requestId": "opaque-hex-string"
}
```

`privacy_signal` means one or more human faces were detected. It is not a legal
conclusion and does not identify any person.

## Local setup

```bash
cd workers/iwillbuild-image-safeguard-poc
npm install
npm test
```

## Deploy

```bash
# Requires: wrangler authenticated, CLOUDFLARE_ACCOUNT_ID set
bash scripts/deploy.sh
```

The deploy script runs local tests, deploys the Worker, and prompts for the
`SAFEGUARD_TOKEN` secret. Generate a strong token:

```bash
openssl rand -hex 32
```

## Synthetic POC test (post-deploy)

```bash
export WORKER_URL="https://iwillbuild-image-safeguard-poc.<subdomain>.workers.dev"
export SAFEGUARD_TOKEN="<your-token>"
bash scripts/synthetic-poc-test.sh
```

**Do not add `WORKER_URL` or `SAFEGUARD_TOKEN` to Airo secrets until the POC
test confirms `privacy_signal` for a synthetic face image.**

## Model

- Model: `@cf/moondream/moondream3.1-9B-A2B`
- Task: `detect`
- Target: `human face`
- Output: detection count only — no bounding boxes, labels, scores, or identity
