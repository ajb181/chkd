<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { marked } from 'marked';
  import { getSpec, getSession, skipItem as skipItemApi, editItem as editItemApi, deleteItem as deleteItemApi, moveItem as moveItemApi, setPriority as setPriorityApi, getRepos, addRepo, getProposals, getQueue, addToQueue, removeFromQueue, getBugs, polishBug, getQuickWins, createQuickWin, completeQuickWin, deleteQuickWin, getItemDurations } from '$lib/api';
  import type { ParsedSpec, SpecArea, SpecItem, Session, ItemStatus, Priority, Repository, QueueItem, Bug, HandoverNote, QuickWin } from '$lib/api';
  import FeatureCapture from '$lib/components/FeatureCapture.svelte';

  // Terminal state - dynamic import to avoid SSR issues with xterm.js
  let showTerminal = false;
  let TerminalComponent: any = null;

  // Load terminal component only in browser
  $: if (browser && showTerminal && !TerminalComponent) {
    import('$lib/components/Terminal.svelte').then(m => {
      TerminalComponent = m.default;
    });
  }

  // Configure marked for inline rendering (no <p> tags for short text)
  const markedInline = (text: string) => {
    if (!text) return '';
    // Use marked.parseInline for inline markdown (no block elements)
    return marked.parseInline(text) as string;
  };

  // Form persistence helpers - survive hot reloads
  const STORAGE_KEY = 'chkd_form_drafts';

  function saveDraft(key: string, value: string) {
    if (typeof window === 'undefined') return;
    try {
      const drafts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (value.trim()) {
        drafts[key] = value;
      } else {
        delete drafts[key];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch (e) { /* ignore */ }
  }

  function getDraft(key: string): string {
    if (typeof window === 'undefined') return '';
    try {
      const drafts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return drafts[key] || '';
    } catch (e) { return ''; }
  }

  function clearDraft(key: string) {
    saveDraft(key, '');
  }

  // Repository management
  let repos: Repository[] = [];
  let currentRepo: Repository | null = null;
  let showAddRepo = false;
  let newRepoPath = '';
  let newRepoName = '';
  let addingRepo = false;
  let addRepoError: string | null = null;

  // Repo status cards - stores session/progress for each repo
  interface RepoStatus {
    currentTask: string | null;
    currentItem: string | null;  // The sub-item being worked on
    status: 'idle' | 'building' | 'debugging' | 'impromptu' | 'quickwin';
    repoProgress: number;        // Overall repo progress %
    taskProgress: number;        // Current task progress % (sub-items)
    completedItems: number;
    totalItems: number;
    queueCount: number;          // Items in queue
  }
  let repoStatuses: Map<string, RepoStatus> = new Map();

  // Quick queue input for repo cards
  let quickQueueRepoId: string | null = null;
  let quickQueueInput = getDraft('queueInput');
  $: saveDraft('queueInput', quickQueueInput);

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
  let bugInput = getDraft('bugInput');
  $: saveDraft('bugInput', bugInput);
  let addingBug = false;
  let expandedBugId: string | null = null;
  let currentBugIndex = 0;
  let editingBugId: string | null = null;
  let editBugTitle = '';
  let editBugDescription = '';
  let editBugSeverity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  let savingBug = false;

  // Bug polish confirmation
  let bugPolishPending = false;
  let bugPolishedTitle = '';
  let bugOriginalTitle = '';

  // Quick Wins
  let quickWins: QuickWin[] = [];
  let quickWinsExpanded = false;
  let showAllQuickWins = false;
  let quickWinInput = getDraft('quickWinInput');
  $: saveDraft('quickWinInput', quickWinInput);
  let addingQuickWin = false;
  let editingQuickWinId: string | null = null;
  let editQuickWinTitle = '';
  let savingQuickWin = false;

  $: openQuickWins = quickWins.filter(w => w.status === 'open');

  // Blocked/Roadblocked items
  let blockedExpanded = false;

  // Get all blocked items from spec
  function getBlockedItems(): { item: SpecItem; area: SpecArea }[] {
    if (!spec) return [];
    const blocked: { item: SpecItem; area: SpecArea }[] = [];
    for (const area of spec.areas) {
      const collectBlocked = (items: SpecItem[]) => {
        for (const item of items) {
          if (item.status === 'blocked') {
            blocked.push({ item, area });
          }
          collectBlocked(item.children);
        }
      };
      collectBlocked(area.items);
    }
    return blocked;
  }

  $: blockedItems = getBlockedItems();

  // Item durations (time spent on each item)
  let itemDurations: Record<string, number> = {};
  $: doneQuickWins = quickWins.filter(w => w.status === 'done');

  async function handleAddQuickWin() {
    if (!quickWinInput.trim() || !repoPath || addingQuickWin) return;
    addingQuickWin = true;
    try {
      const res = await createQuickWin(repoPath, quickWinInput.trim());
      if (res.success) {
        quickWinInput = '';
        clearDraft('quickWinInput');
        // Refresh quick wins
        const winsRes = await getQuickWins(repoPath);
        if (winsRes.success && winsRes.data) {
          quickWins = winsRes.data;
        }
      }
    } finally {
      addingQuickWin = false;
    }
  }

  async function handleCompleteQuickWin(win: QuickWin) {
    const res = await completeQuickWin(repoPath, win.id);
    if (res.success) {
      // Refresh quick wins
      const winsRes = await getQuickWins(repoPath);
      if (winsRes.success && winsRes.data) {
        quickWins = winsRes.data;
      }
    }
  }

  async function handleDeleteQuickWin(win: QuickWin) {
    const res = await deleteQuickWin(repoPath, win.id);
    if (res.success) {
      // Refresh quick wins
      const winsRes = await getQuickWins(repoPath);
      if (winsRes.success && winsRes.data) {
        quickWins = winsRes.data;
      }
    }
  }

  function startEditQuickWin(win: QuickWin) {
    editingQuickWinId = win.id;
    editQuickWinTitle = win.title;
  }

  async function saveQuickWinEdit() {
    if (!editingQuickWinId || !editQuickWinTitle.trim()) return;
    savingQuickWin = true;
    try {
      const res = await fetch('/api/quickwins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath,
          id: editingQuickWinId,
          title: editQuickWinTitle.trim()
        })
      });
      if (res.ok) {
        const winsRes = await getQuickWins(repoPath);
        if (winsRes.success && winsRes.data) {
          quickWins = winsRes.data;
        }
        editingQuickWinId = null;
        editQuickWinTitle = '';
      }
    } finally {
      savingQuickWin = false;
    }
  }

  function cancelQuickWinEdit() {
    editingQuickWinId = null;
    editQuickWinTitle = '';
  }

  async function startEditBug(bug: Bug) {
    editingBugId = bug.id;
    editBugTitle = bug.title;
    editBugDescription = bug.description || '';
    editBugSeverity = bug.severity as 'critical' | 'high' | 'medium' | 'low';
  }

  async function saveBugEdit() {
    if (!editingBugId || !currentRepo) return;
    savingBug = true;
    try {
      const res = await fetch('/api/bugs/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bugId: editingBugId,
          title: editBugTitle,
          description: editBugDescription,
          severity: editBugSeverity
        })
      });
      if (res.ok) {
        await loadBugs();
        editingBugId = null;
      }
    } finally {
      savingBug = false;
    }
  }

  function cancelBugEdit() {
    editingBugId = null;
    editBugTitle = '';
    editBugDescription = '';
    editBugSeverity = 'medium';
  }

  // Handover notes
  let handoverNotes: HandoverNote[] = [];

  // Check if a task has a handover note
  function getHandoverNote(taskId: string): HandoverNote | undefined {
    return handoverNotes.find(n => n.taskId === taskId);
  }

  // Rotate through bugs every 3 seconds
  $: openBugs = bugs.filter(b => b.status === 'open' || b.status === 'in_progress');
  $: if (openBugs.length > 0 && currentBugIndex >= openBugs.length) {
    currentBugIndex = 0;
  }

  let bugRotationInterval: ReturnType<typeof setInterval> | null = null;

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
      action: 'Ready to build',
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

    // Check for adhoc modes first (no spec task, just a description)
    if (session.mode === 'debugging') {
      return {
        state: 'DEBUG',
        stateColor: 'error',
        action: session.currentTask?.title || 'Fixing bug',
        commands: session.currentTask?.id
          ? [
              { cmd: '/bugfix', desc: 'Research & fix' },
              { cmd: 'chkd progress', desc: 'Check sub-items' },
              { cmd: 'Stay focused', desc: 'Minimal changes only' }
            ]
          : [
              { cmd: 'Stay focused', desc: 'Minimal changes' },
              { cmd: 'chkd done', desc: 'End session' }
            ]
      };
    }

    if (session.mode === 'quickwin') {
      return {
        state: 'QUICKWIN',
        stateColor: 'warning',
        action: session.currentTask?.title || 'Working on quick win',
        commands: ['chkd done - complete and end session', 'chkd promote - convert to story if too big']
      };
    }

    if (session.mode === 'impromptu') {
      return {
        state: 'IMPROMPTU',
        stateColor: 'warning',
        action: session.currentTask?.title || 'Ad-hoc work',
        commands: [
          { cmd: 'Build it', desc: 'Do the work' },
          { cmd: 'chkd done', desc: 'End session' }
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

    // Rotate through bugs every 3 seconds
    bugRotationInterval = setInterval(() => {
      if (openBugs.length > 1) {
        currentBugIndex = (currentBugIndex + 1) % openBugs.length;
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      if (demoInterval) clearInterval(demoInterval);
      if (bugRotationInterval) clearInterval(bugRotationInterval);
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

      // Fetch status for all repos (for the repo cards)
      await loadAllRepoStatuses();
    }
  }

  async function loadAllRepoStatuses() {
    const statusPromises = repos.map(async (repo) => {
      try {
        const [sessionRes, specRes, queueRes] = await Promise.all([
          getSession(repo.path),
          getSpec(repo.path),
          getQueue(repo.path)
        ]);

        // Calculate task progress if there's a current task
        let taskProgress = 0;
        if (sessionRes.data?.currentTask && specRes.data?.areas) {
          const taskId = sessionRes.data.currentTask.id;
          // Find the task in spec and count sub-items
          for (const area of specRes.data.areas) {
            const task = area.items.find((i: any) => i.id === taskId);
            if (task && task.children && task.children.length > 0) {
              const done = task.children.filter((c: any) => c.status === 'done').length;
              taskProgress = Math.round((done / task.children.length) * 100);
              break;
            }
          }
        }

        const status: RepoStatus = {
          currentTask: sessionRes.data?.currentTask?.title || null,
          currentItem: sessionRes.data?.currentItem?.title || null,
          status: sessionRes.data?.mode === 'debugging' ? 'debugging' :
                  sessionRes.data?.mode === 'impromptu' ? 'impromptu' :
                  sessionRes.data?.mode === 'quickwin' ? 'quickwin' :
                  sessionRes.data?.status === 'building' ? 'building' : 'idle',
          repoProgress: specRes.data?.progress || 0,
          taskProgress,
          completedItems: specRes.data?.completedItems || 0,
          totalItems: specRes.data?.totalItems || 0,
          queueCount: queueRes.data?.items?.length || 0
        };
        return { repoId: repo.id, status };
      } catch {
        return { repoId: repo.id, status: { currentTask: null, currentItem: null, status: 'idle' as const, repoProgress: 0, taskProgress: 0, completedItems: 0, totalItems: 0, queueCount: 0 } };
      }
    });

    const results = await Promise.all(statusPromises);
    const newStatuses = new Map<string, RepoStatus>();
    results.forEach(r => newStatuses.set(r.repoId, r.status));
    repoStatuses = newStatuses;
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

  async function selectRepo(repo: Repository) {
    currentRepo = repo;
    repoPath = repo.path;
    // Update URL
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('repo', repo.path);
      window.history.pushState({}, '', url.toString());
    }
    // Clear current data while loading
    bugs = [];
    quickWins = [];
    await loadData();
  }

  async function loadData() {
    if (!repoPath) return;
    try {
      const [specRes, sessionRes, proposalsRes, queueRes, bugsRes, quickWinsRes, durationsRes] = await Promise.all([
        getSpec(repoPath),
        getSession(repoPath),
        getProposals(repoPath),
        getQueue(repoPath),
        getBugs(repoPath),
        getQuickWins(repoPath),
        getItemDurations(repoPath)
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

      if (quickWinsRes.success && quickWinsRes.data) {
        quickWins = quickWinsRes.data;
      }

      if (durationsRes.success && durationsRes.data) {
        itemDurations = durationsRes.data;
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
        handoverNotes = session?.handoverNotes || [];
      }

      // Update current repo's status in the cards
      if (currentRepo && specRes.success && sessionRes.success) {
        // Calculate task progress
        let taskProgress = 0;
        if (session?.currentTask && spec?.areas) {
          const taskId = session.currentTask.id;
          for (const area of spec.areas) {
            const task = area.items.find((i: any) => i.id === taskId);
            if (task && task.children && task.children.length > 0) {
              const done = task.children.filter((c: any) => c.status === 'done').length;
              taskProgress = Math.round((done / task.children.length) * 100);
              break;
            }
          }
        }

        const newStatus: RepoStatus = {
          currentTask: session?.currentTask?.title || null,
          currentItem: session?.currentItem?.title || null,
          status: session?.mode === 'debugging' ? 'debugging' :
                  session?.mode === 'impromptu' ? 'impromptu' :
                  session?.mode === 'quickwin' ? 'quickwin' :
                  session?.status === 'building' ? 'building' : 'idle',
          repoProgress: spec?.progress || 0,
          taskProgress,
          completedItems: spec?.completedItems || 0,
          totalItems: spec?.totalItems || 0,
          queueCount: queueItems.length
        };
        repoStatuses.set(currentRepo.id, newStatus);
        repoStatuses = repoStatuses; // Trigger reactivity
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

  // Quick queue from repo cards
  let addingQuickQueue = false;
  async function handleQuickQueueSubmit(targetRepoPath: string) {
    if (!quickQueueInput.trim() || addingQuickQueue) return;
    addingQuickQueue = true;
    try {
      const res = await addToQueue(targetRepoPath, quickQueueInput.trim());
      if (res.success) {
        quickQueueInput = '';
        quickQueueRepoId = null;
        // Update the queue count in repoStatuses
        await loadAllRepoStatuses();
      }
    } finally {
      addingQuickQueue = false;
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
      // First, polish the bug title
      const polishRes = await polishBug(bugInput.trim());
      if (polishRes.success && polishRes.data?.aiGenerated && polishRes.data.polished !== bugInput.trim()) {
        // Show confirmation UI
        bugOriginalTitle = bugInput.trim();
        bugPolishedTitle = polishRes.data.polished;
        bugPolishPending = true;
        addingBug = false;
        return;
      }

      // No polish needed or polish failed - submit directly
      await submitBug(bugInput.trim());
    } finally {
      addingBug = false;
    }
  }

  async function submitBug(title: string) {
    if (!repoPath) return;
    const res = await fetch('/api/bugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath, title, severity: 'medium' })
    });
    const data = await res.json();
    if (data.success) {
      bugInput = '';
      bugPolishPending = false;
      bugOriginalTitle = '';
      bugPolishedTitle = '';
      // Refresh bugs
      const bugsRes = await getBugs(repoPath);
      if (bugsRes.success && bugsRes.data) {
        bugs = bugsRes.data;
      }
      bugsExpanded = true;
    }
  }

  function acceptBugPolish() {
    submitBug(bugPolishedTitle);
  }

  function keepOriginalBug() {
    submitBug(bugOriginalTitle);
  }

  function cancelBugPolish() {
    bugPolishPending = false;
    bugOriginalTitle = '';
    bugPolishedTitle = '';
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
    bugsExpanded = false; // Close bug dropdown when opening detail
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
      case 'blocked': return '!';
      default: return '○';
    }
  }

  function getStatusClass(status: ItemStatus): string {
    switch (status) {
      case 'done': return 'status-done';
      case 'in-progress': return 'status-progress';
      case 'skipped': return 'status-skipped';
      case 'blocked': return 'status-blocked';
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

  // Keyboard handler for closing popups
  function handleKeydown(e: KeyboardEvent) {
    // Ctrl+` or Cmd+` to toggle terminal
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      showTerminal = !showTerminal;
      e.preventDefault();
      return;
    }

    if (e.key === 'Escape') {
      if (showTerminal) {
        showTerminal = false;
        e.preventDefault();
        return;
      }
      if (bugsExpanded) {
        bugsExpanded = false;
        e.preventDefault();
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app" class:has-detail={selectedFeature}>
  <!-- Header with Nav and Quick Capture -->
  <header class="capture-bar">
    <nav class="header-nav">
      <a href="/guide{currentRepo ? `?repo=${encodeURIComponent(currentRepo.path)}` : ''}" class="nav-link">Guide</a>
      <a href="/settings" class="nav-link">Settings</a>
      <button class="nav-link terminal-toggle" class:active={showTerminal} on:click={() => showTerminal = !showTerminal} title="Toggle Terminal (Ctrl+`)">
        📟 {showTerminal ? 'Hide' : 'Terminal'}
      </button>
    </nav>

    <form on:submit|preventDefault={handleQuickCapture} class="capture-form">
      <input
        type="text"
        bind:value={captureInput}
        placeholder="Add a feature..."
        disabled={capturing}
        class="capture-input"
      />
      <button type="submit" disabled={capturing || !captureInput.trim()} class="btn-capture" title="Quick add">
        {capturing ? '...' : '+'}
      </button>
      <button type="button" class="btn-expand-capture" on:click={openFeatureCapture} title="Detailed capture">
        ⋯
      </button>
    </form>
  </header>

  <!-- Repo Cards Strip -->
  <div class="repo-cards-strip">
    <div class="repo-cards-scroll">
      <button class="repo-card repo-card-add" on:click={() => showAddRepo = true} title="Add Repository">
        <span class="repo-card-plus">+</span>
        <span class="repo-card-add-label">Add Repo</span>
      </button>
      {#each repos as repo}
      {@const status = repoStatuses.get(repo.id)}
      <div class="repo-card-wrapper" class:active={currentRepo?.id === repo.id} class:has-msg={status?.status !== 'idle'}>
        <button
          class="repo-card"
          class:active={currentRepo?.id === repo.id}
          class:building={status?.status === 'building'}
          class:debugging={status?.status === 'debugging'}
          on:click={() => selectRepo(repo)}
        >
          <div class="repo-card-header">
            <span class="repo-card-name">{repo.name}</span>
            <div class="repo-card-badges">
              {#if status?.queueCount && status.queueCount > 0}
                <span class="repo-card-queue-badge" title="Messages in queue">{status.queueCount}</span>
              {/if}
              {#if status?.status === 'building'}
                <span class="repo-card-status building">●</span>
              {:else if status?.status === 'debugging'}
                <span class="repo-card-status debugging">●</span>
              {:else if status?.status === 'impromptu'}
                <span class="repo-card-status impromptu">●</span>
              {:else if status?.status === 'quickwin'}
                <span class="repo-card-status quickwin">●</span>
              {:else}
                <span class="repo-card-status idle">○</span>
              {/if}
            </div>
          </div>
          <div class="repo-card-task">
            {#if status?.currentTask}
              <span class="repo-card-task-name">{status.currentTask.length > 45 ? status.currentTask.slice(0, 42) + '...' : status.currentTask}</span>
              {#if status.currentItem}
                <span class="repo-card-item scroll-text">
                  <span class="repo-card-item-inner">▸ {status.currentItem}</span>
                </span>
              {/if}
            {:else}
              <span class="repo-card-idle">Idle</span>
            {/if}
          </div>
          <div class="repo-card-progress">
            {#if status?.status !== 'idle' && status?.taskProgress !== undefined}
              <!-- Active: show task progress bar + repo % -->
              <div class="repo-card-bar task">
                <div class="repo-card-fill" style="width: {status.taskProgress}%"></div>
              </div>
              <span class="repo-card-pct">{status.taskProgress}%</span>
              <span class="repo-card-repo-pct" title="Repo progress">({status?.repoProgress || 0}%)</span>
            {:else}
              <!-- Idle: show repo progress -->
              <div class="repo-card-bar">
                <div class="repo-card-fill" style="width: {status?.repoProgress || 0}%"></div>
              </div>
              <span class="repo-card-pct">{status?.repoProgress || 0}%</span>
            {/if}
          </div>
        </button>
        <!-- Quick message button (outside button to avoid nesting) -->
        {#if status?.status !== 'idle'}
          <button
            class="repo-card-msg-btn"
            on:click={() => { quickQueueRepoId = quickQueueRepoId === repo.id ? null : repo.id; quickQueueInput = ''; }}
            title="Send message to Claude"
          >
            💬
          </button>
        {/if}
        <!-- Quick queue input (shown below active card) -->
        {#if quickQueueRepoId === repo.id}
          <form class="repo-card-queue-form" on:submit|preventDefault={() => handleQuickQueueSubmit(repo.path)}>
            <input
              type="text"
              bind:value={quickQueueInput}
              placeholder="Message for Claude..."
              disabled={addingQuickQueue}
            />
            <button type="submit" disabled={addingQuickQueue || !quickQueueInput.trim()}>
              {addingQuickQueue ? '...' : '→'}
            </button>
            <button type="button" class="cancel-btn" on:click={() => quickQueueRepoId = null}>×</button>
          </form>
        {/if}
      </div>
      {/each}
    </div>

    <!-- Pinned Cards (Bugs + Quick Wins) -->
    <div class="pinned-cards">
    <!-- Bug Card -->
    {#if true}
      {@const openBugsFiltered = bugs.filter(b => b.status === 'open' || b.status === 'in_progress')}
      {@const openBugsCount = openBugsFiltered.length}
      {@const hasCritical = openBugsFiltered.some(b => b.severity === 'critical' || b.severity === 'high')}
      <div class="bug-card-wrapper">
        <button
          class="bug-card"
          class:expanded={bugsExpanded}
          class:has-bugs={openBugsCount > 0}
          class:critical={hasCritical}
          on:click={() => bugsExpanded = !bugsExpanded}
        >
          <div class="bug-card-header">
            <span class="bug-card-icon">🐛</span>
            <div class="bug-card-titles">
              <span class="bug-card-title">Bugs</span>
              <span class="bug-card-repo">{currentRepo?.name || 'No repo'}</span>
            </div>
            {#if openBugsCount > 0}
              <span class="bug-card-count" class:critical={hasCritical}>{openBugsCount}</span>
            {:else}
              <span class="bug-card-count clear">✓</span>
            {/if}
          </div>
          {#if openBugsCount > 0}
            {@const currentBug = openBugsFiltered[currentBugIndex] || openBugsFiltered[0]}
            {#if currentBug}
              <div class="bug-card-preview">
                <span class="bug-preview-severity">
                  {currentBug.severity === 'critical' ? '🔴' : currentBug.severity === 'high' ? '🟠' : currentBug.severity === 'medium' ? '🟡' : '🟢'}
                </span>
                <span class="bug-preview-title">{@html markedInline(currentBug.title)}</span>
              </div>
            {/if}
          {/if}
        </button>

        <!-- Bug dropdown panel -->
        {#if bugsExpanded}
          <!-- Backdrop to close on outside click -->
          <div class="bug-backdrop" on:click={() => bugsExpanded = false}></div>
          {@const fixedBugs = bugs.filter(b => b.status === 'fixed' || b.status === 'wont_fix')}
          {@const displayBugs = showAllBugs ? bugs : openBugsFiltered}
          <div class="bug-dropdown">
          <!-- Quick bug input -->
          {#if bugPolishPending}
            <div class="bug-polish-confirm">
              <div class="bug-polish-header">AI suggests a cleaner title:</div>
              <div class="bug-polish-compare">
                <div class="bug-polish-original">
                  <span class="polish-label">Original:</span>
                  <span class="polish-text">{bugOriginalTitle}</span>
                </div>
                <div class="bug-polish-polished">
                  <span class="polish-label">Polished:</span>
                  <span class="polish-text">{bugPolishedTitle}</span>
                </div>
              </div>
              <div class="bug-polish-actions">
                <button class="polish-accept" on:click={acceptBugPolish}>Use polished</button>
                <button class="polish-keep" on:click={keepOriginalBug}>Keep original</button>
                <button class="polish-cancel" on:click={cancelBugPolish}>×</button>
              </div>
            </div>
          {:else}
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
          {/if}

          {#if displayBugs.length === 0}
            <p class="bug-empty">{bugs.length === 0 ? 'No bugs yet' : 'No open bugs'}</p>
          {:else}
            <ul class="bug-list">
              {#each displayBugs as bug}
                {@const isExpanded = expandedBugId === bug.id}
                <li
                  class="bug-item"
                  class:fixed={bug.status === 'fixed' || bug.status === 'wont_fix'}
                  class:expanded={isExpanded}
                >
                  <button class="bug-item-header" on:click={() => expandedBugId = isExpanded ? null : bug.id}>
                    <code class="bug-id-code" title="Click to copy" on:click|stopPropagation={() => navigator.clipboard.writeText(bug.id.slice(0, 6))}>{bug.id.slice(0, 6)}</code>
                    <span class="bug-severity {bug.severity}" title={bug.severity}>
                      {bug.severity === 'critical' ? '🔴' : bug.severity === 'high' ? '🟠' : bug.severity === 'medium' ? '🟡' : '🟢'}
                    </span>
                    <span class="bug-item-title">{@html markedInline(bug.title)}</span>
                    {#if bug.status === 'fixed'}
                      <span class="bug-status-badge fixed">✓</span>
                    {:else if bug.status === 'in_progress'}
                      <span class="bug-status-badge progress">◐</span>
                    {:else if bug.status === 'wont_fix'}
                      <span class="bug-status-badge wontfix">–</span>
                    {/if}
                    <span class="bug-expand-icon">{isExpanded ? '▴' : '▾'}</span>
                  </button>
                  {#if isExpanded}
                    <div class="bug-item-details">
                      {#if editingBugId === bug.id}
                        <textarea
                          class="bug-edit-title"
                          bind:value={editBugTitle}
                          placeholder="Bug title"
                          rows="2"
                          on:click|stopPropagation
                          on:input={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                        ></textarea>
                        <textarea
                          class="bug-edit-desc"
                          bind:value={editBugDescription}
                          placeholder="Description (optional)"
                          rows="2"
                          on:click|stopPropagation
                          on:input={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                        ></textarea>
                        <div class="bug-severity-selector" on:click|stopPropagation>
                          <span class="severity-label">Severity:</span>
                          <button class="severity-btn critical" class:selected={editBugSeverity === 'critical'} on:click={() => editBugSeverity = 'critical'}>🔴</button>
                          <button class="severity-btn high" class:selected={editBugSeverity === 'high'} on:click={() => editBugSeverity = 'high'}>🟠</button>
                          <button class="severity-btn medium" class:selected={editBugSeverity === 'medium'} on:click={() => editBugSeverity = 'medium'}>🟡</button>
                          <button class="severity-btn low" class:selected={editBugSeverity === 'low'} on:click={() => editBugSeverity = 'low'}>🟢</button>
                        </div>
                        <div class="bug-edit-actions" on:click|stopPropagation>
                          <button class="bug-save-btn" on:click={saveBugEdit} disabled={savingBug || !editBugTitle.trim()}>
                            {savingBug ? '...' : 'Save'}
                          </button>
                          <button class="bug-cancel-btn" on:click={cancelBugEdit}>Cancel</button>
                        </div>
                      {:else}
                        {#if bug.description}
                          <div class="bug-description">{@html markedInline(bug.description)}</div>
                        {:else}
                          <p class="bug-description empty">No description</p>
                        {/if}
                        <div class="bug-meta">
                          <span class="bug-date">
                            {new Date(bug.createdAt).toLocaleDateString()}
                          </span>
                          <button class="bug-edit-btn" on:click|stopPropagation={() => startEditBug(bug)}>Edit</button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}

          <div class="bug-actions">
            {#if fixedBugs.length > 0}
              <button class="bug-show-fixed" on:click={() => showAllBugs = !showAllBugs}>
                {showAllBugs ? 'Hide' : 'Show'} {fixedBugs.length} fixed
              </button>
            {/if}
            <code>/bugfix</code>
          </div>
        </div>
      {/if}
    </div>
    {/if}

    <!-- Quick Wins Card -->
    <div class="quick-win-card-wrapper">
      <button
        class="quick-win-card"
        class:expanded={quickWinsExpanded}
        class:has-wins={openQuickWins.length > 0}
        on:click={() => quickWinsExpanded = !quickWinsExpanded}
      >
        <div class="quick-win-card-header">
          <span class="quick-win-card-icon">⚡</span>
          <div class="quick-win-card-titles">
            <span class="quick-win-card-title">Quick Wins</span>
            <span class="quick-win-card-repo">{currentRepo?.name || 'No repo'}</span>
          </div>
          {#if openQuickWins.length > 0}
            <span class="quick-win-card-count">{openQuickWins.length}</span>
          {:else}
            <span class="quick-win-card-count clear">✓</span>
          {/if}
        </div>
        {#if openQuickWins.length > 0}
          <div class="quick-win-card-preview">
            <span class="quick-win-preview-title">{openQuickWins[0].title}</span>
          </div>
        {/if}
      </button>

      <!-- Quick Wins dropdown panel -->
      {#if quickWinsExpanded}
        <div class="quick-win-backdrop" on:click={() => quickWinsExpanded = false}></div>
        {@const displayWins = showAllQuickWins ? quickWins : openQuickWins}
        <div class="quick-win-dropdown">
          <!-- Quick add input -->
          <form class="quick-win-input-form" on:submit|preventDefault={handleAddQuickWin}>
            <input
              type="text"
              class="quick-win-input"
              placeholder="Add a quick win..."
              bind:value={quickWinInput}
              disabled={addingQuickWin}
            />
            <button type="submit" class="quick-win-add-btn" disabled={!quickWinInput.trim() || addingQuickWin}>
              {addingQuickWin ? '...' : '+'}
            </button>
          </form>

          {#if displayWins.length === 0}
            <p class="quick-win-empty">{quickWins.length === 0 ? 'No quick wins yet' : 'All done!'}</p>
          {:else}
            <ul class="quick-win-list">
              {#each displayWins as win}
                <li class="quick-win-item" class:done={win.status === 'done'} class:editing={editingQuickWinId === win.id}>
                  {#if editingQuickWinId === win.id}
                    <input
                      type="text"
                      class="quick-win-edit-input"
                      bind:value={editQuickWinTitle}
                      on:keydown={(e) => e.key === 'Enter' && saveQuickWinEdit()}
                      on:keydown={(e) => e.key === 'Escape' && cancelQuickWinEdit()}
                      on:click|stopPropagation
                    />
                    <button class="quick-win-save" on:click|stopPropagation={saveQuickWinEdit} disabled={savingQuickWin || !editQuickWinTitle.trim()}>
                      {savingQuickWin ? '...' : '✓'}
                    </button>
                    <button class="quick-win-cancel" on:click|stopPropagation={cancelQuickWinEdit}>×</button>
                  {:else}
                    <button
                      class="quick-win-check"
                      on:click={() => handleCompleteQuickWin(win)}
                      disabled={win.status === 'done'}
                      title={win.status === 'done' ? 'Done' : 'Mark done'}
                    >
                      {win.status === 'done' ? '✓' : '○'}
                    </button>
                    <span class="quick-win-title" on:click|stopPropagation={() => startEditQuickWin(win)} title="Click to edit">{win.title}</span>
                    <button
                      class="quick-win-delete"
                      on:click|stopPropagation={() => handleDeleteQuickWin(win)}
                      title="Delete"
                    >×</button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}

          <div class="quick-win-actions">
            {#if doneQuickWins.length > 0}
              <button class="quick-win-show-done" on:click={() => showAllQuickWins = !showAllQuickWins}>
                {showAllQuickWins ? 'Hide' : 'Show'} {doneQuickWins.length} done
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Roadblocked Card -->
    {#if blockedItems.length > 0}
    <div class="blocked-card-wrapper">
      <button
        class="blocked-card"
        class:expanded={blockedExpanded}
        on:click={() => blockedExpanded = !blockedExpanded}
      >
        <div class="blocked-card-header">
          <span class="blocked-card-icon">🚧</span>
          <div class="blocked-card-titles">
            <span class="blocked-card-title">Roadblocked</span>
            <span class="blocked-card-repo">{currentRepo?.name || 'No repo'}</span>
          </div>
          <span class="blocked-card-count">{blockedItems.length}</span>
        </div>
        {#if blockedItems.length > 0}
          <div class="blocked-card-preview">
            <span class="blocked-preview-title">{blockedItems[0].item.title}</span>
          </div>
        {/if}
      </button>

      <!-- Blocked dropdown panel -->
      {#if blockedExpanded}
        <div class="blocked-backdrop" on:click={() => blockedExpanded = false}></div>
        <div class="blocked-dropdown">
          <div class="blocked-header">
            <span>Items that can't proceed due to blockers</span>
          </div>
          <ul class="blocked-list">
            {#each blockedItems as { item, area }}
              <li class="blocked-item">
                <span class="blocked-area-code">{area.code}</span>
                <span class="blocked-item-title">{item.title}</span>
                {#if item.description}
                  <span class="blocked-item-desc">{item.description}</span>
                {/if}
              </li>
            {/each}
          </ul>
          <div class="blocked-actions">
            <span class="blocked-hint">Mark [!] in spec to add here</span>
          </div>
        </div>
      {/if}
    </div>
    {/if}
    </div>
  </div>

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

  <div class="main-area" class:with-terminal={showTerminal && TerminalComponent}>
    <!-- Terminal Panel (LEFT side when visible) -->
    {#if showTerminal && TerminalComponent}
      <div class="terminal-panel">
        <svelte:component this={TerminalComponent} repoPath={repoPath} visible={showTerminal} />
      </div>
    {/if}

    <main>
    <!-- Context Helper Bar - only show when NOT building (session card handles that) -->
    {#if !loading && session && session.status !== 'building'}
      <div class="context-bar" class:testing={contextHelp.state === 'TESTING'} class:complete={contextHelp.state === 'COMPLETE'} class:rework={contextHelp.state === 'REWORK'} class:debug={contextHelp.state === 'DEBUG'} class:impromptu={contextHelp.state === 'IMPROMPTU'}>
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
          <h2>Quick Start</h2>
          <div class="steps">
            <div class="step">
              <span class="step-num">1</span>
              <div class="step-content">
                <strong>Check status</strong>
                <p>Run <code>chkd status</code> to see progress and what's next</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <div class="step-content">
                <strong>Start building</strong>
                <p>Run <code>/chkd SD.1</code> in Claude Code (use task ID from spec)</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">3</span>
              <div class="step-content">
                <strong>Track progress</strong>
                <p>Claude ticks items as it works. Review here or run <code>chkd progress</code></p>
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
        {@const sessionBadge = activeSession?.mode === 'debugging' ? 'DEBUG' :
                               activeSession?.mode === 'impromptu' ? 'IMPROMPTU' :
                               activeSession?.mode === 'quickwin' ? 'QUICKWIN' : 'BUILDING'}
        {@const badgeClass = activeSession?.mode === 'debugging' ? 'debug' :
                             activeSession?.mode === 'impromptu' ? 'impromptu' :
                             activeSession?.mode === 'quickwin' ? 'quickwin' : ''}
        <div class="session-card" class:demo={demoMode} class:debug={activeSession?.mode === 'debugging'} class:impromptu={activeSession?.mode === 'impromptu'} class:quickwin={activeSession?.mode === 'quickwin'}>
          <div class="session-header">
            <span class="session-badge {badgeClass}">{sessionBadge}</span>
            <span class="session-time">{formatElapsed(activeSession?.elapsedMs || 0)}</span>
            {#if activeSession?.iteration > 1}
              <span class="session-iteration">#{activeSession.iteration}</span>
            {/if}
            {#if demoMode}
              <button class="demo-state-btn" on:click={cycleDemoState}>{currentDemoState.toUpperCase()}</button>
              <button class="demo-toggle" on:click={toggleDemoMode}>Exit Demo</button>
            {/if}
          </div>
          <div class="session-task-title">{@html markedInline(activeSession?.currentTask?.title || '')}</div>

          <!-- Current Item (only show if task has incomplete items) -->
          {#if activeSession?.currentItem && realChecklist.some(i => !i.done)}
            {@const itemElapsed = activeSession.currentItem.startTime
              ? Date.now() - new Date(activeSession.currentItem.startTime).getTime()
              : 0}
            <div class="session-current">
              <span class="current-icon">▸</span>
              <span class="current-item">{@html markedInline(activeSession.currentItem.title)}</span>
              {#if itemElapsed > 0}
                <span class="item-time">{formatElapsed(itemElapsed)}</span>
              {/if}
            </div>
          {:else if realChecklist.length > 0 && realChecklist.every(i => i.done)}
            <div class="session-current complete">
              <span class="current-icon">✓</span>
              <span class="current-item">All sub-items complete</span>
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
                        <span class="queue-item-title">{@html markedInline(item.title)}</span>
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
                    <span class="check-title">{@html markedInline(item.title)}</span>
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
                  <span class="check-title">{@html markedInline(item.title)}</span>
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
      {/if}

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
                            <span class="todo-title">{@html markedInline(item.title)}</span>
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
                        {@const itemHandover = getHandoverNote(item.id)}
                        <li class="item {getStatusClass(item.status)}" class:has-handover={!!itemHandover}>
                          <button class="item-row" on:click={() => selectFeature(item, area)}>
                            <span class="item-status">{getStatusIcon(item.status)}</span>
                            <span class="item-title">{@html markedInline(item.title)}</span>
                            {#if itemHandover}
                              <span class="item-handover" title="Has handover note">📝</span>
                            {/if}
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
  </div>

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
          <h2>{@html markedInline(selectedFeature.item.title)}</h2>
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
        <!-- Handover note from paused session -->
        {@const handover = getHandoverNote(selectedFeature.item.id)}
        {#if handover}
          <div class="detail-handover">
            <div class="handover-header">
              <span class="handover-icon">📝</span>
              <span class="handover-label">Handover Note</span>
              <span class="handover-meta">by {handover.pausedBy} · {new Date(handover.createdAt).toLocaleDateString()}</span>
            </div>
            <blockquote class="handover-content">{@html markedInline(handover.note)}</blockquote>
          </div>
        {/if}

        {#if selectedFeature.item.description}
          <div class="detail-desc">{@html markedInline(selectedFeature.item.description)}</div>
        {/if}

        <!-- User story if area has one -->
        {#if selectedFeature.area.story}
          <div class="detail-story">
            <h3>User Story</h3>
            <blockquote>{@html markedInline(selectedFeature.area.story)}</blockquote>
          </div>
        {/if}

        {#if selectedFeature.item.children.length > 0}
          <h3>Checklist</h3>
          <ul class="detail-checklist">
            {#each selectedFeature.item.children as child}
              <li class="{getStatusClass(child.status)}">
                <span class="item-status">{getStatusIcon(child.status)}</span>
                <span>{@html markedInline(child.title)}</span>
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

  /* Detail panel overlays - no margin needed */

  /* Capture Bar */
  .capture-bar {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    padding: var(--space-sm) var(--space-lg);
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .header-nav {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .nav-link {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
  }

  .nav-link:hover {
    color: var(--text);
    background: var(--surface-hover);
  }

  /* Terminal Toggle */
  .terminal-toggle {
    background: none;
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
  }

  .terminal-toggle.active {
    background: var(--primary);
    color: var(--bg);
    border-color: var(--primary);
  }

  /* Terminal Panel */
  /* Main Area - 50/50 split when terminal is shown */
  .main-area {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .main-area main {
    flex: 1;
    overflow-y: auto;
  }

  .main-area.with-terminal main {
    flex: 1;
  }

  .terminal-panel {
    flex: 1;
    background: #1a1a2e;
    border-right: 2px solid var(--primary);
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    max-height: calc(100vh - 120px);
    clip-path: inset(0);
  }

  /* Terminal stays 50% even when detail sidebar is open */

  /* Repo Selector */
  /* Repo Cards Strip */
  .repo-cards-strip {
    display: flex;
    align-items: stretch;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    position: relative;
  }

  .repo-cards-scroll {
    flex: 1;
    display: flex;
    align-items: stretch;
    gap: var(--space-sm);
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    min-width: 0;
  }

  .repo-cards-scroll::-webkit-scrollbar {
    display: none;
  }

  .pinned-cards {
    flex-shrink: 0;
    display: flex;
    gap: var(--space-sm);
    padding-left: var(--space-md);
    border-left: 1px solid var(--border);
  }

  .repo-card-wrapper {
    flex-shrink: 0;
    position: relative;
  }

  .repo-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-sm) var(--space-md);
    min-width: 160px;
    max-width: 200px;
    height: 88px;
    box-sizing: border-box;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
  }

  /* Active/building cards are wider */
  .repo-card.building,
  .repo-card.debugging,
  .repo-card.active {
    min-width: 260px;
    max-width: 340px;
  }

  .repo-card:hover {
    border-color: var(--primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .repo-card.active {
    border-color: var(--primary);
    border-width: 3px;
    background: linear-gradient(135deg, var(--bg), rgba(79, 70, 229, 0.12));
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
  }

  .repo-card.debugging {
    border-color: var(--error);
  }

  .repo-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .repo-card-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .repo-card-status {
    font-size: 10px;
  }

  .repo-card-status.building {
    color: var(--info);
    animation: pulse 1.5s infinite;
  }

  .repo-card-status.debugging {
    color: var(--error);
    animation: pulse 1.5s infinite;
  }

  .repo-card-status.impromptu {
    color: var(--warning);
    animation: pulse 1.5s infinite;
  }

  .repo-card-status.quickwin {
    color: #f59e0b;  /* amber/gold */
    animation: pulse 1.5s infinite;
  }

  .repo-card-status.idle {
    color: var(--text-muted);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .repo-card-task {
    font-size: 11px;
    color: var(--text-muted);
    min-height: 28px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .repo-card-task-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    color: var(--text);
  }

  .repo-card-item {
    white-space: nowrap;
    overflow: hidden;
    font-size: 10px;
    color: var(--text-muted);
    opacity: 0.8;
    position: relative;
  }

  .repo-card-item.scroll-text {
    overflow: hidden;
    max-width: 100%;
  }

  .repo-card-item-inner {
    display: inline-block;
    animation: scroll-text 12s linear infinite;
    animation-delay: 2s;
    padding-right: 40px;
  }

  .repo-card:hover .repo-card-item-inner {
    animation-play-state: paused;
  }

  @keyframes scroll-text {
    0%, 10% { transform: translateX(0); }
    90%, 100% { transform: translateX(-100%); }
  }

  .repo-card-idle {
    font-style: italic;
    opacity: 0.6;
  }

  .repo-card-progress {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .repo-card-bar {
    flex: 1;
    height: 4px;
    background: var(--bg-tertiary);
    border-radius: 2px;
    overflow: hidden;
  }

  .repo-card-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s;
  }

  .repo-card-pct {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    min-width: 24px;
    text-align: right;
  }

  .repo-card-repo-pct {
    font-size: 9px;
    color: var(--text-muted);
    opacity: 0.7;
  }

  .repo-card-bar.task .repo-card-fill {
    background: var(--info);
  }

  .repo-card-add {
    align-items: center;
    justify-content: center;
    min-width: 80px;
    border-style: dashed;
    background: transparent;
  }

  .repo-card-add:hover {
    background: var(--bg);
  }

  .repo-card-plus {
    font-size: 20px;
    color: var(--text-muted);
  }

  .repo-card-add-label {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Repo Card Badges */
  .repo-card-badges {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .repo-card-queue-badge {
    background: var(--primary);
    color: white;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 8px;
    min-width: 14px;
    text-align: center;
  }

  /* Quick Message Button */
  .repo-card-msg-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: var(--surface-hover);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    font-size: 10px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 1;
  }

  .repo-card-wrapper:hover .repo-card-msg-btn,
  .repo-card-wrapper.active .repo-card-msg-btn {
    opacity: 1;
  }

  .repo-card-msg-btn:hover {
    background: var(--primary);
    border-color: var(--primary);
  }

  /* Bug Card (in cards strip with other repos) */
  .bug-card-wrapper {
    flex-shrink: 0;
    align-self: stretch;
    display: flex;
    position: relative;
  }

  .bug-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-sm) var(--space-md);
    min-width: 160px;
    max-width: 200px;
    height: 88px;
    box-sizing: border-box;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
  }

  .bug-card:hover {
    border-color: var(--warning);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .bug-card.expanded {
    border-color: var(--warning);
    background: linear-gradient(135deg, var(--bg), rgba(234, 179, 8, 0.05));
  }

  .bug-card.has-bugs {
    border-color: var(--warning);
  }

  .bug-card.critical {
    border-color: var(--error);
    animation: pulse-border 2s infinite;
  }

  @keyframes pulse-border {
    0%, 100% { border-color: var(--error); }
    50% { border-color: var(--warning); }
  }

  .bug-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .bug-card-icon {
    font-size: 14px;
  }

  .bug-card-titles {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .bug-card-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
  }

  .bug-card-repo {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bug-card-count {
    background: var(--warning);
    color: var(--bg);
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 8px;
    min-width: 16px;
    text-align: center;
  }

  .bug-card-count.critical {
    background: var(--error);
    color: white;
  }

  .bug-card-count.clear {
    background: var(--success);
    color: white;
  }

  .bug-card-preview {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
  }

  .bug-preview-severity {
    font-size: 10px;
    flex-shrink: 0;
  }

  .bug-preview-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Bug Dropdown Panel */
  .bug-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .bug-dropdown {
    position: fixed;
    top: 70px;
    right: var(--space-lg);
    width: 420px;
    max-height: 500px;
    z-index: 1000;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    padding: var(--space-md);
    z-index: 1000;
  }

  /* Shift dropdown left when detail panel is open */
  .app.has-detail .bug-dropdown {
    right: calc(400px + var(--space-lg) + var(--space-md));
  }

  .bug-dropdown .bug-input-form {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
  }

  /* Bug polish confirmation */
  .bug-polish-confirm {
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    padding: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .bug-polish-header {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: var(--space-xs);
  }

  .bug-polish-compare {
    margin-bottom: var(--space-sm);
  }

  .bug-polish-original,
  .bug-polish-polished {
    display: flex;
    gap: var(--space-xs);
    font-size: 12px;
    padding: var(--space-xs) 0;
  }

  .polish-label {
    font-size: 10px;
    color: var(--text-muted);
    width: 50px;
    flex-shrink: 0;
  }

  .bug-polish-original .polish-text {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .bug-polish-polished .polish-text {
    color: var(--success);
    font-weight: 500;
  }

  .bug-polish-actions {
    display: flex;
    gap: var(--space-xs);
  }

  .polish-accept,
  .polish-keep,
  .polish-cancel {
    font-size: 11px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: none;
  }

  .polish-accept {
    background: var(--success);
    color: white;
  }

  .polish-accept:hover {
    opacity: 0.9;
  }

  .polish-keep {
    background: var(--bg);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .polish-keep:hover {
    background: var(--bg-secondary);
  }

  .polish-cancel {
    background: none;
    color: var(--text-muted);
    padding: 4px;
  }

  .polish-cancel:hover {
    color: var(--error);
  }

  .bug-dropdown .bug-input {
    flex: 1;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    background: var(--bg);
    color: var(--text);
  }

  .bug-dropdown .bug-add-btn {
    padding: var(--space-xs) var(--space-sm);
    background: var(--warning);
    color: var(--bg);
    border: none;
    border-radius: var(--radius-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .bug-dropdown .bug-add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .bug-dropdown .bug-filters {
    margin-bottom: var(--space-sm);
    font-size: 11px;
    color: var(--text-muted);
  }

  .bug-dropdown .bug-filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
  }

  .bug-dropdown .bug-empty {
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
    padding: var(--space-md);
  }

  .bug-dropdown .bug-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .bug-dropdown .bug-item {
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: var(--radius-sm);
    font-size: 12px;
    overflow: hidden;
  }

  .bug-dropdown .bug-item.fixed {
    opacity: 0.6;
  }

  .bug-dropdown .bug-item.expanded {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
  }

  .bug-dropdown .bug-item-header {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    font-size: 12px;
  }

  .bug-dropdown .bug-item-header:hover {
    background: var(--bg-tertiary);
  }

  .bug-dropdown .bug-id-code {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 4px;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .bug-dropdown .bug-id-code:hover {
    background: var(--bg-secondary);
    color: var(--text);
  }

  .bug-dropdown .bug-item-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bug-dropdown .bug-item.expanded .bug-item-title {
    white-space: normal;
    overflow: visible;
  }

  .bug-dropdown .bug-expand-icon {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: auto;
  }

  .bug-dropdown .bug-item-details {
    padding: var(--space-xs) var(--space-sm) var(--space-sm);
    border-top: 1px solid var(--border);
  }

  .bug-dropdown .bug-description {
    font-size: 11px;
    color: var(--text);
    margin: 0 0 var(--space-xs) 0;
    white-space: pre-wrap;
  }

  .bug-dropdown .bug-description.empty {
    color: var(--text-muted);
    font-style: italic;
  }

  .bug-dropdown .bug-meta {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-muted);
  }

  .bug-dropdown .bug-id {
    font-family: var(--font-mono);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
  }

  .bug-dropdown .bug-id:hover {
    background: var(--surface);
  }

  .bug-dropdown .bug-status-badge {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px;
  }

  .bug-dropdown .bug-status-badge.fixed {
    color: var(--success);
  }

  .bug-dropdown .bug-status-badge.progress {
    color: var(--info);
  }

  .bug-dropdown .bug-status-badge.wontfix {
    color: var(--text-muted);
  }

  .bug-dropdown .bug-actions {
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .bug-dropdown .bug-show-fixed {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .bug-dropdown .bug-show-fixed:hover {
    background: var(--surface);
    color: var(--text);
  }

  .bug-dropdown .bug-actions code {
    background: var(--surface);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    color: var(--primary);
  }

  /* Bug Edit UI */
  .bug-edit-btn {
    background: none;
    border: none;
    color: var(--primary);
    cursor: pointer;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .bug-edit-btn:hover {
    background: var(--surface);
  }

  .bug-edit-title {
    width: 100%;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    background: var(--bg);
    color: var(--text);
    margin-bottom: var(--space-xs);
    resize: none;
    overflow: hidden;
    min-height: 40px;
    line-height: 1.4;
    font-family: inherit;
  }

  .bug-edit-desc {
    width: 100%;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    background: var(--bg);
    color: var(--text);
    resize: none;
    overflow: hidden;
    min-height: 50px;
    margin-bottom: var(--space-xs);
    line-height: 1.4;
    font-family: inherit;
  }

  .bug-severity-selector {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin: var(--space-xs) 0;
  }

  .severity-label {
    font-size: 11px;
    color: var(--text-muted);
  }

  .severity-btn {
    padding: 2px 6px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.5;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .severity-btn:hover {
    opacity: 0.8;
  }

  .severity-btn.selected {
    opacity: 1;
    border-color: var(--border-color);
  }

  .bug-edit-actions {
    display: flex;
    gap: var(--space-xs);
    justify-content: flex-end;
  }

  .bug-save-btn, .bug-cancel-btn {
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-size: 11px;
    cursor: pointer;
  }

  .bug-save-btn {
    background: var(--primary);
    color: white;
    border: none;
  }

  .bug-save-btn:hover {
    background: var(--primary-dark);
  }

  .bug-save-btn:disabled {
    opacity: 0.5;
  }

  .bug-cancel-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .bug-cancel-btn:hover {
    background: var(--surface);
  }

  /* Quick Wins Card */
  .quick-win-card-wrapper {
    flex-shrink: 0;
    align-self: stretch;
    display: flex;
    position: relative;
  }

  .quick-win-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-sm) var(--space-md);
    min-width: 160px;
    max-width: 200px;
    height: 88px;
    box-sizing: border-box;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
  }

  .quick-win-card:hover {
    border-color: var(--info);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .quick-win-card.expanded {
    border-color: var(--info);
    background: linear-gradient(135deg, var(--bg), rgba(59, 130, 246, 0.05));
  }

  .quick-win-card.has-wins {
    border-color: var(--info);
  }

  .quick-win-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .quick-win-card-icon {
    font-size: 14px;
  }

  .quick-win-card-titles {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .quick-win-card-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
  }

  .quick-win-card-repo {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quick-win-card-count {
    font-size: 11px;
    font-weight: 600;
    background: var(--info);
    color: white;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }

  .quick-win-card-count.clear {
    background: var(--success);
  }

  .quick-win-card-preview {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding-top: var(--space-xs);
    overflow: hidden;
  }

  .quick-win-preview-title {
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quick-win-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .quick-win-dropdown {
    position: fixed;
    top: 70px;
    right: var(--space-lg);
    min-width: 280px;
    max-width: 340px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-sm);
    z-index: 1000;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }

  .app.has-detail .quick-win-dropdown {
    right: calc(400px + var(--space-lg) + var(--space-md));
  }

  .quick-win-input-form {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
  }

  .quick-win-input {
    flex: 1;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    background: var(--bg);
    color: var(--text);
  }

  .quick-win-input:focus {
    outline: none;
    border-color: var(--info);
  }

  .quick-win-add-btn {
    padding: var(--space-sm) var(--space-md);
    background: var(--info);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
  }

  .quick-win-add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .quick-win-empty {
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
    padding: var(--space-md);
  }

  .quick-win-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .quick-win-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: var(--surface);
    border-radius: var(--radius-sm);
    transition: background 0.15s ease;
  }

  .quick-win-item:hover {
    background: var(--surface-hover);
  }

  .quick-win-item.done {
    opacity: 0.6;
  }

  .quick-win-item.done .quick-win-title {
    text-decoration: line-through;
  }

  .quick-win-check {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    color: var(--text-muted);
    width: 20px;
    flex-shrink: 0;
  }

  .quick-win-check:hover:not(:disabled) {
    color: var(--success);
  }

  .quick-win-check:disabled {
    color: var(--success);
    cursor: default;
  }

  .quick-win-title {
    flex: 1;
    font-size: 12px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .quick-win-title:hover {
    text-decoration: underline;
    text-decoration-style: dotted;
  }

  .quick-win-item.editing {
    background: var(--bg-secondary);
  }

  .quick-win-edit-input {
    flex: 1;
    font-size: 12px;
    padding: 2px 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text);
  }

  .quick-win-save, .quick-win-cancel {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    color: var(--text-muted);
  }

  .quick-win-save:hover {
    color: var(--success);
  }

  .quick-win-cancel:hover {
    color: var(--danger);
  }

  .quick-win-delete {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-muted);
    padding: 0 4px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .quick-win-item:hover .quick-win-delete {
    opacity: 1;
  }

  .quick-win-delete:hover {
    color: var(--error);
  }

  .quick-win-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
  }

  .quick-win-show-done {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .quick-win-show-done:hover {
    background: var(--surface);
    color: var(--text);
  }

  /* Roadblocked Card */
  .blocked-card-wrapper {
    flex-shrink: 0;
    align-self: stretch;
    display: flex;
    position: relative;
  }

  .blocked-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-sm) var(--space-md);
    min-width: 160px;
    max-width: 200px;
    height: 88px;
    box-sizing: border-box;
    background: var(--bg);
    border: 2px solid var(--warning);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
  }

  .blocked-card:hover {
    border-color: var(--warning);
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.15);
  }

  .blocked-card.expanded {
    border-color: var(--warning);
    background: linear-gradient(135deg, var(--bg), rgba(245, 158, 11, 0.05));
  }

  .blocked-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .blocked-card-icon {
    font-size: 14px;
  }

  .blocked-card-titles {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .blocked-card-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
  }

  .blocked-card-repo {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .blocked-card-count {
    font-size: 11px;
    font-weight: 600;
    background: var(--warning);
    color: white;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }

  .blocked-card-preview {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding-top: var(--space-xs);
    overflow: hidden;
  }

  .blocked-preview-title {
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .blocked-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .blocked-dropdown {
    position: fixed;
    top: 70px;
    right: var(--space-lg);
    min-width: 320px;
    max-width: 400px;
    background: var(--bg);
    border: 1px solid var(--warning);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-sm);
    z-index: 1000;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }

  .app.has-detail .blocked-dropdown {
    right: calc(400px + var(--space-lg) + var(--space-md));
  }

  .blocked-header {
    font-size: 11px;
    color: var(--text-muted);
    padding: var(--space-xs) var(--space-sm);
    margin-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border);
  }

  .blocked-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .blocked-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-sm);
    background: var(--surface);
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--warning);
  }

  .blocked-area-code {
    font-size: 10px;
    font-weight: 600;
    color: var(--warning);
    text-transform: uppercase;
  }

  .blocked-item-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
  }

  .blocked-item-desc {
    font-size: 11px;
    color: var(--text-muted);
  }

  .blocked-actions {
    padding: var(--space-sm);
    text-align: center;
  }

  .blocked-hint {
    font-size: 10px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  /* Status blocked style */
  .status-blocked {
    color: var(--warning);
  }

  .todo-item.status-blocked {
    border-left-color: var(--warning);
    background: rgba(245, 158, 11, 0.05);
  }

  .meta-status.status-blocked {
    background: rgba(245, 158, 11, 0.15);
    color: var(--warning);
  }

  /* Quick Queue Form */
  .repo-card-queue-form {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-top: 2px;
  }

  .repo-card-queue-form input {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    font-size: 11px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text);
  }

  .repo-card-queue-form input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .repo-card-queue-form button {
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--primary);
    color: white;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .repo-card-queue-form button:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .repo-card-queue-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .repo-card-queue-form .cancel-btn {
    background: transparent;
    color: var(--text-muted);
    border-color: transparent;
  }

  .repo-card-queue-form .cancel-btn:hover {
    color: var(--error);
  }

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
  .context-bar.impromptu { border-left: 3px solid var(--warning); }
  .context-bar.quickwin { border-left: 3px solid #f59e0b; }

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
    gap: 6px;
    flex: 1;
    max-width: 400px;
  }

  .capture-input {
    flex: 1;
    padding: 8px 12px;
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
  }

  .capture-input:focus {
    border-color: var(--primary);
    outline: none;
  }

  .capture-input::placeholder {
    color: var(--text-muted);
    font-size: 13px;
  }

  .btn-capture {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--primary);
    color: white;
    font-size: 16px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-capture:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn-capture:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-expand-capture {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-expand-capture:hover {
    background: var(--surface-hover);
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
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
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

  .session-badge.debug {
    background: var(--error);
  }

  .session-badge.impromptu {
    background: var(--warning);
    color: var(--text);
  }

  .session-badge.quickwin {
    background: #f59e0b;  /* amber/gold */
    color: #1a1a1a;
  }

  .session-card.quickwin {
    border-left: 3px solid #f59e0b;
  }

  .session-task-title {
    font-weight: 600;
    font-size: 16px;
    line-height: 1.4;
    margin-bottom: var(--space-md);
  }

  .session-time {
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .session-iteration {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--accent);
    background: var(--accent-bg);
    padding: 2px 6px;
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
    flex: 1;
  }

  .item-time {
    font-size: 12px;
    color: var(--muted);
    font-weight: 400;
  }

  .session-current.complete {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid var(--success);
  }

  .session-current.complete .current-icon {
    color: var(--success);
  }

  .session-current.complete .current-item {
    color: var(--success);
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
    z-index: 50; /* Above content, below dropdowns */
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
    line-height: 1.6;
  }

  /* Markdown rendering styles */
  .detail-desc :global(strong),
  .detail-desc :global(b) {
    color: var(--text);
    font-weight: 600;
  }

  .detail-desc :global(em),
  .detail-desc :global(i) {
    font-style: italic;
  }

  .detail-desc :global(code) {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: monospace;
    font-size: 0.9em;
  }

  .detail-desc :global(a) {
    color: var(--primary);
    text-decoration: underline;
  }

  .bug-description :global(strong),
  .bug-description :global(b) {
    font-weight: 600;
  }

  .bug-description :global(code) {
    background: var(--bg-tertiary);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    font-family: monospace;
    font-size: 0.9em;
  }

  /* Handover Note in Detail Panel */
  .detail-handover {
    background: var(--info-bg);
    border: 1px solid var(--info);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .handover-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .handover-icon {
    font-size: 14px;
  }

  .handover-label {
    font-weight: 600;
    font-size: 13px;
    color: var(--info);
  }

  .handover-meta {
    font-size: 11px;
    color: var(--text-muted);
    margin-left: auto;
  }

  .handover-content {
    font-size: 13px;
    color: var(--text);
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg);
    border-left: 3px solid var(--info);
    border-radius: var(--radius-sm);
    white-space: pre-wrap;
  }

  /* Item with handover note */
  .item.has-handover {
    background: rgba(59, 130, 246, 0.05);
  }

  .item-handover {
    font-size: 12px;
    margin-left: auto;
    opacity: 0.8;
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
