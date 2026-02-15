# Mom Discord Rollback Runbook

## Emergency Rollback Procedure

If production fails after cutover, execute these steps immediately:

### Step 1: Stop Production Mom
```bash
# Interrupt the mom process (Ctrl+C in its terminal)
# Or find and kill it:
ps aux | grep '[m]om --sandbox=docker:mom-sandbox-discord-prod'
kill <PID>
```

### Step 2: Restore Prod Data from Backup
```bash
# Find the latest prod backup
ls -t "$HOME/.pi/mom/backups"/prod-data-before-*.tgz | head -n 1

# Restore
LATEST="$(ls -t "$HOME/.pi/mom/backups"/prod-data-before-*.tgz | head -n 1)"
rm -rf "$HOME/.pi/mom/discord-prod/data"
mkdir -p "$HOME/.pi/mom/discord-prod"
tar -xzf "$LATEST" -C "$HOME/.pi/mom/discord-prod"
```

### Step 3: Restart Production Container
```bash
docker start mom-sandbox-discord-prod
```

### Step 4: Verify Rollback
```bash
ls -la "$HOME/.pi/mom/discord-prod/data"
```

## Operational Hardening Checklist

- [ ] Separate dev/prod Discord bots (different tokens)
- [ ] `chmod 600` on env.sh files (done during setup)
- [ ] Weekly backup cron for prod data
- [ ] Never run production with repository-local `./data`
- [ ] Monitor production logs after cutover
- [ ] Document any issues encountered

## Recovery Time Objective

- Target: < 5 minutes for rollback
- Actual time depends on data size for restore
