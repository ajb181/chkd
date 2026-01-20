<script lang="ts">
  import { onMount } from 'svelte';
  import { getSpec, getSession, skipItem as skipItemApi, editItem as editItemApi, deleteItem as deleteItemApi, moveItem as moveItemApi, setPriority as setPriorityApi, getRepos, addRepo, getProposals, getQueue, addToQueue, removeFromQueue, getBugs } from '$lib/api';
  import type { ParsedSpec, SpecArea, SpecItem, Session, ItemStatus, Priority, Repository, QueueItem, Bug } from '$lib/api';
  import FeatureCapture from '$lib/components/FeatureCapture.svelte';

  // Repository management
  let repos: Repository[] = [];
  let currentRepo: Repository | null = null;
  let showAddRepo = false;
  let newRepoPath = '';
  let newRepoName = '';
  let addingRepo = false;
  let addRepoError: string | null = null;

  // Get repoPath from URL or use first available repo
  let repoPath = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('repo') || ''
    : '';

  let spec: ParsedSpec | null = null;
  let session: Session | null = null;
  let loading = true;
  let error: string | null = null;

  // View mode
  type ViewMode = 'areas' | 'todo';
  let viewMode: ViewMode = 'todo';

  // Quick capture (simple)
  let captureInput = '';
  let capturing = false;

  // Smart Feature Capture modal
  let showFeatureCapture = false;
  let featureCaptureInitialTitle = '';

  // Expanded areas
  let expandedAreas: Set<string> = new Set();

  // Selected feature for detail view
  let selectedFeature: { item: SpecItem; area: SpecArea } | null = null;

  // Edit mode
  let editing = false;
  let editTitle = '';
  let editDescription = '';

  // Filter
  let filterText = '';
  let showCompleted = false;

  // Delete confirmation
  let confirmingDelete = false;

  // Proposals for context helper
  let pendingProposals = 0;

  // Queue (user adds while Claude works)
  let queueItems: QueueItem[] = [];
  let queueInput = '';
  let queueExpanded = false;
  let addingToQueue = false;
  let queueInputEl: HTMLInputElement;

  // Bugs
  let bugs: Bug[] = [];
  let bugsExpanded = false;
  let showAllBugs = false;
  let bugInput = '';
  let addingBug = false;

  // Context helper types
  interface ContextHelp {
    state: string;
    stateColor: string;
    action: string;
    commands: { cmd: string; desc: string }[];
  }

  function getContextHelp(session: Session | null, proposals: number): ContextHelp {
    const base: ContextHelp = {
      state: 'IDLE',
      stateColor: 'muted',
      action: 'Pick a task to start',
      commands: []
    };

    if (!session || session.status === 'idle' || !session.currentTask) {
      return {
        ...base,
        commands: [
          { cmd: 'chkd start "1.1"', desc: 'Start a task' },
          { cmd: 'chkd status', desc: 'See what\'s next' }
        ]
      };
    }

    // Check for debug mode first
    if (session.mode === 'debugging') {
      return {
        state: 'DEBUG',
        stateColor: 'error',
        action: session.currentTask?.title || 'Fixing bug',
        commands: [
          { cmd: '/bugfix', desc: 'Research & fix' },
          { cmd: 'chkd progress', desc: 'Check sub-items' },
          { cmd: 'Stay focused', desc: 'Minimal changes only' }
        ]
      };
    }

    switch (session.status) {
      case 'building':
        return {
          state: 'BUILDING',
          stateColor: 'info',
          action: session.currentTask.title,
          commands: [
            { cmd: '/chkd', desc: 'Continue building' },
            { cmd: 'chkd tick "item"', desc: 'Mark sub-item done' }
          ]
        };
      case 'ready_for_testing':
        return {
          state: 'TESTING',
          stateColor: 'warning',
          action: 'Review the changes',
          commands: [
            { cmd: 'Test feature', desc: 'Check it works' },
            { cmd: 'Give feedback', desc: 'Request fixes' }
          ]
        };
      case 'rework':
        return {
          state: 'REWORK',
          stateColor: 'warning',
          action: 'Fixing feedback',
          commands: [
            { cmd: '/chkd', desc: 'Continue fixing' }
          ]
        };
      case 'complete':
        return {
          state: 'COMPLETE',
          stateColor: 'success',
          action: 'Task complete!',
          commands: [
            { cmd: 'chkd done', desc: 'Mark task done' },
            { cmd: 'chkd status', desc: 'See what\'s next' }
          ]
        };
      default:
        return base;
    }
  }

  $: activeSession = demoMode ? demoSession : session;
  $: contextHelp = demoMode && currentDemoState === 'debug'
    ? { state: 'DEBUG', stateColor: 'error', action: 'Fix: Login crash on Safari', commands: [{ cmd: '/bugfix', desc: 'Research & fix' }, { cmd: 'chkd progress', desc: 'Check sub-items' }, { cmd: 'Stay focused', desc: 'Minimal changes only' }] }
    : getContextHelp(activeSession, pendingProposals);

  // Demo mode for session UI development
  let demoMode = false;
  let demoAutoProgress = false;
  let demoStep = 0;
  let demoInterval: ReturnType<typeof setInterval> | null = null;

  // Demo state cycling
  type DemoState = 'idle' | 'building' | 'testing' | 'rework' | 'complete' | 'debug';
  const demoStates: DemoState[] = ['idle', 'building', 'testing', 'rework', 'complete', 'debug'];
  let demoStateIndex = 1; // Start at 'building'
  $: currentDemoState = demoStates[demoStateIndex];

  function cycleDemoState() {
    demoStateIndex = (demoStateIndex + 1) % demoStates.length;
  }

  // Mock checklist items for demo
  const demoChecklist = [
    { id: 1, title: 'Set up route structure', done: true },
    { id: 2, title: 'Create API endpoints', done: true },
    { id: 3, title: 'Implement data fetching', done: false, current: true },
    { id: 4, title: 'Add error handling', done: false },
    { id: 5, title: 'Write unit tests', done: false },
    { id: 6, title: 'Update documentation', done: false },
  ];

  // Demo session data - changes based on current demo state
  $: demoSession = {
    status: currentDemoState === 'debug' ? 'building' : currentDemoState === 'idle' ? 'idle' : currentDemoState,
    currentTask: currentDemoState === 'idle' ? null : { id: 'demo-task', title: currentDemoState === 'debug' ? 'Fix: Login crash on Safari' : 'Session UI Overhaul', phase: 6 },
    currentItem: currentDemoState === 'idle' ? null : { id: `demo-${demoStep}`, title: demoChecklist[Math.min(demoStep, demoChecklist.length - 1)]?.title || 'Complete' },
    startTime: new Date(Date.now() - 23 * 60 * 1000).toISOString(),
    elapsedMs: 23 * 60 * 1000,
    iteration: currentDemoState === 'rework' ? 2 : 1,
    lastActivity: new Date().toISOString()
  } as Session;

  $: demoProgress = demoChecklist.map((item, i) => ({
    ...item,
    done: i < demoStep,
    current: i === demoStep
  }));

  // Demo "also did" list
  const demoAlsoDid = [
    'Fixed typo in header component',
    'Updated error message styling',
  ];

  function toggleDemoMode() {
    demoMode = !demoMode;
    if (!demoMode && demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
      demoAutoProgress = false;
    }
    demoStep = 2; // Start partway through
  }

  function toggleDemoAutoProgress() {
    demoAutoProgress = !demoAutoProgress;
    if (demoAutoProgress) {
      demoInterval = setInterval(() => {
        if (demoStep < demoChecklist.length) {
          demoStep++;
        } else {
          demoStep = 0; // Loop
        }
      }, 2000);
    } else if (demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
    }
  }

  function demoNextStep() {
    if (demoStep < demoChecklist.length) {
      demoStep++;
    } else {
      demoStep = 0;
    }
  }

  function formatElapsed(ms: number): string {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }

  onMount(() => {
    let interval: ReturnType<typeof setInterval>;

    // Load repos first, then set up polling
    (async () => {
      await loadRepos();
      await loadData();
    })();

    // Poll for updates every 2 seconds when building
    interval = setInterval(async () => {
      if (session?.status === 'building') {
        await loadData();
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      if (demoInterval) clearInterval(demoInterval);
    };
  });

  async function loadRepos() {
    const res = await getRepos();
    if (res.success && res.data) {
      repos = res.data;
      // Set current repo from URL param or first repo or default path
      const urlRepo = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('repo')
        : null;

      if (urlRepo) {
        repoPath = urlRepo;
        currentRepo = repos.find(r => r.path === urlRepo) || null;
      } else if (repos.length > 0) {
        currentRepo = repos[0];
        repoPath = currentRepo.path;
      } else {
        // Default fallback
        repoPath = '/Users/alex/chkd-v2';
      }
    }
  }

  async function handleAddRepo() {
    if (!newRepoPath.trim()) return;
    addingRepo = true;
    addRepoError = null;

    const res = await addRepo(newRepoPath.trim(), newRepoName.trim() || undefined);

    if (res.success && res.data) {
      repos = [...repos, res.data];
      currentRepo = res.data;
      repoPath = res.data.path;
      showAddRepo = false;
      newRepoPath = '';
      newRepoName = '';
      await loadData();
    } else {
      addRepoError = res.error || 'Failed to add repository';
    }

    addingRepo = false;
  }

  function selectRepo(repo: Repository) {
    currentRepo = repo;
    repoPath = repo.path;
    // Update URL
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('repo', repo.path);
      window.history.pushState({}, '', url.toString());
    }
    loadData();
  }

  async function loadData() {
    if (!repoPath) return;
    try {
      const [specRes, sessionRes, proposalsRes, queueRes, bugsRes] = await Promise.all([
        getSpec(repoPath),
        getSession(repoPath),
        getProposals(repoPath),
        getQueue(repoPath),
        getBugs(repoPath)
      ]);

      if (proposalsRes.success) {
        pendingProposals = proposalsRes.data?.pending || 0;
      }

      if (queueRes.success && queueRes.data) {
        queueItems = queueRes.data.items || [];
      }

      if (bugsRes.success && bugsRes.data) {
        bugs = bugsRes.data;
      }

      if (specRes.success && specRes.data) {
        spec = specRes.data;
        // Auto-expand areas with in-progress items
        for (const area of spec.areas) {
          if (area.status === 'in-progress') {
            expandedAreas.add(area.code);
          }
        }
        expandedAreas = expandedAreas;
      } else {
        error = specRes.error || 'Failed to load spec';
      }

      if (sessionRes.success) {
        session = sessionRes.data || null;
      }
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  // Queue handlers
  async function handleAddToQueue() {
    if (!queueInput.trim() || !repoPath) return;
    addingToQueue = true;
    const res = await addToQueue(repoPath, queueInput.trim());
    if (res.success && res.data?.item) {
      queueItems = [...queueItems, res.data.item];
      queueInput = '';
    }
    addingToQueue = false;
    // Keep focus on input for rapid entry
    queueInputEl?.focus();
  }

  async function handleRemoveFromQueue(itemId: string) {
    if (!repoPath) return;
    const res = await removeFromQueue(repoPath, itemId);
    if (res.success) {
      queueItems = queueItems.filter(q => q.id !== itemId);
    }
  }

  async function handleQuickCapture() {
    if (!captureInput.trim()) return;
    // Open the smart capture modal with the title pre-filled
    featureCaptureInitialTitle = captureInput.trim();
    captureInput = '';
    showFeatureCapture = true;
  }

  async function handleAddBug() {
    if (!bugInput.trim() || !repoPath || addingBug) return;
    addingBug = true;
    try {
      const res = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, title: bugInput.trim(), severity: 'medium' })
      });
      const data = await res.json();
      if (data.success) {
        bugInput = '';
        // Refresh bugs
        const bugsRes = await getBugs(repoPath);
        if (bugsRes.success && bugsRes.data) {
          bugs = bugsRes.data;
        }
        bugsExpanded = true;
      }
    } finally {
      addingBug = false;
    }
  }

  // Smart Feature Capture functions
  function openFeatureCapture() {
    featureCaptureInitialTitle = '';
    showFeatureCapture = true;
  }

  function closeFeatureCapture() {
    showFeatureCapture = false;
    featureCaptureInitialTitle = '';
  }

  async function handleFeatureAdded() {
    closeFeatureCapture();
    await loadData();
  }

  function toggleArea(code: string) {
    if (expandedAreas.has(code)) {
      expandedAreas.delete(code);
    } else {
      expandedAreas.add(code);
    }
    expandedAreas = expandedAreas;
  }

  function selectFeature(item: SpecItem, area: SpecArea) {
    selectedFeature = { item, area };
    editing = false;
    confirmingDelete = false;
  }

  function closeDetail() {
    selectedFeature = null;
    editing = false;
    confirmingDelete = false;
  }

  async function handleSkip(item: SpecItem) {
    const newSkipped = item.status !== 'skipped';
    await skipItemApi(repoPath, item.id, newSkipped);
    await loadData();
  }

  function startEdit() {
    if (!selectedFeature) return;
    editTitle = selectedFeature.item.title;
    editDescription = selectedFeature.item.description;
    editing = true;
  }

  async function saveEdit() {
    if (!selectedFeature) return;
    await editItemApi(repoPath, selectedFeature.item.id, editTitle, editDescription);
    editing = false;
    await loadData();
    // Update selected feature after reload
    if (spec) {
      for (const area of spec.areas) {
        const found = findInItems(area.items, selectedFeature.item.id);
        if (found) {
          selectedFeature = { item: found, area };
          break;
        }
      }
    }
  }

  function findInItems(items: SpecItem[], id: string): SpecItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      const found = findInItems(item.children, id);
      if (found) return found;
    }
    return null;
  }

  async function handleDelete() {
    if (!selectedFeature) return;
    await deleteItemApi(repoPath, selectedFeature.item.id);
    selectedFeature = null;
    confirmingDelete = false;
    await loadData();
  }

  async function handleMove(targetAreaCode: string) {
    if (!selectedFeature) return;
    await moveItemApi(repoPath, selectedFeature.item.id, targetAreaCode);
    await loadData();
  }

  async function handleSetPriority(priority: Priority) {
    if (!selectedFeature) return;
    await setPriorityApi(repoPath, selectedFeature.item.id, priority);
    await loadData();
    // Update selected feature after reload
    if (spec) {
      for (const area of spec.areas) {
        const found = findInItems(area.items, selectedFeature.item.id);
        if (found) {
          selectedFeature = { item: found, area };
          break;
        }
      }
    }
  }

  function getStatusIcon(status: ItemStatus): string {
    switch (status) {
      case 'done': return '✓';
      case 'in-progress': return '◐';
      case 'skipped': return '–';
      default: return '○';
    }
  }

  function getStatusClass(status: ItemStatus): string {
    switch (status) {
      case 'done': return 'status-done';
      case 'in-progress': return 'status-progress';
      case 'skipped': return 'status-skipped';
      default: return 'status-open';
    }
  }

  function countItems(items: SpecItem[]): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const item of items) {
      if (item.status !== 'skipped') {
        total++;
        if (item.status === 'done') done++;
      }
      const childCounts = countItems(item.children);
      done += childCounts.done;
      total += childCounts.total;
    }
    return { done, total };
  }

  function filterItems(items: SpecItem[]): SpecItem[] {
    if (!filterText && showCompleted) return items;
    return items.filter(item => {
      const matchesText = !filterText ||
        item.title.toLowerCase().includes(filterText.toLowerCase()) ||
        item.description.toLowerCase().includes(filterText.toLowerCase());
      const matchesCompleted = showCompleted || item.status !== 'done';
      return matchesText && matchesCompleted;
    });
  }

  // Priority labels for headers
  const PRIORITY_LABELS: Record<string, string> = {
    '1': 'High Priority',
    '2': 'Medium Priority',
    '3': 'Low Priority',
    'backlog': 'Backlog'
  };

  // Get items grouped by priority
  type TodoGroup = { priority: string; label: string; items: { item: SpecItem; area: SpecArea }[] };

  function getGroupedTodos(): TodoGroup[] {
    if (!spec) return [];

    const groups: Record<string, { item: SpecItem; area: SpecArea }[]> = {
      '1': [],
      '2': [],
      '3': [],
      'backlog': []
    };

    for (const area of spec.areas) {
      for (const item of area.items) {
        // Include all non-done items (including skipped)
        if (item.status !== 'done') {
          const key = item.priority ? String(item.priority) : 'backlog';
          groups[key].push({ item, area });
        }
      }
    }

    // Return non-empty groups in order
    return ['1', '2', '3', 'backlog']
      .filter(key => groups[key].length > 0)
      .map(key => ({
        priority: key,
        label: PRIORITY_LABELS[key],
        items: groups[key]
      }));
  }

  // Get child item stats
  function getItemStats(item: SpecItem): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const child of item.children) {
      if (child.status !== 'skipped') {
        total++;
        if (child.status === 'done') done++;
      }
    }
    return { done, total };
  }

  // Get context text (story or description)
  function getContextText(item: SpecItem, area: SpecArea): string {
    if (item.description) return item.description;
    if (area.story) return area.story;
    return '';
  }

  $: filteredAreas = spec?.areas.filter(a => a.items.length > 0) || [];

  // Get current task's checklist from spec (inline for reactivity)
  $: realChecklist = (() => {
    if (!spec || !session?.currentTask?.id) return [];
    for (const area of spec.areas) {
      for (const item of area.items) {
        if (item.id === session.currentTask.id) {
          return item.children.map(child => ({
            id: child.id,
            title: child.title,
            done: child.status === 'done',
            current: session?.currentItem?.id === child.id
          }));
        }
      }
    }
    return [];
  })();
  // Explicitly depend on spec so Svelte tracks the reactivity
  $: groupedTodos = spec ? getGroupedTodos() : [];
</script>

<div class="app" class:has-detail={selectedFeature}>
  <!-- Header with Repo Selector and Quick Capture -->
  <header class="capture-bar">
    <div class="header-left">
      <!-- Repo Selector -->
      <div class="repo-selector">
        <select
          class="repo-select"
          value={currentRepo?.id || ''}
          on:change={(e) => {
            const repo = repos.find(r => r.id === e.currentTarget.value);
            if (repo) selectRepo(repo);
          }}
        >
          {#each repos as repo}
            <option value={repo.id}>{repo.name}</option>
          {/each}
          {#if repos.length === 0}
            <option value="">No repos</option>
          {/if}
        </select>
        <button class="btn-add-repo" on:click={() => showAddRepo = true} title="Add Repository">
          +
        </button>
      </div>
      <a href="/guide{currentRepo ? `?repo=${encodeURIComponent(currentRepo.path)}` : ''}" class="nav-link">Guide</a>
      <a href="/settings" class="nav-link">Settings</a>
    </div>

    <form on:submit|preventDefault={handleQuickCapture} class="capture-form">
      <input
        type="text"
        bind:value={captureInput}
        placeholder="Quick capture: type a feature idea and press Enter"
        disabled={capturing}
        class="capture-input"
      />
      <button type="submit" disabled={capturing || !captureInput.trim()} class="btn-capture" title="Add feature">
        {capturing ? '...' : '+'}
      </button>
    </form>
    <button class="btn-expand-capture" on:click={openFeatureCapture} title="Detailed capture with area selection">
      ▾
    </button>
  </header>

  <!-- Add Repo Modal -->
  {#if showAddRepo}
    <div class="modal-overlay" on:click={() => showAddRepo = false}>
      <div class="modal" on:click|stopPropagation>
        <h2>Add Repository</h2>
        <form on:submit|preventDefault={handleAddRepo}>
          <div class="form-group">
            <label for="repo-path">Repository Path</label>
            <input
              id="repo-path"
              type="text"
              bind:value={newRepoPath}
              placeholder="/path/to/your/project"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label for="repo-name">Name (optional)</label>
            <input
              id="repo-name"
              type="text"
              bind:value={newRepoName}
              placeholder="My Project"
              class="form-input"
            />
          </div>
          {#if addRepoError}
            <div class="form-error">{addRepoError}</div>
          {/if}
          <div class="modal-actions">
            <button type="button" class="btn-secondary" on:click={() => showAddRepo = false}>
              Cancel
            </button>
            <button type="submit" class="btn-primary" disabled={addingRepo || !newRepoPath.trim()}>
              {addingRepo ? 'Adding...' : 'Add Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Feature Capture Modal -->
  {#if showFeatureCapture}
    <FeatureCapture
      {repoPath}
      {spec}
      initialTitle={featureCaptureInitialTitle}
      on:close={closeFeatureCapture}
      on:added={handleFeatureAdded}
    />
  {/if}

  <main>
    <!-- Context Helper Bar - only show when NOT building (session card handles that) -->
    {#if !loading && session && session.status !== 'building'}
      <div class="context-bar" class:testing={contextHelp.state === 'TESTING'} class:complete={contextHelp.state === 'COMPLETE'} class:rework={contextHelp.state === 'REWORK'} class:debug={contextHelp.state === 'DEBUG'}>
        <span class="ctx-badge {contextHelp.stateColor}">{contextHelp.state}</span>
        <span class="ctx-action">{contextHelp.action}</span>
        <div class="ctx-commands">
          {#each contextHelp.commands as cmd}
            <span class="ctx-cmd"><code>{cmd.cmd}</code> {cmd.desc}</span>
          {/each}
        </div>
        {#if pendingProposals > 0}
          <span class="ctx-warning">⚠️ {pendingProposals} proposal(s)</span>
        {/if}
      </div>
    {/if}

    {#if loading}
      <div class="loading">Loading...</div>
    {:else if error}
      <div class="error">{error}</div>
    {:else if spec}
      <!-- Simple How-To Guide (show when no active task) -->
      {#if !session || session.status === 'idle' || !session.currentTask}
        <div class="how-to-guide">
          <h2>How to Use chkd</h2>
          <div class="steps">
            <div class="step">
              <span class="step-num">1</span>
              <div class="step-content">
                <strong>Add a task</strong>
                <p>Type in the box above and hit + (or click ▾ for detailed capture)</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <div class="step-content">
                <strong>Pick a task</strong>
                <p>Click any task below to select it</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">3</span>
              <div class="step-content">
                <strong>Tell Claude to build it</strong>
                <p>In your terminal, just say: <code>"build [task name]"</code></p>
              </div>
            </div>
          </div>
          <p class="guide-note">That's it. Claude reads the spec, builds the feature, you review.</p>
        </div>
      {/if}

      <!-- Session Status Card -->
      {#if demoMode || (session && session.status === 'building' && session.currentTask)}
        {@const activeSession = demoMode ? demoSession : session}
        {@const checklist = demoMode ? demoProgress : []}
        <div class="session-card" class:demo={demoMode}>
          <div class="session-header">
            <div class="session-left">
              <span class="session-badge">BUILDING</span>
              <span class="session-task">{activeSession?.currentTask?.title}</span>
            </div>
            <div class="session-right">
              <span class="session-time">{formatElapsed(activeSession?.elapsedMs || 0)}</span>
              {#if demoMode}
                <button class="demo-state-btn" on:click={cycleDemoState}>{currentDemoState.toUpperCase()}</button>
                <button class="demo-toggle" on:click={toggleDemoMode}>Exit Demo</button>
              {/if}
            </div>
          </div>

          <!-- Quick commands -->
          {#if !demoMode}
            <div class="session-commands">
              <code>/chkd</code> <span>continue</span>
              <code>chkd check "idea"</code> <span>validate off-plan</span>
            </div>
          {/if}

          <!-- Current Item -->
          {#if activeSession?.currentItem}
            <div class="session-current">
              <span class="current-icon">▸</span>
              <span class="current-item">{activeSession.currentItem.title}</span>
            </div>
          {/if}

          <!-- Also Did List -->
          {#if (activeSession?.alsoDid && activeSession.alsoDid.length > 0) || (demoMode && demoAlsoDid.length > 0)}
            {@const items = demoMode ? demoAlsoDid : (activeSession?.alsoDid || [])}
            <div class="also-did">
              <span class="also-did-label">Also did:</span>
              <ul class="also-did-list">
                {#each items as item}
                  <li>{item}</li>
                {/each}
              </ul>
            </div>
          {/if}

          <!-- Queue List (expandable) -->
          <div class="queue-section">
            <button class="queue-toggle" on:click={() => queueExpanded = !queueExpanded}>
              <span class="queue-icon">{queueExpanded ? '▾' : '▸'}</span>
              <span>Queue</span>
              {#if queueItems.length > 0}
                <span class="queue-badge">{queueItems.length}</span>
              {/if}
            </button>

            {#if queueExpanded}
              <div class="queue-content">
                {#if queueItems.length > 0}
                  <ul class="queue-list">
                    {#each queueItems as item}
                      <li class="queue-item">
                        <span class="queue-item-title">{item.title}</span>
                        <button class="queue-item-remove" on:click={() => handleRemoveFromQueue(item.id)} title="Remove">×</button>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <form class="queue-form" on:submit|preventDefault={handleAddToQueue}>
                  <input
                    type="text"
                    bind:value={queueInput}
                    bind:this={queueInputEl}
                    placeholder="Add to queue..."
                    disabled={addingToQueue}
                  />
                  <button type="submit" disabled={addingToQueue || !queueInput.trim()}>+</button>
                </form>
                <p class="queue-hint">Items surface to Claude on next tick</p>
              </div>
            {/if}
          </div>

          <!-- Checklist Progress -->
          {#if demoMode}
            {#if checklist.length > 0}
              <div class="session-checklist">
                {#each checklist as item}
                  <div class="checklist-item" class:done={item.done} class:current={item.current}>
                    <span class="check-icon">
                      {#if item.done}✓{:else if item.current}◐{:else}○{/if}
                    </span>
                    <span class="check-title">{item.title}</span>
                  </div>
                {/each}
              </div>
              <!-- Demo Controls -->
              <div class="demo-controls">
                <label class="auto-toggle">
                  <input type="checkbox" checked={demoAutoProgress} on:change={toggleDemoAutoProgress} />
                  Auto-progress
                </label>
                <button class="demo-next" on:click={demoNextStep}>Next →</button>
              </div>
            {/if}
          {:else if realChecklist.length > 0}
            <div class="session-checklist">
              {#each realChecklist as item}
                <div class="checklist-item" class:done={item.done} class:current={item.current}>
                  <span class="check-icon">
                    {#if item.done}✓{:else if item.current}◐{:else}○{/if}
                  </span>
                  <span class="check-title">{item.title}</span>
                </div>
              {/each}
            </div>
            <!-- Progress summary -->
            <div class="session-progress-summary">
              <span class="progress-label">{realChecklist.filter(i => i.done).length} / {realChecklist.length} complete</span>
            </div>
          {:else}
            <!-- No sub-items, show simple status -->
            <div class="session-progress-summary">
              <span class="progress-label">Working on task...</span>
            </div>
          {/if}
        </div>
      {:else}
        <!-- Demo Mode Toggle (when no active session) -->
        <button class="demo-start" on:click={toggleDemoMode}>
          🎨 Preview Session UI (Demo Mode)
        </button>
      {/if}

      <!-- Bug Tracker Panel -->
      {@const openBugs = bugs.filter(b => b.status === 'open' || b.status === 'in_progress')}
      {@const fixedBugs = bugs.filter(b => b.status === 'fixed' || b.status === 'wont_fix')}
      {@const displayBugs = showAllBugs ? bugs : openBugs}
      <div class="bug-panel" class:has-critical={openBugs.some(b => b.severity === 'critical')}>
        <button class="bug-header" on:click={() => bugsExpanded = !bugsExpanded}>
          <span class="bug-icon">{bugsExpanded ? '▾' : '▸'}</span>
          <span class="bug-title">🐛 Bugs</span>
          {#if openBugs.length > 0}
            <span class="bug-count" class:critical={openBugs.some(b => b.severity === 'critical' || b.severity === 'high')}>
              {openBugs.length} open
            </span>
          {:else}
            <span class="bug-count done">All clear!</span>
          {/if}
        </button>

        {#if bugsExpanded}
          <div class="bug-content">
            <!-- Quick bug input -->
            <form class="bug-input-form" on:submit|preventDefault={handleAddBug}>
              <input
                type="text"
                class="bug-input"
                placeholder="Quick add bug..."
                bind:value={bugInput}
                disabled={addingBug}
              />
              <button type="submit" class="bug-add-btn" disabled={!bugInput.trim() || addingBug}>
                {addingBug ? '...' : '+'}
              </button>
            </form>

            {#if bugs.length > 0}
              <div class="bug-filters">
                <label class="bug-filter-toggle">
                  <input type="checkbox" bind:checked={showAllBugs} />
                  Show fixed ({fixedBugs.length})
                </label>
              </div>
            {/if}

            {#if displayBugs.length === 0}
              <p class="bug-empty">{bugs.length === 0 ? 'No bugs yet' : 'No open bugs'}</p>
            {:else}
              <ul class="bug-list">
                {#each displayBugs as bug}
                  <li class="bug-item" class:fixed={bug.status === 'fixed' || bug.status === 'wont_fix'}>
                    <span class="bug-severity {bug.severity}" title={bug.severity}>
                      {bug.severity === 'critical' ? '🔴' : bug.severity === 'high' ? '🟠' : bug.severity === 'medium' ? '🟡' : '🟢'}
                    </span>
                    <span class="bug-item-title">{bug.title}</span>
                    {#if bug.status === 'fixed'}
                      <span class="bug-status-badge fixed">✓ Fixed</span>
                    {:else if bug.status === 'in_progress'}
                      <span class="bug-status-badge progress">◐ In Progress</span>
                    {:else if bug.status === 'wont_fix'}
                      <span class="bug-status-badge wontfix">– Won't Fix</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}

            <div class="bug-actions">
              <code>/bugfix</code> <span>fix in Claude</span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Progress Summary + View Toggle -->
      <div class="top-bar">
        <div class="progress-summary">
          <div class="progress-text">
            <strong>{spec.completedItems}</strong> / {spec.totalItems} items
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: {spec.progress}%"></div>
            <span class="progress-percent">{spec.progress}%</span>
          </div>
        </div>

        <div class="view-toggle">
          <button
            class="toggle-btn"
            class:active={viewMode === 'todo'}
            on:click={() => viewMode = 'todo'}
          >
            Todo List
          </button>
          <button
            class="toggle-btn"
            class:active={viewMode === 'areas'}
            on:click={() => viewMode = 'areas'}
          >
            By Area
          </button>
        </div>
      </div>

      <!-- Filter -->
      <div class="filter-bar">
        <input
          type="text"
          bind:value={filterText}
          placeholder="Search features..."
          class="filter-input"
        />
        <label class="filter-toggle">
          <input type="checkbox" bind:checked={showCompleted} />
          Show completed
        </label>
      </div>

      <!-- Todo List View -->
      {#if viewMode === 'todo'}
        <div class="todo-list">
          {#if groupedTodos.length === 0}
            <div class="empty-state">
              All done! 🎉
            </div>
          {:else}
            {#each groupedTodos as group}
              {@const filteredItems = filterText
                ? group.items.filter(({ item }) => item.title.toLowerCase().includes(filterText.toLowerCase()))
                : group.items}
              {#if filteredItems.length > 0}
                <div class="priority-group">
                  <h3 class="priority-header priority-{group.priority}">{group.label}</h3>
                  {#each filteredItems as { item, area }}
                    {@const stats = getItemStats(item)}
                    {@const context = getContextText(item, area)}
                    <div class="todo-item {getStatusClass(item.status)}" class:selected={selectedFeature?.item.id === item.id}>
                      <button class="todo-row" on:click={() => selectFeature(item, area)}>
                        <span class="todo-status">{getStatusIcon(item.status)}</span>
                        <div class="todo-content">
                          <div class="todo-title-row">
                            <span class="todo-title">{item.title}</span>
                            <span class="todo-area">{area.code}</span>
                          </div>
                          {#if context}
                            <div class="todo-context">{context.length > 80 ? context.slice(0, 80) + '...' : context}</div>
                          {/if}
                          {#if stats.total > 0}
                            <div class="todo-progress">
                              <div class="mini-progress-bar">
                                <div class="mini-progress-fill" style="width: {(stats.done / stats.total) * 100}%"></div>
                              </div>
                              <span class="todo-stats">{stats.done}/{stats.total}</span>
                            </div>
                          {/if}
                        </div>
                      </button>
                      <button
                        class="todo-skip"
                        on:click|stopPropagation={() => handleSkip(item)}
                        title={item.status === 'skipped' ? 'Unskip' : 'Skip'}
                      >
                        {item.status === 'skipped' ? '↩' : '–'}
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      {/if}

      <!-- Areas View -->
      {#if viewMode === 'areas'}
        <div class="areas">
          {#each filteredAreas as area}
            {@const counts = countItems(area.items)}
            {@const filtered = filterItems(area.items)}
            {#if filtered.length > 0 || !filterText}
              <div class="area" class:expanded={expandedAreas.has(area.code)}>
                <button class="area-header" on:click={() => toggleArea(area.code)}>
                  <span class="area-toggle">{expandedAreas.has(area.code) ? '▼' : '▶'}</span>
                  <span class="area-name">{area.name}</span>
                  <span class="area-count">{counts.done}/{counts.total}</span>
                  {#if area.status === 'complete'}
                    <span class="area-status complete">✓</span>
                  {:else if area.status === 'in-progress'}
                    <span class="area-status progress">◐</span>
                  {/if}
                </button>

                {#if expandedAreas.has(area.code)}
                  <div class="area-content">
                    {#if area.story}
                      <blockquote class="area-story">{area.story}</blockquote>
                    {/if}

                    <ul class="items">
                      {#each filtered as item}
                        <li class="item {getStatusClass(item.status)}">
                          <button class="item-row" on:click={() => selectFeature(item, area)}>
                            <span class="item-status">{getStatusIcon(item.status)}</span>
                            <span class="item-title">{item.title}</span>
                            {#if item.children.length > 0}
                              {@const childCounts = countItems(item.children)}
                              <span class="item-progress">{childCounts.done}/{childCounts.total}</span>
                            {/if}
                          </button>
                          {#if item.status !== 'done'}
                            <button
                              class="item-skip"
                              on:click|stopPropagation={() => handleSkip(item)}
                              title={item.status === 'skipped' ? 'Unskip' : 'Skip'}
                            >
                              {item.status === 'skipped' ? '↩' : '–'}
                            </button>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    {/if}
  </main>

  <!-- Feature Detail Sidebar -->
  {#if selectedFeature}
    <aside class="detail-panel">
      <div class="detail-header">
        {#if editing}
          <input
            type="text"
            bind:value={editTitle}
            class="edit-title"
            placeholder="Feature title"
          />
        {:else}
          <h2>{selectedFeature.item.title}</h2>
        {/if}
        <button class="close-btn" on:click={closeDetail}>×</button>
      </div>

      {#if editing}
        <textarea
          bind:value={editDescription}
          class="edit-desc"
          placeholder="Description (optional)"
          rows="3"
        ></textarea>
        <div class="edit-actions">
          <button class="btn btn-primary" on:click={saveEdit}>Save</button>
          <button class="btn btn-ghost" on:click={() => editing = false}>Cancel</button>
        </div>
      {:else}
        {#if selectedFeature.item.description}
          <p class="detail-desc">{selectedFeature.item.description}</p>
        {/if}

        <!-- User story if area has one -->
        {#if selectedFeature.area.story}
          <div class="detail-story">
            <h3>User Story</h3>
            <blockquote>{selectedFeature.area.story}</blockquote>
          </div>
        {/if}

        {#if selectedFeature.item.children.length > 0}
          <h3>Checklist</h3>
          <ul class="detail-checklist">
            {#each selectedFeature.item.children as child}
              <li class="{getStatusClass(child.status)}">
                <span class="item-status">{getStatusIcon(child.status)}</span>
                <span>{child.title}</span>
              </li>
            {/each}
          </ul>
        {/if}

        <div class="detail-meta">
          <span class="meta-area">{selectedFeature.area.name}</span>
          <span class="meta-status {getStatusClass(selectedFeature.item.status)}">
            {selectedFeature.item.status}
          </span>
        </div>

        <!-- Action buttons -->
        <div class="detail-actions">
          <button class="btn btn-secondary" on:click={startEdit}>Edit</button>
          <button class="btn btn-secondary" on:click={() => handleSkip(selectedFeature!.item)}>
            {selectedFeature.item.status === 'skipped' ? 'Unskip' : 'Skip'}
          </button>
          {#if !confirmingDelete}
            <button class="btn btn-danger-ghost" on:click={() => confirmingDelete = true}>Delete</button>
          {:else}
            <button class="btn btn-danger" on:click={handleDelete}>Confirm Delete</button>
            <button class="btn btn-ghost" on:click={() => confirmingDelete = false}>Cancel</button>
          {/if}
        </div>

        <!-- Priority -->
        <div class="priority-section">
          <h3>Priority</h3>
          <div class="priority-options">
            <button
              class="priority-btn p1"
              class:selected={selectedFeature.item.priority === 1}
              on:click={() => handleSetPriority(1)}
            >
              P1 High
            </button>
            <button
              class="priority-btn p2"
              class:selected={selectedFeature.item.priority === 2}
              on:click={() => handleSetPriority(2)}
            >
              P2 Med
            </button>
            <button
              class="priority-btn p3"
              class:selected={selectedFeature.item.priority === 3}
              on:click={() => handleSetPriority(3)}
            >
              P3 Low
            </button>
            <button
              class="priority-btn backlog"
              class:selected={selectedFeature.item.priority === null}
              on:click={() => handleSetPriority(null)}
            >
              Backlog
            </button>
          </div>
        </div>

        <!-- Move to area -->
        {#if spec && spec.areas.length > 1}
          <div class="move-section">
            <h3>Move to Area</h3>
            <div class="move-options">
              {#each spec.areas as area}
                {#if area.code !== selectedFeature.area.code}
                  <button class="move-btn" on:click={() => handleMove(area.code)}>
                    {area.name}
                  </button>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </aside>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app.has-detail main {
    margin-right: 420px;
  }

  /* Capture Bar */
  .capture-bar {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    padding: var(--space-md) var(--space-xl);
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .header-left {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .nav-link {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 14px;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
  }

  .nav-link:hover {
    color: var(--text);
    background: var(--surface-hover);
  }

  /* Repo Selector */
  .repo-selector {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .repo-select {
    padding: var(--space-sm) var(--space-md);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
    min-width: 150px;
  }

  .repo-select:focus {
    border-color: var(--primary);
    outline: none;
  }

  .btn-add-repo {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-add-repo:hover {
    background: var(--bg);
    border-color: var(--primary);
    color: var(--primary);
  }

  /* Context Helper Bar */
  .context-bar {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    padding: var(--space-sm) var(--space-xl);
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-size: 13px;
  }

  .context-bar.building { border-left: 3px solid var(--info); }
  .context-bar.testing { border-left: 3px solid var(--warning); }
  .context-bar.complete { border-left: 3px solid var(--success); }
  .context-bar.rework { border-left: 3px solid var(--warning); }
  .context-bar.debug { border-left: 3px solid var(--error); }

  .ctx-badge {
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .ctx-badge.muted { background: var(--bg-tertiary); color: var(--text-muted); }
  .ctx-badge.info { background: var(--info); color: white; }
  .ctx-badge.warning { background: var(--warning); color: #333; }
  .ctx-badge.error { background: var(--error); color: white; }
  .ctx-badge.success { background: var(--success); color: white; }

  .ctx-action {
    color: var(--text);
    font-weight: 500;
  }

  .ctx-commands {
    display: flex;
    gap: var(--space-md);
    margin-left: auto;
  }

  .ctx-cmd {
    color: var(--text-muted);
  }

  .ctx-cmd code {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    margin-right: 4px;
  }

  .ctx-warning {
    color: var(--warning);
    font-weight: 500;
  }

  .capture-form {
    display: flex;
    gap: var(--space-sm);
    flex: 1;
    max-width: 600px;
  }

  .capture-input {
    flex: 1;
    padding: var(--space-md);
    font-size: 16px;
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg);
  }

  .capture-input:focus {
    border-color: var(--primary);
    outline: none;
  }

  .btn-capture {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    background: var(--primary);
    color: white;
    font-size: 24px;
    font-weight: 700;
    border: none;
    cursor: pointer;
  }

  .btn-capture:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn-capture:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-expand-capture {
    width: 36px;
    height: 48px;
    border-radius: var(--radius-lg);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-expand-capture:hover {
    background: var(--bg);
    border-color: var(--primary);
    color: var(--primary);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--bg);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    width: 100%;
    max-width: 480px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  .modal h2 {
    margin: 0 0 var(--space-lg);
    font-size: 20px;
  }


  .form-group {
    margin-bottom: var(--space-md);
  }

  .form-group label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: var(--space-xs);
    color: var(--text-muted);
  }

  .form-input {
    width: 100%;
    padding: var(--space-md);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
  }

  .form-input:focus {
    border-color: var(--primary);
    outline: none;
  }

  .form-error {
    color: var(--error);
    font-size: 13px;
    margin-bottom: var(--space-md);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
  }

  .btn-primary {
    padding: var(--space-sm) var(--space-lg);
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg-tertiary);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: var(--bg-secondary);
  }

  /* Main Content */
  main {
    flex: 1;
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-xl);
    width: 100%;
  }

  .loading, .error {
    text-align: center;
    padding: var(--space-2xl);
    color: var(--text-muted);
  }

  .error {
    color: var(--error);
  }

  /* Session Card */
  .session-card {
    background: var(--info-bg);
    border: 1px solid var(--info);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    margin-bottom: var(--space-xl);
  }

  .session-card.demo {
    border-color: var(--warning);
    background: linear-gradient(135deg, var(--info-bg) 0%, rgba(255, 193, 7, 0.05) 100%);
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .session-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .session-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .session-badge {
    background: var(--info);
    color: white;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .session-task {
    font-weight: 600;
    font-size: 15px;
  }

  .session-time {
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .session-current {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
  }

  .current-icon {
    color: var(--info);
    font-size: 14px;
  }

  .current-item {
    font-weight: 500;
    font-size: 14px;
  }

  /* Also Did List */
  .also-did {
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-md);
    border-left: 3px solid var(--warning);
  }

  .also-did-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--warning);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .also-did-list {
    list-style: none;
    margin: var(--space-xs) 0 0;
    padding: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .also-did-list li {
    padding: 2px 0;
  }

  .also-did-list li::before {
    content: '+ ';
    color: var(--warning);
  }

  /* Session Checklist (Demo Mode) */
  .session-checklist {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
  }

  .checklist-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .checklist-item.done {
    color: var(--success);
  }

  .checklist-item.current {
    color: var(--text);
    font-weight: 500;
  }

  .check-icon {
    width: 16px;
    text-align: center;
    font-size: 12px;
  }

  .checklist-item.done .check-icon {
    color: var(--success);
  }

  .checklist-item.current .check-icon {
    color: var(--info);
  }

  /* Demo Controls */
  .demo-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
  }

  .auto-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .auto-toggle input {
    cursor: pointer;
  }

  .demo-next {
    padding: var(--space-sm) var(--space-md);
    background: var(--info);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .demo-next:hover {
    background: var(--info-hover, #0288d1);
  }

  .demo-state-btn {
    padding: 4px 12px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    margin-right: var(--space-sm);
  }

  .demo-state-btn:hover {
    opacity: 0.9;
  }

  .demo-toggle {
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .demo-toggle:hover {
    background: var(--bg-tertiary);
  }

  .demo-start {
    width: 100%;
    padding: var(--space-md);
    background: var(--bg-secondary);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    font-size: 14px;
    color: var(--text-muted);
    cursor: pointer;
    margin-bottom: var(--space-xl);
  }

  .demo-start:hover {
    background: var(--bg-tertiary);
    border-color: var(--text-muted);
  }

  /* Session Progress (Compact) */
  .session-progress {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .progress-dots {
    display: flex;
    gap: 6px;
  }

  .progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--bg-tertiary);
  }

  .progress-dot.complete {
    background: var(--success);
  }

  .progress-dot.current {
    background: var(--info);
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .progress-label {
    font-size: 13px;
    color: var(--text-muted);
  }

  /* Top Bar - Progress + View Toggle */
  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .progress-summary {
    flex: 1;
  }

  .progress-text {
    font-size: 14px;
    margin-bottom: var(--space-sm);
    color: var(--text-muted);
  }

  .progress-text strong {
    color: var(--text);
  }

  .progress-bar {
    position: relative;
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: visible;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 4px;
    transition: width 0.3s;
  }

  .progress-percent {
    position: absolute;
    right: 0;
    top: -18px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  /* View Toggle */
  .view-toggle {
    display: flex;
    gap: 2px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    padding: 2px;
  }

  .toggle-btn {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-btn:hover {
    color: var(--text);
  }

  .toggle-btn.active {
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  /* Filter Bar */
  .filter-bar {
    display: flex;
    gap: var(--space-md);
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .filter-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 14px;
    background: var(--bg);
  }

  .filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }

  /* Todo List */
  .todo-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .empty-state {
    text-align: center;
    padding: var(--space-2xl);
    color: var(--text-muted);
    font-size: 18px;
  }

  /* Priority Groups */
  .priority-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .priority-header {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: var(--space-sm) 0;
    margin: 0;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .priority-header.priority-1 {
    color: var(--error);
  }

  .priority-header.priority-2 {
    color: var(--warning, #f59e0b);
  }

  .priority-header.priority-3 {
    color: var(--info);
  }

  .priority-header.priority-backlog {
    color: var(--text-muted);
  }

  .todo-item {
    display: flex;
    align-items: flex-start;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .todo-item:hover {
    border-color: var(--primary);
  }

  .todo-item.selected {
    border-color: var(--primary);
    background: var(--primary-bg);
  }

  .todo-item.status-skipped {
    opacity: 0.6;
  }

  .todo-row {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 14px;
    color: var(--text);
  }

  .todo-status {
    width: 20px;
    text-align: center;
    font-size: 14px;
    padding-top: 2px;
  }

  .todo-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .todo-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .todo-title {
    flex: 1;
  }

  .todo-area {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .todo-context {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .todo-progress {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .mini-progress-bar {
    flex: 1;
    max-width: 100px;
    height: 4px;
    background: var(--bg-tertiary);
    border-radius: 2px;
    overflow: hidden;
  }

  .mini-progress-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s;
  }

  .todo-stats {
    font-size: 11px;
    color: var(--text-muted);
  }

  .todo-skip {
    padding: var(--space-md);
    background: none;
    border: none;
    border-left: 1px solid var(--border);
    cursor: pointer;
    color: var(--text-muted);
    font-size: 14px;
  }

  .todo-skip:hover {
    background: var(--bg-tertiary);
    color: var(--text);
  }

  /* Areas */
  .areas {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .area {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .area-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  .area-header:hover {
    background: var(--bg-tertiary);
  }

  .area-toggle {
    font-size: 10px;
    color: var(--text-muted);
    width: 12px;
  }

  .area-name {
    flex: 1;
  }

  .area-count {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-muted);
  }

  .area-status {
    font-size: 14px;
  }

  .area-status.complete {
    color: var(--success);
  }

  .area-status.progress {
    color: var(--info);
  }

  .area-content {
    padding: 0 var(--space-lg) var(--space-lg);
  }

  .area-story {
    font-size: 14px;
    color: var(--text-muted);
    font-style: italic;
    margin: 0 0 var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-left: 3px solid var(--primary);
    background: var(--primary-bg);
  }

  /* Items */
  .items {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .item {
    display: flex;
    align-items: center;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .item-row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 14px;
    color: var(--text);
  }

  .item-row:hover {
    background: var(--bg-secondary);
  }

  .item-status {
    width: 20px;
    text-align: center;
    font-size: 14px;
  }

  .item-title {
    flex: 1;
  }

  .item-progress {
    font-size: 12px;
    color: var(--text-muted);
  }

  .item-skip {
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: none;
    border-left: 1px solid var(--border);
    cursor: pointer;
    color: var(--text-muted);
    font-size: 14px;
  }

  .item-skip:hover {
    background: var(--bg-tertiary);
    color: var(--text);
  }

  /* Item status styles */
  .status-done {
    opacity: 0.6;
  }

  .status-done .item-title,
  .status-done .todo-title {
    text-decoration: line-through;
  }

  .status-done .item-status,
  .status-done .todo-status {
    color: var(--success);
  }

  .status-progress .item-status,
  .status-progress .todo-status {
    color: var(--info);
  }

  .status-skipped {
    opacity: 0.5;
  }

  .status-skipped .item-title,
  .status-skipped .todo-title {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .status-open .item-status,
  .status-open .todo-status {
    color: var(--text-muted);
  }

  /* Detail Panel */
  .detail-panel {
    position: fixed;
    right: 0;
    top: 73px; /* Below capture bar */
    bottom: 0;
    width: 400px;
    background: var(--bg);
    border-left: 1px solid var(--border);
    padding: var(--space-xl);
    overflow-y: auto;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
    z-index: 5; /* Below capture bar z-index of 10 */
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .detail-header h2 {
    font-size: 18px;
    margin: 0;
    flex: 1;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-muted);
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--text);
  }

  .detail-desc {
    color: var(--text-muted);
    margin-bottom: var(--space-lg);
  }

  .detail-story {
    margin-bottom: var(--space-lg);
  }

  .detail-story blockquote {
    font-size: 14px;
    color: var(--text-muted);
    font-style: italic;
    margin: var(--space-sm) 0 0;
    padding: var(--space-sm) var(--space-md);
    border-left: 3px solid var(--primary);
    background: var(--primary-bg);
  }

  .detail-panel h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 var(--space-sm);
  }

  .detail-checklist {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-lg);
  }

  .detail-checklist li {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    font-size: 14px;
  }

  .detail-meta {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-md) 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-lg);
  }

  .meta-area {
    font-size: 12px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .meta-status {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    text-transform: capitalize;
  }

  .meta-status.status-open {
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .meta-status.status-progress {
    background: var(--info-bg);
    color: var(--info);
  }

  .meta-status.status-done {
    background: var(--success-bg);
    color: var(--success);
  }

  .meta-status.status-skipped {
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  /* Edit mode */
  .edit-title {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .edit-desc {
    width: 100%;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    resize: vertical;
    margin-bottom: var(--space-md);
    background: var(--bg);
  }

  .edit-actions {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  /* Buttons */
  .btn {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-secondary {
    background: var(--bg-secondary);
    border-color: var(--border);
    color: var(--text);
  }

  .btn-secondary:hover {
    background: var(--bg-tertiary);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
  }

  .btn-ghost:hover {
    background: var(--bg-secondary);
    color: var(--text);
  }

  .btn-danger {
    background: var(--error);
    color: white;
  }

  .btn-danger:hover {
    opacity: 0.9;
  }

  .btn-danger-ghost {
    background: transparent;
    color: var(--error);
  }

  .btn-danger-ghost:hover {
    background: var(--error-bg);
  }

  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  /* Priority section */
  .priority-section {
    border-top: 1px solid var(--border);
    padding-top: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .priority-options {
    display: flex;
    gap: var(--space-xs);
  }

  .priority-btn {
    flex: 1;
    padding: var(--space-sm);
    background: var(--bg-tertiary);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }

  .priority-btn:hover {
    background: var(--bg-secondary);
  }

  .priority-btn.selected {
    border-width: 2px;
  }

  .priority-btn.p1 {
    color: var(--error);
  }

  .priority-btn.p1.selected {
    background: var(--error-bg);
    border-color: var(--error);
  }

  .priority-btn.p2 {
    color: var(--warning);
  }

  .priority-btn.p2.selected {
    background: var(--warning-bg, #fef3cd);
    border-color: var(--warning);
  }

  .priority-btn.p3 {
    color: var(--info);
  }

  .priority-btn.p3.selected {
    background: var(--info-bg);
    border-color: var(--info);
  }

  .priority-btn.backlog {
    color: var(--text-muted);
  }

  .priority-btn.backlog.selected {
    background: var(--bg-secondary);
    border-color: var(--text-muted);
  }

  /* Move section */
  .move-section {
    border-top: 1px solid var(--border);
    padding-top: var(--space-lg);
  }

  .move-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .move-btn {
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .move-btn:hover {
    background: var(--primary-bg);
    border-color: var(--primary);
    color: var(--primary);
  }

  /* How-To Guide */
  .how-to-guide {
    background: linear-gradient(135deg, var(--primary-bg) 0%, var(--bg-secondary) 100%);
    border: 1px solid var(--primary);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .how-to-guide h2 {
    margin: 0 0 var(--space-lg);
    font-size: 20px;
    color: var(--primary);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .step {
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
  }

  .step-num {
    width: 28px;
    height: 28px;
    background: var(--primary);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
  }

  .step-content {
    flex: 1;
  }

  .step-content strong {
    display: block;
    font-size: 15px;
    margin-bottom: 2px;
  }

  .step-content p {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .step-content code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--primary);
  }

  .guide-note {
    margin: var(--space-lg) 0 0;
    font-size: 13px;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Queue Section */
  .queue-section {
    margin-top: var(--space-md);
    border-top: 1px solid var(--border);
    padding-top: var(--space-sm);
  }

  .queue-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-muted);
    width: 100%;
    text-align: left;
    border-radius: var(--radius-sm);
  }

  .queue-toggle:hover {
    background: var(--bg-tertiary);
    color: var(--text);
  }

  .queue-icon {
    font-size: 10px;
    width: 12px;
  }

  .queue-badge {
    background: var(--warning);
    color: #333;
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }

  .queue-content {
    padding: var(--space-sm);
    background: var(--bg);
    border-radius: var(--radius-md);
    margin-top: var(--space-xs);
  }

  .queue-list {
    list-style: none;
    margin: 0 0 var(--space-sm);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    font-size: 13px;
  }

  .queue-item-title {
    flex: 1;
    color: var(--text);
  }

  .queue-item-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 16px;
    padding: 0 4px;
    line-height: 1;
  }

  .queue-item-remove:hover {
    color: var(--error);
  }

  .queue-form {
    display: flex;
    gap: var(--space-xs);
  }

  .queue-form input {
    flex: 1;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    background: var(--bg);
  }

  .queue-form input:focus {
    border-color: var(--primary);
    outline: none;
  }

  .queue-form button {
    padding: var(--space-xs) var(--space-sm);
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .queue-form button:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .queue-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .queue-hint {
    margin: var(--space-xs) 0 0;
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Session Progress Summary */
  .session-progress-summary {
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
    margin-top: var(--space-sm);
  }

  .session-progress-summary .progress-label {
    font-size: 13px;
    color: var(--text-muted);
  }

  /* Session Commands */
  .session-commands {
    display: flex;
    gap: var(--space-md);
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: var(--space-sm);
  }

  .session-commands code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    margin-right: 4px;
  }

  /* Bug Panel */
  .bug-panel {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-lg);
    overflow: hidden;
  }

  .bug-panel.has-critical {
    border-color: var(--error);
    background: linear-gradient(135deg, var(--bg-secondary), rgba(244, 67, 54, 0.05));
  }

  .bug-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  .bug-header:hover {
    background: var(--bg-tertiary);
  }

  .bug-icon {
    font-size: 10px;
    color: var(--text-muted);
    width: 12px;
  }

  .bug-title {
    flex: 1;
  }

  .bug-count {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--warning);
    color: #333;
  }

  .bug-count.critical {
    background: var(--error);
    color: white;
  }

  .bug-count.done {
    background: var(--success);
    color: white;
  }

  .bug-content {
    padding: 0 var(--space-lg) var(--space-lg);
  }

  .bug-filters {
    display: flex;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .bug-filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .bug-empty {
    font-size: 13px;
    color: var(--text-muted);
    font-style: italic;
    margin: 0;
  }

  .bug-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .bug-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg);
    border-radius: var(--radius-md);
    font-size: 13px;
  }

  .bug-item.fixed {
    opacity: 0.6;
  }

  .bug-item.fixed .bug-item-title {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .bug-severity {
    font-size: 12px;
    flex-shrink: 0;
  }

  .bug-item-title {
    flex: 1;
  }

  .bug-status-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .bug-status-badge.fixed {
    background: var(--success-bg, rgba(34, 197, 94, 0.1));
    color: var(--success);
  }

  .bug-status-badge.progress {
    background: var(--info-bg);
    color: var(--info);
  }

  .bug-status-badge.wontfix {
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .bug-actions {
    display: flex;
    gap: var(--space-md);
    font-size: 12px;
    color: var(--text-muted);
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
  }

  .bug-actions code {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    margin-right: 4px;
  }

  .bug-input-form {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .bug-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 13px;
    background: var(--bg);
  }

  .bug-input:focus {
    outline: none;
    border-color: var(--error);
  }

  .bug-add-btn {
    padding: var(--space-sm) var(--space-md);
    background: var(--error);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    min-width: 36px;
  }

  .bug-add-btn:hover:not(:disabled) {
    background: #dc2626;
  }

  .bug-add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
