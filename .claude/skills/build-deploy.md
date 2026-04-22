---
name: build-deploy
description: Build and deploy the dashboard Docker container
user_invocable: true
---

Build and deploy the TeslaMate dashboard container.

Steps:
1. Run `docker compose build dashboard` to build the image
2. If build succeeds, run `docker compose up -d dashboard` to deploy
3. Report the result (success/failure)

If the build fails, show the error output and do NOT proceed with deploy.
Use `--no-cache` flag only if the user explicitly requests it or if cached build doesn't pick up changes.
