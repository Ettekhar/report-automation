# Server Architecture & Setup Guide (Catch-up Documentation)

## Overview & Architecture

This document preserves the context, decisions, architecture, and deployment procedures for the self-hosted server running on an Ubuntu 24.04 LTS machine.

### Physical Server Details
- **Host / Local IP**: `ettekhar@192.168.0.61` (Static LAN reservation)
- **Tailscale Private IP**: `100.71.169.117` (Access from anywhere)
- **Tailscale Hostname**: `ettekhar` (e.g. `http://ettekhar:3000` or `http://100.71.169.117:3000`)
- **Cloudflare Tunnel (Public HTTPS URL)**: `https://objects-unit-paintings-actually.trycloudflare.com`
- **OS**: Ubuntu Server 24.04 LTS (Kernel 6.8.0-139-generic x86_64)
- **Memory**: 8 GB RAM (7812 MB total, ~5.5 GB free)
- **Disk**: 232 GB NVMe/SSD (Root filesystem: `/dev/mapper/ubuntu--vg-ubuntu--lv`, ~213 GB free)
- **Runtimes Installed**:
  - Node.js `v22.23.2` & npm
  - Docker `v29.1.3`
  - Docker Compose `v2.40.3`
  - Git, OpenSSH, UFW, curl, wget

---

## High-Level Target Architecture

```
                       INTERNET (Optional / Future)
                                   │
                         [ Cloudflare Tunnel ]
                                   │
                             [ Nginx :80 ]
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
     Next.js Web App (:3000)                Job Notifier / Dashboard (:3000)
    (Report Automation)                    (teletalk-job-notifier)
              │                                         │
              │                               ┌─────────┴─────────┐
              ▼                               ▼                   ▼
    PostgreSQL / D1 Database              Playwright          Cron / Scraping
                                          (Chromium)             Scheduler
```

### Remote Administration
- **Tailscale**: Recommended for secure private administration and access without opening router ports or purchasing a domain.
- **LAN Access**: Direct access via `http://192.168.0.61:3000` or SSH `ssh ettekhar@192.168.0.61`.

---

## Application 1: Job Automation (`teletalk-job-notifier`)

### Repository & Version
- **Path on Server**: `/home/ettekhar/apps/job-automation`
- **Git Remote**: `https://github.com/Ettekhar/job-automation.git`
- **Pinned Commit**: `0c505e2` (`feat: add Google OAuth login, JWT auth middleware, fix cron job SMTP secrets`)

### Core Characteristics
1. **Node / Express Server**:
   - Entry point: `server.mjs`
   - Port: Default `3000` (configurable via `PORT` environment variable)
   - Serves web dashboard from `public/`
2. **Playwright / Chromium**:
   - Dependency: `playwright: ^1.47.0`
   - Used for scraping and job application autofill (`scripts/autofill.mjs`, `scripts/scrape.mjs`).
   - Requires browser binaries and OS dependencies (libnss3, libasound2, etc.).
3. **Persistent Local State**:
   - `config/`: Configuration files (e.g. `keywords.json`, `profile.json`).
   - `data/`: Scraped jobs, notification state, seen notices (`jobs.json`, `seen-jobs.json`, `bb-notices.json`, `scrape-history.json`, `applied-jobs.json`).
   - These directories must persist across restarts and container rebuilds.
4. **Environment Variables (`.env`)**:
   - Located at `/home/ettekhar/apps/job-automation/.env`
   - Contains credentials, SMTP secrets, JWT secret, and Google OAuth credentials.
   - The web dashboard can dynamically update AI settings back into `.env`.
   - Permissions: `chmod 600 .env` (secured).

### Deployment Strategy (Docker & Docker Compose)
Rather than managing browser dependencies manually on Ubuntu, containerizing the application with Docker provides isolated browser binaries, persistent volume mounts, and automatic restarts on system boot.

#### Volume Mounts Required:
- `./config:/app/config`
- `./data:/app/data`
- `./.env:/app/.env`

---

## Application 2: Report Automation (`report-automation`)

### Repository & Stack
- **Path**: Next.js 15+ with Cloudflare OpenNext (`@opennextjs/cloudflare`)
- **Database**: Drizzle ORM + Cloudflare D1
- **Auth**: Better-Auth
- **Styling**: Tailwind CSS v4
- **Local Dev / Server Hosting**: Can run locally or on server via Node/OpenNext or Cloudflare Workers/Pages.

---

## Useful Operational Commands

### SSH Connection
```bash
ssh ettekhar@192.168.0.61
```

### Checking Running Processes
```bash
# Check running Node processes
ps aux | grep node

# Check Docker containers
docker ps -a
```

### Docker Compose Lifecycle (in `/home/ettekhar/apps/job-automation`)
```bash
# Build and start container in background
docker compose up -d --build

# View logs
docker compose logs -f

# Restart container
docker compose restart

# Stop container
docker compose down
```

### Health Check
```bash
curl -I http://localhost:3000
# From LAN:
# http://192.168.0.61:3000
```

---

## Auto-Boot Systemd Services (Survives Reboots & Power Cuts)

Both the application and the Cloudflare Tunnel are configured as systemd services that automatically start on boot:

### 1. Application Service (`teletalk-notifier.service`)
- **Unit File**: `/etc/systemd/system/teletalk-notifier.service`
- **What it does**: Starts the isolated Docker stack on boot, manages container lifecycle, and cleanly shuts down on reboot.
- **Commands**:
  ```bash
  sudo systemctl status teletalk-notifier.service   # check status
  sudo systemctl restart teletalk-notifier.service  # restart app
  sudo systemctl stop teletalk-notifier.service     # stop app
  ```

### 2. Cloudflare Tunnel Service (`cloudflared-tunnel.service`)
- **Unit File**: `/etc/systemd/system/cloudflared-tunnel.service`
- **What it does**: Automatically starts the Cloudflare tunnel on boot and whenever network reconnects.
- **Auto-Email on Boot**: Runs `/home/ettekhar/scripts/notify-tunnel-url.py` on start, which extracts the new `trycloudflare.com` URL and automatically emails it to `taion16240@gmail.com` with login credentials.
- **Commands**:
  ```bash
  sudo systemctl status cloudflared-tunnel.service   # check tunnel status
  sudo systemctl restart cloudflared-tunnel.service  # restart tunnel
  cat ~/CURRENT_TUNNEL_URL.txt                      # view active public link
  ```

