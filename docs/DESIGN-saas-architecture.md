# SaaS Architecture Design

Design document for hosted multi-tenant chkd platform.

## Overview

Transform chkd from a local developer tool into a hosted SaaS platform where teams can manage their development workflow without running infrastructure.

## 1. PostgreSQL Migration

### Current Schema (SQLite)

```
repositories    - Project tracking
settings        - Key-value config
sessions        - Active work sessions
bugs            - Bug tracking
quick_wins      - Small improvements
item_durations  - Time tracking
workers         - Multi-worker instances
worker_history  - Completed worker audit trail
manager_signals - Manager-user communication
story_discussions - Pre-flight clarification
discussion_messages - Discussion content
discussion_documents - Uploaded context
search_history  - Search queries
```

### PostgreSQL Schema

```sql
-- ============================================
-- TENANT & USER MANAGEMENT
-- ============================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,                -- 'acme-corp' for URLs
  plan TEXT NOT NULL DEFAULT 'free',        -- free|team|enterprise
  stripe_customer_id TEXT,

  -- Limits
  max_users INTEGER DEFAULT 5,
  max_repos INTEGER DEFAULT 3,
  max_workers INTEGER DEFAULT 2,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,

  -- Auth (OAuth providers)
  github_id TEXT UNIQUE,
  gitlab_id TEXT UNIQUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE tenant_members (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'developer',   -- admin|developer|viewer

  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_user ON tenant_members(user_id);

-- ============================================
-- REPOSITORIES (MULTI-TENANT)
-- ============================================

CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Git info
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,                  -- 'owner/repo'
  provider TEXT NOT NULL,                   -- github|gitlab|bitbucket
  provider_id TEXT NOT NULL,                -- Provider's repo ID
  clone_url TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',

  -- Local (for self-hosted)
  local_path TEXT,                          -- Only for self-hosted

  -- Status
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, provider, provider_id)
);

CREATE INDEX idx_repos_tenant ON repositories(tenant_id);

-- ============================================
-- SESSIONS (MULTI-TENANT)
-- ============================================

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),

  -- Task tracking
  current_task_id TEXT,
  current_task_title TEXT,
  current_item_id TEXT,
  current_item_title TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'idle',      -- idle|working|paused|blocked
  mode TEXT,

  -- Anchor (user's intended focus)
  anchor_task_id TEXT,
  anchor_task_title TEXT,
  anchor_set_at TIMESTAMPTZ,

  -- Timing
  start_time TIMESTAMPTZ,
  last_activity TIMESTAMPTZ,

  -- Context
  also_did JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_repo ON sessions(repo_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ============================================
-- BUGS (MULTI-TENANT)
-- ============================================

CREATE TABLE bugs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),

  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_bugs_repo ON bugs(repo_id);
CREATE INDEX idx_bugs_status ON bugs(repo_id, status);

-- ============================================
-- WORKERS (MULTI-TENANT)
-- ============================================

CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),        -- Who started this worker

  -- Assignment
  task_id TEXT,
  task_title TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  progress INTEGER DEFAULT 0,

  -- Git
  branch_name TEXT,

  -- Cloud worker info (for managed workers)
  cloud_instance_id TEXT,                   -- AWS/GCP instance ID
  cloud_region TEXT,

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,

  next_task_id TEXT,
  next_task_title TEXT
);

CREATE INDEX idx_workers_repo ON workers(repo_id);
CREATE INDEX idx_workers_status ON workers(repo_id, status);
CREATE INDEX idx_workers_heartbeat ON workers(heartbeat_at);

-- ============================================
-- ANALYTICS & METRICS
-- ============================================

CREATE TABLE work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  worker_id UUID REFERENCES workers(id),

  -- What was worked on
  task_id TEXT,
  item_id TEXT,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Outcome
  outcome TEXT,                             -- completed|interrupted|abandoned

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_logs_repo ON work_logs(repo_id);
CREATE INDEX idx_work_logs_user ON work_logs(user_id);
CREATE INDEX idx_work_logs_time ON work_logs(started_at);

-- For velocity calculations
CREATE MATERIALIZED VIEW daily_velocity AS
SELECT
  repo_id,
  DATE(started_at) as work_date,
  COUNT(DISTINCT item_id) as items_completed,
  SUM(duration_ms) / 1000 / 60 as total_minutes
FROM work_logs
WHERE outcome = 'completed'
GROUP BY repo_id, DATE(started_at);

-- ============================================
-- BILLING
-- ============================================

CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,                 -- worker_minute|api_call|storage_gb
  quantity DECIMAL NOT NULL,
  unit_price_cents INTEGER NOT NULL,

  -- Attribution
  repo_id UUID REFERENCES repositories(id),
  user_id UUID REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billed_at TIMESTAMPTZ                     -- When included in invoice
);

CREATE INDEX idx_usage_tenant ON usage_events(tenant_id);
CREATE INDEX idx_usage_billing ON usage_events(tenant_id, billed_at) WHERE billed_at IS NULL;

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stripe_invoice_id TEXT,

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'draft',     -- draft|sent|paid|failed

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
```

### Migration Strategy

1. **Dual-write period**: Write to both SQLite (local) and Postgres (cloud)
2. **Read from Postgres**: Switch reads to Postgres once consistent
3. **Remove SQLite**: Deprecate local storage for cloud users
4. **Keep SQLite**: For self-hosted/offline mode

```typescript
// Database adapter pattern
interface DbAdapter {
  getRepos(): Promise<Repository[]>;
  getSession(repoId: string): Promise<Session | null>;
  // ... etc
}

class SqliteAdapter implements DbAdapter { /* existing code */ }
class PostgresAdapter implements DbAdapter { /* new code */ }

// Factory based on environment
function getDb(): DbAdapter {
  return process.env.DATABASE_URL
    ? new PostgresAdapter()
    : new SqliteAdapter();
}
```

## 2. Multi-Tenant Data Isolation

### Row-Level Security (RLS)

```sql
-- Enable RLS on all tenant tables
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's data
CREATE POLICY tenant_isolation ON repositories
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON sessions
  USING (repo_id IN (
    SELECT id FROM repositories
    WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
  ));
```

### API Middleware

```typescript
// Set tenant context on every request
async function tenantMiddleware(request, context) {
  const tenantId = await getTenantFromSession(request);

  // Set for RLS
  await db.query(`SET app.current_tenant_id = '${tenantId}'`);

  // Also validate in application code (defense in depth)
  context.tenantId = tenantId;
}
```

## 3. Team Workspaces & Roles

### Role Permissions

| Permission | Admin | Developer | Viewer |
|------------|-------|-----------|--------|
| View dashboard | Yes | Yes | Yes |
| View progress | Yes | Yes | Yes |
| Create bugs | Yes | Yes | No |
| Manage workers | Yes | Yes | No |
| Edit spec | Yes | Yes | No |
| Invite members | Yes | No | No |
| Manage billing | Yes | No | No |
| Delete repo | Yes | No | No |

### Implementation

```typescript
const ROLE_PERMISSIONS = {
  admin: ['*'],
  developer: [
    'view:dashboard', 'view:progress', 'view:spec',
    'create:bug', 'edit:bug', 'create:worker', 'edit:spec'
  ],
  viewer: ['view:dashboard', 'view:progress', 'view:spec']
};

function checkPermission(user: User, action: string): boolean {
  const role = user.tenantRole;
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes('*') || perms.includes(action);
}
```

## 4. GitHub/GitLab Integration

### GitHub App

```yaml
# GitHub App Manifest
name: chkd
description: Development workflow tracking
url: https://chkd.dev
setup_url: https://chkd.dev/github/setup
callback_url: https://chkd.dev/auth/github/callback
webhook_url: https://chkd.dev/webhooks/github

permissions:
  contents: write          # Read/write repo files
  pull_requests: write     # Create PRs for workers
  issues: write            # Sync bugs
  metadata: read           # Basic repo info

events:
  - push
  - pull_request
  - issues
```

### Webhook Handlers

```typescript
// On push to main
webhooks.on('push', async (event) => {
  if (event.ref === 'refs/heads/main') {
    // Re-parse SPEC.md, update progress
    await syncSpec(event.repository.id);
  }
});

// On PR merged
webhooks.on('pull_request.closed', async (event) => {
  if (event.pull_request.merged) {
    // Complete worker, update metrics
    await completeWorkerFromPR(event.pull_request);
  }
});
```

## 5. Managed Claude Workers

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    chkd Platform                         │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐ │
│  │  Web Dashboard │  │   API Server  │  │  Worker     │ │
│  │  (SvelteKit)  │  │  (SvelteKit)  │  │  Orchestrator│ │
│  └───────┬───────┘  └───────┬───────┘  └──────┬──────┘ │
│          │                  │                  │        │
└──────────┼──────────────────┼──────────────────┼────────┘
           │                  │                  │
           ▼                  ▼                  ▼
    ┌─────────────────────────────────────────────────────┐
    │               Cloud Infrastructure                   │
    │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐   │
    │  │Worker 1│  │Worker 2│  │Worker 3│  │Worker N│   │
    │  │(Fly.io)│  │(Fly.io)│  │(Fly.io)│  │(Fly.io)│   │
    │  └────────┘  └────────┘  └────────┘  └────────┘   │
    └─────────────────────────────────────────────────────┘
```

### Worker Provisioning

```typescript
interface WorkerConfig {
  image: 'ghcr.io/chkd/worker:latest';
  cpu: '1';
  memory: '2GB';
  region: string;      // Closest to user
  timeout: '30m';      // Max runtime
  env: {
    ANTHROPIC_API_KEY: string;  // User's key or platform key
    REPO_CLONE_URL: string;
    BRANCH_NAME: string;
    TASK_ID: string;
    CALLBACK_URL: string;
  };
}

async function spawnCloudWorker(config: WorkerConfig): Promise<string> {
  // Using Fly.io Machines API
  const machine = await fly.machines.create({
    app: 'chkd-workers',
    config: {
      image: config.image,
      env: config.env,
      services: [],  // No public ports
      auto_destroy: true,
    }
  });

  return machine.id;
}
```

### Worker Lifecycle

1. **Spawn**: Create Fly.io machine with task config
2. **Clone**: Worker clones repo, creates branch
3. **Work**: Claude implements task, reports progress via webhooks
4. **Complete**: Worker creates PR, signals completion
5. **Cleanup**: Machine auto-destroys, PR awaits review

## 6. Usage-Based Billing

### Pricing Model

| Resource | Free Tier | Team | Enterprise |
|----------|-----------|------|------------|
| Users | 1 | 10 | Unlimited |
| Repos | 2 | 10 | Unlimited |
| Worker minutes/mo | 60 | 500 | Custom |
| Overage rate | N/A | $0.10/min | Custom |

### Metering

```typescript
// Track worker usage
async function trackWorkerUsage(workerId: string, minutes: number) {
  const worker = await db.workers.findById(workerId);
  const repo = await db.repos.findById(worker.repoId);

  await db.usageEvents.create({
    tenantId: repo.tenantId,
    eventType: 'worker_minute',
    quantity: minutes,
    unitPriceCents: getPricePerMinute(repo.tenant.plan),
    repoId: repo.id,
    userId: worker.userId
  });
}

// Monthly billing job
async function generateInvoices() {
  const tenants = await db.tenants.findAll({ plan: { not: 'free' } });

  for (const tenant of tenants) {
    const unbilledUsage = await db.usageEvents.findAll({
      tenantId: tenant.id,
      billedAt: null
    });

    const total = unbilledUsage.reduce((sum, e) =>
      sum + (e.quantity * e.unitPriceCents), 0);

    const invoice = await stripe.invoices.create({
      customer: tenant.stripeCustomerId,
      auto_advance: true,
      collection_method: 'charge_automatically',
      metadata: { tenantId: tenant.id }
    });

    // Mark usage as billed
    await db.usageEvents.updateMany({
      where: { id: { in: unbilledUsage.map(u => u.id) } },
      data: { billedAt: new Date() }
    });
  }
}
```

## 7. Analytics Dashboard

### Metrics

- **Velocity**: Items completed per day/week
- **Time tracking**: Hours per task/feature
- **Worker efficiency**: Tasks per worker, time to complete
- **Bug metrics**: Open bugs, time to resolution
- **Team activity**: Who's working on what

### Dashboard Components

```svelte
<!-- Velocity Chart -->
<VelocityChart
  data={dailyVelocity}
  period="week"
/>

<!-- Team Activity -->
<TeamActivity
  sessions={activeSessions}
  workers={activeWorkers}
/>

<!-- Progress Overview -->
<ProgressOverview
  completed={completedItems}
  total={totalItems}
  byArea={progressByArea}
/>

<!-- Bug Burndown -->
<BugBurndown
  bugs={bugs}
  period="month"
/>
```

## Implementation Phases

### Phase 1: Database Foundation
- [ ] PostgreSQL schema implementation
- [ ] Database adapter pattern
- [ ] Migration tooling
- [ ] RLS policies

### Phase 2: Auth & Tenancy
- [ ] User authentication (GitHub OAuth)
- [ ] Tenant creation flow
- [ ] Member invitations
- [ ] Role-based permissions

### Phase 3: Git Integration
- [ ] GitHub App creation
- [ ] Webhook handlers
- [ ] Repo sync service
- [ ] PR automation

### Phase 4: Managed Workers
- [ ] Worker image (Dockerfile)
- [ ] Fly.io integration
- [ ] Progress webhooks
- [ ] Auto-cleanup

### Phase 5: Billing
- [ ] Stripe integration
- [ ] Usage metering
- [ ] Invoice generation
- [ ] Plan management UI

### Phase 6: Analytics
- [ ] Metrics collection
- [ ] Dashboard components
- [ ] Reports export
- [ ] Alerts/notifications
