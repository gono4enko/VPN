# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

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

- Routes: `/` (dashboard), `/users`, `/profiles`, `/cluster`, `/settings`
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

### Database Schema

- `vpn_users` — id, uuid, name, status, trafficUsed, trafficLimit, expiresAt, createdAt
- `vpn_profiles` — id, name, protocol, address, port, settings, countryFlag, lastPing, isActive, createdAt
- `vpn_servers` — id, name, address, port, country, countryFlag, provider, status, lastPing, cpuUsage, memUsage, bandwidthUsed, bandwidthLimit, connectedClients, maxClients, isPrimary, createdAt
- `audit_logs` — id, action, details, timestamp

### Required Environment

**Replit Secrets (required, no defaults — server fails to start without them):**
- `ADMIN_PASSWORD` — password for admin login
- `JWT_SECRET` — secret key for signing JWT tokens

**Shared env vars (in `.replit`):**
- `ADMIN_USERNAME` — admin login username (default: `admin`)
- `DATABASE_URL` — auto-provided by Replit PostgreSQL

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
