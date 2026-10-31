# Runbook: rebuilding umless.in from nothing

For when the VM is lost, corrupted or compromised. Everything needed lives in four places:

| What | Where it survives |
|---|---|
| Code | GitHub `lodhiPlayBits/umless` (**only what's pushed**) |
| Secrets | your password manager: the six `.env` files below |
| Database | MySQL HeatWave (a separate OCI service, survives the VM). If it's lost too: the nightly dumps in bucket `umless-backups` (`docs/runbooks/backups.md`) |
| Transcripts | bucket `bucket-20261024-1540` (survives the VM; versioned) |

Not needed from the old VM: the TLS certificate (reissued in step 6), Docker images (rebuilt), and Redis (only short-lived limit counters).

**The six `.env` files** (keep all of them in the password manager, updated whenever one changes):

| File | Holds |
|---|---|
| `backend/.env` | Deepgram, MySQL, Clerk, OCI, Razorpay (+ webhook secret), `REDIS_URL` |
| `.env` (repo root) | Deepgram key (older copy; `backend/.env` wins) |
| `frontend/.env` | `VITE_CLERK_PUBLISHABLE_KEY` (baked into the build) |
| `deploy/.env` | `SERVER_NAME`, `CERTBOT_EMAIL` |
| `redis/.env` | `REDIS_PASSWORD` |
| `backup/.env` | backup's MySQL user, bucket, namespace, region |

Expected time: about an hour, most of it waiting for the VM and DNS.

## 1. A new VM

OCI console → Compute → Create instance:
- Image: **Ubuntu 24.04**. Shape: **Ampere A1 (VM.Standard.A1.Flex)**, 2 OCPU, 12 GB (Always Free). The images are built on the VM, so the architecture can change, but stay on ARM to keep the free tier.
- Network: the **same VCN and subnet** as before, so it reaches MySQL at its private IP. Public IPv4: yes. Your SSH key.

Then the network:
- The subnet's security list must allow TCP **80 and 443** from `0.0.0.0/0` (unchanged if you kept the subnet).
- Ubuntu images on OCI also have their own firewall. Allow both ports:
  ```bash
  sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT && sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
  sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
  ```

## 2. Let the new VM reach the buckets

The VM signs in to OCI as itself, and a new VM has a new OCID. Identity → Domains → Default → Dynamic groups → `umless-vm` → change the rule to `instance.id = '<the new VM's OCID>'`. The policies (`umless-bucket-access`) stay as they are. Allow a minute or two.

## 3. Docker and the code

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu   # log out and back in, or use: sg docker -c '…'
mkdir -p ~/umless && cd ~/umless && git clone https://github.com/lodhiPlayBits/umless.git
cd umless && git checkout main   # or the release tag you last deployed
```

## 3b. Log in to OCIR

The server pulls the images CI built (`docs/runbooks/deploys.md`). The auth token is in the password manager, or generate a new one in the OCI console:
```bash
sg docker -c 'docker login bom.ocir.io -u "bmej3eov9wnf/Default/gauravlodhi983@gmail.com"'
```

## 4. The secrets

Recreate the six `.env` files from the password manager, at the paths above. Then make them private:

```bash
chmod 600 .env backend/.env frontend/.env deploy/.env redis/.env backup/.env
```

## 5. DNS

Point the `A` record of `umless.in` at the new VM's public IP (where you bought the domain). Wait until `dig +short umless.in` shows the new IP.

## 6. Start everything, then the certificate

```bash
cd ~/umless/umless/deploy
sg docker -c 'docker compose up -d --build'
sg docker -c 'sh init-letsencrypt.sh'
```

`--build` builds from the checkout, which is fine to get running again. Afterwards, run `deploy/setup-ci-access.sh` (a new VM has new host keys: update the `DEPLOY_KNOWN_HOSTS` and `DEPLOY_SSH_KEY` secrets, and the GitHub deploy key), then `deploy.sh <latest main sha>` swaps in the exact images CI built.

The stack first starts with a self-signed certificate; `init-letsencrypt.sh` replaces it with a Let's Encrypt one. The backend runs its database migrations on start.

## 7. If the database was lost too

Create a new MySQL HeatWave system (Always Free, same VCN). Then:
1. In it, create the database and the app user from `backend/.env`.
2. Update `DB_HOST` in `backend/.env` and `backup/.env`.
3. Restore the newest dump: `docs/runbooks/backups.md`, "Restoring for real", steps 3–5.
4. Re-credit any purchases made after the dump's time (Razorpay dashboard → Payments; `docs/runbooks/refunds.md`).

## 8. Check

- [ ] `docker ps`: backend, frontend, nginx, redis and backup all up; backend and backup `healthy`.
- [ ] `https://umless.in` loads with a valid certificate.
- [ ] Sign in → questions, history and balance are there.
- [ ] One transcription works (costs one Deepgram call).
- [ ] The Razorpay webhook still answers (Razorpay dashboard → Webhooks → recent deliveries; or `docs/runbooks/refunds.md` for the logs).
- [ ] `docker logs umless-backup` shows an upload; run `backup/restore-test.sh`.
- [ ] The uptime monitor (Phase 3) is green again.

Then **terminate the old VM** if it still exists (a compromised one can still send email or use the buckets until its dynamic-group rule is gone; step 2 removed that).

## Keeping this runbook true

- Push to GitHub after every deploy. Code that's only on the server is lost with it.
- When a `.env` changes, update the password manager the same day.
- Once a year, or after a big infrastructure change, read this top to bottom and fix whatever has drifted.
