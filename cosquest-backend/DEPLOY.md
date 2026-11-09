# Test server: automatic deploys

Every push to `main` that touches `cosquest-backend/` runs the backend tests on GitHub and, only if they pass, deploys to the **test server** on Mark's machine:

**https://cosquest-api-test.204.168.162.79.sslip.io** (health: `/health`, model manifest: `/v1/model`)

It is a full copy of the backend with its own MongoDB and Redis (fresh data, not production), and Sparks switched on (`SPARKS_ENGINE=module`). Point a development build of the app at it to test Sparks end to end. Production is not touched.

## What happens on a push

1. **test**: `npm ci` and `npm test` in `cosquest-backend/` (in-memory MongoDB and Redis).
2. **deploy**: the code of that commit is sent to the server, which builds `cosquest-backend/Dockerfile`, starts the new version, and checks `/health` for up to 90 seconds. If the new version does not come up, the server switches straight back to the previous one, and the workflow fails so you see it.
3. **check**: `/health` over HTTPS.

The workflow is `.github/workflows/deploy-test.yml`. You can also run it by hand: Actions > deploy-test > Run workflow.

## Settings and keys (`COSQUEST_TEST_ENV`)

The server already sets the infrastructure values: `MONGODB_URI`, `REDIS_URL`, `PORT`, `UPLOAD_DIR`, `NODE_ENV`, `PUBLIC_BASE_URL`, `SPARKS_ENGINE`, `SPARKS_MODEL_MANIFEST_URL`, plus its own `JWT_SECRET` and `OAUTH_COOKIE_SECRET`.

Everything else (Cloudinary, LiveKit, Deepgram, SMTP, Google/Apple sign-in, Anthropic, dashboard settings...) goes in **one repository secret, `COSQUEST_TEST_ENV`**, written like a `.env` file:

```
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
LIVEKIT_URL=...
```

Settings > Secrets and variables > Actions > `COSQUEST_TEST_ENV`. Use test or development keys, not production ones. The next deploy applies it (run the workflow by hand to apply it at once). The infrastructure values above cannot be overridden from here.

## Secrets this workflow uses

| Secret | What it is |
|---|---|
| `DEPLOY_SSH_KEY` | A key that can only start a deploy on the test server (no shell, nothing else) |
| `DEPLOY_HOST_KEY` | The server's SSH host key, so the workflow only talks to the real server |
| `COSQUEST_TEST_ENV` | Your keys for the test server (above). Optional |

## Rollback and status

A failed deploy rolls back by itself. To go back to the previous version on purpose, ask us, or (with the deploy key) run `ssh cosquest-deploy@204.168.162.79 rollback`; `status` shows what is live. The server keeps the last five versions and a nightly database backup (seven days).
