# Workspace

## Overview

This project is a pnpm workspace monorepo using TypeScript, designed for managing VPN services. It provides a robust API server, a React-based VPN control panel, and advanced features for traffic obfuscation and cluster management. The system aims to offer a secure, high-performance, and user-friendly solution for VPN administration, with a focus on evading Deep Packet Inspection (DPI).

**Key Capabilities:**
- **VPN User and Profile Management:** Create, update, delete, block, and unblock VPN users and profiles.
- **Traffic Obfuscation (Anti-DPI):** Implement advanced techniques like TLS ClientHello Fragmentation, Multi-Transport Support, Automatic Transport Fallback, and uTLS Fingerprint Rotation.
- **Cluster Management:** Manage multiple VPN servers, monitor their status, and enable inter-node synchronization.
- **Routing Rule Management:** Define and manage routing rules for traffic, including presets.
- **Monitoring and Statistics:** Track traffic usage, server status, and auto-switch events.
- **Admin Panel:** A React-based UI with a cyberpunk theme for easy administration.

## User Preferences

- All UI text is in Russian with cyberpunk-style naming (e.g., "Сеть_Ядро", "Матрица_Пользователей", "Исходящие_Узлы").
- The VPN panel should feature a dark cyberpunk theme (teal neon on dark navy).
- Development should be iterative, with clear communication before major changes.
- Provide detailed explanations for complex architectural decisions.

## System Architecture

The project is structured as a pnpm monorepo, enabling shared libraries and consistent tooling across packages. TypeScript is used throughout, with composite projects to manage dependencies and type-checking efficiently.

**Core Technologies:**
- **Monorepo Tool:** pnpm workspaces
- **Node.js:** v24
- **TypeScript:** v5.9
- **API Framework:** Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (for CJS bundles)
- **Frontend Framework:** React + Vite
- **Routing (Frontend):** wouter v3
- **State Management (Frontend):** TanStack React Query

**Architectural Patterns & Design Decisions:**
- **Modular Monorepo:** Separates concerns into `artifacts` (deployable applications like `api-server`, `vpn-panel`) and `lib` (shared libraries like `api-spec`, `api-client-react`, `api-zod`, `db`).
- **Type-Safe API:** OpenAPI specification defines API contracts, which are used by Orval to generate type-safe React Query hooks for the frontend (`api-client-react`) and Zod schemas for backend validation (`api-zod`).
- **Database Abstraction:** Drizzle ORM provides a type-safe interface to PostgreSQL, with schema definitions managed in `lib/db`.
- **Anti-DPI Architecture:**
    - **TLS ClientHello Fragmentation:** Implemented at the profile level with configurable parameters.
    - **Multi-Transport Support & Automatic Fallback:** Profiles can specify multiple transport types (TCP, WebSocket, gRPC, HTTP/2), and a background monitor automatically switches to the next available transport upon connection failures.
    - **uTLS Fingerprint Rotation:** Automated cycling of TLS fingerprints (Chrome, Firefox, Safari, Edge) at configurable intervals to evade detection.
    - **Xray Configuration Generation:** Dynamic generation of Xray JSON configurations incorporating anti-DPI features.
- **Cluster Management:**
    - Supports multiple `vpn_servers` and `cluster_nodes`.
    - Inter-node communication for synchronization of data and heartbeats, secured with `CLUSTER_SECRET`.
    - Synchronization changelog (`sync_changelog`) tracks entity changes across nodes.
- **UI/UX Design:**
    - **Cyberpunk Theme:** The `vpn-panel` features a distinct dark cyberpunk aesthetic with teal neon accents.
    - **Custom UI Components:** Reusable `CyberCard`, `CyberButton`, `CyberBadge`, `Modal`, `CyberInput`, and `CyberTooltip` components ensure thematic consistency.
    - **Localization:** All UI text is in Russian with thematic naming conventions.

**Feature Specifications:**
- **API Routes:** Comprehensive set of RESTful endpoints for user, profile, server, routing, monitoring, anti-DPI, and cluster management.
- **VPN Panel Routes:** `/` (dashboard), `/users`, `/profiles`, `/routing`, `/cluster`, `/settings`. No authentication required for routes.
- **IP Detection:** Dashboard displays client's public IP using a dedicated API endpoint.
- **VLESS Defaults:** Generated VLESS URLs default to `happ.su` but are configurable via environment variables.

## External Dependencies

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/vpn-panel` (`@workspace/vpn-panel`)

React + Vite frontend for VPN Control Panel. Dark cyberpunk theme (teal neon on dark navy). Uses wouter v3 for routing, TanStack React Query via generated hooks from `@workspace/api-client-react`.

- Routes: `/` (dashboard), `/users`, `/profiles`, `/routing`, `/cluster`, `/settings`
- Auth: Removed — all routes are publicly accessible (no login required)
- Custom UI components: `src/components/ui/cyber.tsx` (CyberCard, CyberButton, CyberBadge, Modal, CyberInput)
- Tooltips: `src/components/ui/tooltip.tsx` — CyberTooltip component wrapping Radix UI tooltips with cyberpunk styling, TooltipProvider in App.tsx
- Layout: `src/components/layout.tsx` — sidebar with XRAY branding and nav links
- Localization: All UI text is in Russian with cyberpunk-style naming (e.g., "Сеть_Ядро", "Матрица_Пользователей", "Исходящие_Узлы")
- IP Detection: Dashboard shows client's public IP address, auto-detected via `GET /api/server/client-ip`
- VLESS defaults: Generated VLESS URLs point to happ.su server by default (configurable via OFFICE_IP, OFFICE_SNI env vars)
- Credentials: username from `ADMIN_USERNAME` env var (default: `admin`), password from `ADMIN_PASSWORD` Replit Secret

### API Routes (artifacts/api-server)

- `GET /api/health` — health check
- `POST /api/auth/login` — JWT login
- `POST /api/auth/logout` — logout (invalidate session)
- `GET /api/auth/me` — current user info (requires auth)
- `GET /api/server/client-ip` — client IP detection (no auth required)
- `GET /api/server/status` — simulated server status (requires auth)
- `POST /api/server/restart` — simulated restart (requires auth)
- `GET /api/server/config` — server configuration (requires auth)
- `GET /api/users` — list VPN users (requires auth)
- `POST /api/users` — create user with auto-generated UUID (requires auth)
- `PUT /api/users/:id` — update user (requires auth)
- `DELETE /api/users/:id` — delete user (requires auth)
- `POST /api/users/:id/block` / `POST /api/users/:id/unblock` — block/unblock (requires auth)
- `GET /api/users/:id/qr` — QR code for VLESS URL (requires auth)
- `GET /api/users/:id/vless-url` — VLESS connection URL (requires auth)
- `GET /api/profiles` — list outbound profiles (requires auth)
- `POST /api/profiles` — create profile (VLESS/Shadowsocks/WireGuard) (requires auth)
- `POST /api/profiles/import-url` — import from VLESS URL (requires auth)
- `POST /api/profiles/import-sub` — import from subscription URL with SSRF protection (requires auth)
- `POST /api/profiles/:id/activate` — activate profile (requires auth)
- `GET /api/profiles/:id/ping` — ping profile (requires auth)
- `DELETE /api/profiles/:id` — delete profile (requires auth)
- `POST /api/profiles/auto-select` — auto-select fastest profile (requires auth)
- `GET /api/traffic/stats` — traffic statistics
- `GET /api/speedtest` — speed test
- `GET /api/cluster/servers` — list cluster servers
- `POST /api/cluster/servers` — add server to cluster
- `PUT /api/cluster/servers/:id` — update server
- `DELETE /api/cluster/servers/:id` — delete server
- `GET /api/cluster/servers/:id/ping` — ping server
- `POST /api/cluster/servers/:id/set-primary` — set primary server
- `GET /api/cluster/stats` — cluster statistics
- `GET /api/cluster/nodes` — list cluster peer nodes
- `POST /api/cluster/nodes` — register peer node
- `DELETE /api/cluster/nodes/:id` — remove peer node
- `GET /api/cluster/nodes/:id/ping` — health-check peer node
- `POST /api/cluster/nodes/:id/sync` — trigger sync with specific peer
- `GET /api/cluster/sync/status` — sync status across all peers
- `POST /api/cluster/heartbeat` — receive heartbeat from peer (HMAC-protected)
- `POST /api/cluster/sync/push` — push sync data to peer (HMAC-protected)
- `POST /api/cluster/sync/pull` — pull sync data from peer (HMAC-protected)
- `GET /api/cluster/config` — get cluster configuration
- `PUT /api/cluster/config` — update cluster configuration
- `GET /api/users/:id/multi-vless` — multi-server VLESS URLs with failover
- `GET /api/routing/rules` — list routing rules
- `POST /api/routing/rules` — create routing rule (domain/ip/cidr/regexp, direct/proxy/block)
- `POST /api/routing/rules/batch` — batch import routing rules
- `PUT /api/routing/rules/:id` — update routing rule
- `DELETE /api/routing/rules/:id` — delete routing rule
- `POST /api/routing/rules/:id/toggle` — toggle routing rule on/off
- `DELETE /api/routing/rules/category/:category` — delete all rules in category
- `GET /api/routing/presets` — list available presets
- `POST /api/routing/presets/:presetId/import` — import a preset (ru-direct, streaming-proxy, social-proxy, ads-block, gaming-direct)
- `GET /api/routing/export` — export all rules as JSON
- `GET /api/routing/stats` — routing rules statistics
- `GET /api/monitoring/settings` — monitoring settings and status
- `PUT /api/monitoring/settings` — update monitoring settings (intervalSeconds, pingThresholdMs, autoSwitch)
- `POST /api/monitoring/start` — start background monitoring
- `POST /api/monitoring/stop` — stop background monitoring
- `POST /api/monitoring/check-now` — run immediate check on all profiles
- `GET /api/monitoring/events` — list auto-switch event log
- `GET /api/anti-dpi/settings` — get global Anti-DPI settings (requires auth)
- `PUT /api/anti-dpi/settings` — update Anti-DPI settings (requires auth)
- `POST /api/anti-dpi/transport-fallback/:id` — trigger transport fallback for profile (requires auth)
- `POST /api/anti-dpi/rotate-fingerprint/:id` — manually rotate fingerprint for profile (requires auth)
- `GET /api/anti-dpi/xray-config/:id` — get generated Xray config for profile (requires auth)

### Anti-DPI / Traffic Obfuscation

The system includes Anti-DPI (Deep Packet Inspection) countermeasures:
- **TLS ClientHello Fragmentation**: Configurable fragment length/interval per profile, splits TLS handshake to evade pattern matching
- **Multi-Transport Support**: TCP, WebSocket, gRPC, HTTP/2 — each profile can use different transport types
- **Automatic Transport Fallback**: Background monitor checks connection health every 30s; after 3 failures in 2 minutes, automatically switches to next transport in priority order
- **uTLS Fingerprint Rotation**: Automatic cycling through Chrome/Firefox/Safari/Edge fingerprints on configurable interval (default 6 hours)
- **Xray Config Generation**: Full Xray JSON config generation including fragment outbound, transport-specific streamSettings, and routing rules
- **Audit Logging**: All transport switches and fingerprint rotations are logged to audit_logs table

Key files:
- `artifacts/api-server/src/lib/xray-config.ts` — Xray config builder (streamSettings, fragment outbound)
- `artifacts/api-server/src/lib/anti-dpi-monitor.ts` — Background monitor (fingerprint rotation, transport fallback)
- `artifacts/api-server/src/routes/anti-dpi.ts` — Anti-DPI API routes
- `artifacts/vpn-panel/src/pages/settings.tsx` — Settings page with Anti-DPI UI section (Russian labels)

### Database Schema

- `vpn_users` — id, uuid, name, status, trafficUsed, trafficLimit, expiresAt, createdAt
- `vpn_profiles` — id, name, protocol, address, port, settings, countryFlag, lastPing, lastDownloadSpeed, lastCheckAt, isOnline, isActive, transportType, transportPath, transportHost, fragmentEnabled, fragmentLength, fragmentInterval, fingerprintRotation, fingerprintInterval, fingerprintList, lastFingerprintRotation, transportPriority, createdAt
- `vpn_servers` — id, name, address, port, country, countryFlag, provider, status, lastPing, cpuUsage, memUsage, bandwidthUsed, bandwidthLimit, connectedClients, maxClients, isPrimary, syncUrl, syncSecret, lastSyncAt, syncStatus, createdAt
- `cluster_nodes` — id, nodeId, name, address, port, apiPort, clusterSecretHash, status, latency, lastSeen, lastSyncAt, syncStatus, failCount, createdAt
- `sync_changelog` — id, entityType, entityId, action, data (jsonb), sourceNodeId, timestamp, createdAt
- `routing_rules` — id, ruleType (domain/ip/cidr/regexp), value, action (direct/proxy/block), description, enabled, priority, category, createdAt
- `monitoring_settings` — id, enabled, intervalSeconds, pingThresholdMs, autoSwitch, lastCheckAt
- `switch_event_log` — id, fromProfileId, fromProfileName, toProfileId, toProfileName, reason, pingBefore, pingAfter, createdAt
- `audit_logs` — id, action, details, timestamp

### Distributed Cluster Sync Engine

The system includes a distributed peer-to-peer cluster mesh for multi-node deployments:
- **HMAC-SHA256 Auth**: Inter-node endpoints (heartbeat, sync/push, sync/pull) are protected with HMAC signature verification and timestamp window validation (5-min drift tolerance)
- **Background Sync**: Periodic heartbeat and sync loops with configurable intervals and exponential backoff for failed nodes
- **Last-Write-Wins**: Conflict resolution compares the latest changelog entry timestamp per entity
- **Change Recording**: All user CRUD operations automatically record changes to sync_changelog for propagation
- **Full CRUD Sync**: Users and profiles support create/update/delete replication across nodes
- **Multi-Server VLESS**: Generates failover VLESS URLs from all online servers and peer nodes

Key files:
- `artifacts/api-server/src/services/sync-engine.ts` — Sync engine (HMAC auth, heartbeat, push/pull, conflict resolution)
- `artifacts/api-server/src/routes/cluster.ts` — Cluster routes (servers, nodes, sync, config, multi-VLESS)
- `artifacts/vpn-panel/src/pages/cluster.tsx` — Cluster UI (3-tab: Servers/Nodes/Config)

### Required Environment

**Replit Secrets (required, no defaults — server fails to start without them):**
- `ADMIN_PASSWORD` — password for admin login
- `JWT_SECRET` — secret key for signing JWT tokens

**Shared env vars (in `.replit`):**
- `ADMIN_USERNAME` — admin login username (default: `admin`)
- `DATABASE_URL` — auto-provided by Replit PostgreSQL
- `CLUSTER_NODE_ID` — unique identifier for this cluster node (auto-generated if not set)
- `CLUSTER_NODE_NAME` — display name for this node (default: "Local Node")
- `CLUSTER_SECRET` — shared secret for HMAC authentication between cluster nodes (enables clustering when set)

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

## Raspberry Pi 5 Deployment

The `deploy/` directory contains everything needed for self-hosted deployment on a Raspberry Pi 5 (ARM64) via Docker Compose.

- `pnpm run build:prod` — builds frontend + API and copies production artifacts into `deploy/`
- `deploy/Dockerfile` — multi-stage Docker build (Node 22, builds from monorepo source)
- `deploy/docker-compose.yml` — runs the app (port 3000) + PostgreSQL 16 with persistent volume
- `deploy/.env.example` — template for required environment variables
- `deploy/entrypoint.sh` — applies DB schema via `drizzle-kit push` then starts the server
- `deploy/drizzle.config.ts` — production Drizzle Kit config pointing to `db-schema/`
- `deploy/README.md` — step-by-step deployment guide in Russian

In production mode, the Express API server serves the Vite-built frontend static files from `dist/public/` and handles SPA routing via a catch-all route.

### Release Distribution

The project includes a release build system for distributing the VPN Control Panel as a standalone archive:

- `pnpm run release` — builds a distributable `vpn-panel-<version>-<os>-<arch>.tar.gz` in `release/`
- `install.sh` — one-line installer: `curl -fsSL https://raw.githubusercontent.com/<user>/<repo>/main/install.sh | bash`
- `scripts/build-release.sh` — release build script (builds frontend + API server, packages with runtime deps)
- `scripts/release-assets/` — management scripts included in release (start.sh, stop.sh, status.sh, uninstall.sh)
- `.env.example` — environment variable template
- `INSTALL.md` — installation guide in Russian
- In production mode (`NODE_ENV=production` + `STATIC_DIR` env var), the API server serves the built frontend via `express.static`, so everything runs on a single port
