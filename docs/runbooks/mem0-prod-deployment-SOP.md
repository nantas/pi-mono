# Mem0 Production Deployment SOP

## Overview
This document describes the Standard Operating Procedure (SOP) for deploying code changes to the Mem0 production environment.

## Context
Mem0 production environment runs via Docker Compose using `server/docker-compose.prod.yaml`. It uses a custom Dockerfile `server/prod.Dockerfile`.

**Critical Note**: The production setup does **NOT** mount local source code volumes. Code changes require a full image rebuild.

## Deployment Steps

### 1. Code Changes
Ensure all code changes are committed to git.

### 2. Stop & Clean
Stop the running containers and remove the old image to force a fresh build.

```bash
# Stop containers
docker compose -f server/docker-compose.prod.yaml down

# Remove old image (optional but recommended for clean state)
docker rmi mem0-prod-mem0:latest || true
```

### 3. Rebuild & Start
Rebuild the image and start the service. `--build` ensures the image is rebuilt, and `--force-recreate` ensures containers use the new image.

```bash
docker compose -f server/docker-compose.prod.yaml up -d --build --force-recreate
```

### 4. Verification
Verify the deployment by checking logs or executing commands inside the container.

```bash
# Check logs
docker logs mem0-prod-mem0-1

# Verify file content (example)
docker exec mem0-prod-mem0-1 grep "expected_string" /app/main.py
```

## Common Pitfalls
- **Assuming Volume Mounts**: Do NOT assume local file changes reflect in production immediately. You must rebuild.
- **Cache**: Docker build cache might prevent picking up latest changes. Use `docker compose build --no-cache mem0` if needed.
- **Service Name**: The service name in `docker-compose.prod.yaml` is `mem0`, but the container name is usually `mem0-prod-mem0-1`.

## Related Files
- `server/docker-compose.prod.yaml`
- `server/prod.Dockerfile`
