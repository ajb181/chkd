<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { marked } from 'marked';
  import { getSpec, getSession, setSessionState, tickItem, skipItem as skipItemApi, editItem as editItemApi, deleteItem as deleteItemApi, addChildItem as addChildItemApi, moveItem as moveItemApi, setPriority as setPriorityApi, setTags as setTagsApi, getRepos, addRepo, getProposals, getQueue, addToQueue, removeFromQueue, getBugs, polishBug, getQuickWins, createQuickWin, completeQuickWin, deleteQuickWin, getItemDurations, getAnchor, setAnchor, clearAnchor, getAttachments, attachFile, deleteAttachment, uploadAttachment, getWorkers, getSignals, spawnWorker, deleteWorker, updateWorker, dismissSignal, resolveWorkerConflict, getEpics } from '$lib/api';
  import type { EpicWithProgress } from '$lib/api';
  import type { Attachment, Worker, ManagerSignal, WorkerStatus } from '$lib/api';
  import type { ParsedSpec, SpecArea, SpecItem, Session, ItemStatus, Priority, Repository, QueueItem, Bug, HandoverNote, QuickWin, AnchorInfo } from '$lib/api';
  import FeatureCapture from '$lib/components/FeatureCapture.svelte';
  import SplitBrainView from '$lib/components/SplitBrainView.svelte';
  import ConflictResolution from '$lib/components/ConflictResolution.svelte';

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
    lastActivity: string | null; // ISO timestamp of last activity
    workers: Worker[];           // Active workers for this repo
    signals: ManagerSignal[];    // Active signals needing attention
  }
  let repoStatuses: Map<string, RepoStatus> = new Map();

  // Quick queue input for repo cards
  let quickQueueRepoId: string | null = null;
  let quickQueueInput = getDraft('queueInput');

  // Spawn worker modal
  let showSpawnWorker = false;
  let spawnWorkerRepoId: string | null = null;
  let spawnTaskId = '';
  let spawnTaskTitle = '';
  let spawningWorker = false;

  // Conflict resolution modal
  let showConflictResolution = false;
  let conflictWorker: Worker | null = null;
  let conflictSignal: ManagerSignal | null = null;

  // Drag-to-scroll for repo cards
  let repoCardsScrollEl: HTMLElement;
  let isDragging = false;
  let hasDragged = false;
  let dragStartX = 0;
  let scrollStartX = 0;
  const DRAG_THRESHOLD = 5;

  function handleDragStart(e: MouseEvent) {
    // Skip inputs but allow buttons (we'll handle click prevention)
    if ((e.target as HTMLElement).closest('input')) return;
    isDragging = true;
    hasDragged = false;
    dragStartX = e.pageX;
    scrollStartX = repoCardsScrollEl.scrollLeft;
  }

  function handleDragMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = e.pageX - dragStartX;
    if (Math.abs(dx) > DRAG_THRESHOLD) {
      hasDragged = true;
      repoCardsScrollEl.style.cursor = 'grabbing';
      repoCardsScrollEl.style.userSelect = 'none';
    }
    if (hasDragged) {
      e.preventDefault();
      repoCardsScrollEl.scrollLeft = scrollStartX - dx;
    }
  }

  function handleDragEnd() {
    isDragging = false;
    repoCardsScrollEl.style.cursor = 'grab';
    repoCardsScrollEl.style.userSelect = '';
    // Reset hasDragged after a tick to allow click handler to check it
    setTimeout(() => { hasDragged = false; }, 0);
  }

  function handleCardClick(e: MouseEvent, callback: () => void) {
    // If user dragged, don't trigger the click
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    callback();
  }
  $: saveDraft('queueInput', quickQueueInput);

  // Get repoPath from URL or use first available repo
  let repoPath = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('repo') || ''
    : '';

  let spec: ParsedSpec | null = null;
  let session: Session | null = null;
  let anchor: AnchorInfo | null = null;
  let anchorOnTrack = true;
  let settingAnchor = false;
  let loading = true;
  let error: string | null = null;

  // View mode
  type ViewMode = 'areas' | 'todo' | 'epic';
  let viewMode: ViewMode = 'todo';

  // Epics
  let epics: EpicWithProgress[] = [];
  let collapsedEpics: Set<string> = new Set();

  function toggleEpicCollapse(slug: string) {
    if (collapsedEpics.has(slug)) {
      collapsedEpics.delete(slug);
    } else {
      collapsedEpics.add(slug);
    }
    collapsedEpics = collapsedEpics; // trigger reactivity
  }

  // Open file in editor (uses vscode:// URL scheme)
  function openFile(filePath: string) {
    // Try VS Code URL scheme first
    window.open(`vscode://file${filePath}`, '_blank');
  }

  // Tag filtering
  let selectedTagFilter: string | null = null;

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
  let editStory = '';

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
  let newBugSeverity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
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

  // Bug creation attachment
  let bugCreationFile: File | null = null;
  let bugCreationFileInputRef: HTMLInputElement;

  function handleBugCreationFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      bugCreationFile = input.files[0];
    }
  }

  function clearBugCreationFile() {
    bugCreationFile = null;
    if (bugCreationFileInputRef) bugCreationFileInputRef.value = '';
  }

  // Bug attachments
  let bugAttachments: Map<string, Attachment[]> = new Map();
  let attachingFile = false;
  let bugFileInput: HTMLInputElement;

  async function loadBugAttachments(bugId: string) {
    const res = await getAttachments(repoPath, 'bug', bugId);
    if (res.success && res.data) {
      bugAttachments.set(bugId, res.data);
      bugAttachments = bugAttachments; // Trigger reactivity
    }
  }

  async function handleBugFileSelect(bugId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || attachingFile) return;

    attachingFile = true;
    try {
      const res = await uploadAttachment(repoPath, 'bug', bugId, file);
      if (res.success) {
        await loadBugAttachments(bugId);
      }
    } finally {
      attachingFile = false;
      input.value = ''; // Reset input
    }
  }

  async function handleDeleteAttachment(filename: string, bugId: string) {
    const res = await deleteAttachment(repoPath, filename);
    if (res.success) {
      await loadBugAttachments(bugId);
    }
  }

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
  let expandedQuickWinId: string | null = null;

  // Quick Win attachments
  let qwAttachments: Map<string, Attachment[]> = new Map();
  let qwAttachingFile = false;

  $: openQuickWins = quickWins.filter(w => w.status === 'open');

  // Recent Activity
  import { getRecentSpec, type RecentSpecItem } from '$lib/api';
  let recentAdded: RecentSpecItem[] = [];
  let recentCompleted: RecentSpecItem[] = [];
  let recentExpanded = false;

  async function loadRecentActivity() {
    if (!repoPath) return;
    const res = await getRecentSpec(repoPath);
    if (res.success && res.data) {
      recentAdded = res.data.recentAdded;
      recentCompleted = res.data.recentCompleted;
    }
  }

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

  async function loadQWAttachments(winId: string) {
    const res = await getAttachments(repoPath, 'quickwin', winId);
    if (res.success && res.data) {
      qwAttachments.set(winId, res.data);
      qwAttachments = qwAttachments; // Trigger reactivity
    }
  }

  async function handleQWFileSelect(winId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || qwAttachingFile) return;

    qwAttachingFile = true;
    try {
      const res = await uploadAttachment(repoPath, 'quickwin', winId, file);
      if (res.success) {
        await loadQWAttachments(winId);
      }
    } finally {
      qwAttachingFile = false;
      input.value = ''; // Reset input
    }
  }

  async function handleDeleteQWAttachment(filename: string, winId: string) {
    const res = await deleteAttachment(repoPath, filename);
    if (res.success) {
      await loadQWAttachments(winId);
    }
  }

  function toggleQuickWinExpand(win: QuickWin) {
    if (expandedQuickWinId === win.id) {
      expandedQuickWinId = null;
    } else {
      expandedQuickWinId = win.id;
      loadQWAttachments(win.id);
    }
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

  async function cycleBugSeverity(bug: Bug) {
    const severities: Array<'critical' | 'high' | 'medium' | 'low'> = ['low', 'medium', 'high', 'critical'];
    const currentIdx = severities.indexOf(bug.severity as any);
    const nextSeverity = severities[(currentIdx + 1) % severities.length];

    await fetch('/api/bugs/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bugId: bug.id,
        title: bug.title,
        description: bug.description,
        severity: nextSeverity
      })
    });
    await loadBugs();
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

  function formatTimeAgo(isoString: string | null): string | null {
    if (!isoString) return null;
    const date = new Date(isoString + 'Z'); // Add Z for UTC
    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return null;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  onMount(() => {
    let interval: ReturnType<typeof setInterval>;

    // Load repos first, then set up polling
    (async () => {
      await loadRepos();
      await loadData();
    })();

    // Poll for updates every 2 seconds
    interval = setInterval(async () => {
      await loadData();
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
          queueCount: queueRes.data?.items?.length || 0,
          lastActivity: sessionRes.data?.lastActivity || null
        };
        return { repoId: repo.id, status };
      } catch {
        return { repoId: repo.id, status: { currentTask: null, currentItem: null, status: 'idle' as const, repoProgress: 0, taskProgress: 0, completedItems: 0, totalItems: 0, queueCount: 0, lastActivity: null } };
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
      const [specRes, sessionRes, proposalsRes, queueRes, bugsRes, quickWinsRes, durationsRes, anchorRes, workersRes, signalsRes, recentRes, epicsRes] = await Promise.all([
        getSpec(repoPath),
        getSession(repoPath),
        getProposals(repoPath),
        getQueue(repoPath),
        getBugs(repoPath),
        getQuickWins(repoPath),
        getItemDurations(repoPath),
        getAnchor(repoPath),
        getWorkers(repoPath),
        getSignals(repoPath, true), // activeOnly
        getRecentSpec(repoPath),
        getEpics(repoPath)
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

      if (recentRes.success && recentRes.data) {
        recentAdded = recentRes.data.recentAdded;
        recentCompleted = recentRes.data.recentCompleted;
      }

      if (epicsRes.success && epicsRes.data) {
        epics = epicsRes.data;
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

      if (anchorRes.success && anchorRes.data) {
        anchor = anchorRes.data.anchor;
        anchorOnTrack = anchorRes.data.onTrack;
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

        // Get active workers (not merged/cancelled)
        const activeWorkers = (workersRes.success && Array.isArray(workersRes.data))
          ? workersRes.data.filter((w: Worker) => !['merged', 'cancelled'].includes(w.status))
          : [];

        // Get active signals (not dismissed)
        const activeSignals = (signalsRes.success && Array.isArray(signalsRes.data))
          ? signalsRes.data
          : [];

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
          queueCount: queueItems.length,
          lastActivity: session?.lastActivity || null,
          workers: activeWorkers,
          signals: activeSignals
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

  // Manual session state control
  async function handleSetSessionState(status: string, mode?: string) {
    if (!repoPath) return;
    const res = await setSessionState(repoPath, status, mode);
    if (res.success) {
      await loadData();
    }
  }

  // Click to tick checklist item
  async function handleTickItem(itemId: string) {
    if (!repoPath) return;
    const res = await tickItem(repoPath, itemId);
    if (res.success) {
      await loadData();
    }
  }

  // Delete a child/subtask item
  async function handleDeleteChild(childId: string) {
    if (!repoPath) return;
    const res = await deleteItemApi(repoPath, childId);
    if (res.success) {
      await loadData();
    }
  }

  // Add a child/subtask to an item
  let newSubtaskInput = '';
  let addingSubtask = false;
  async function handleAddSubtask(parentId: string) {
    if (!repoPath || !newSubtaskInput.trim() || addingSubtask) return;
    addingSubtask = true;
    try {
      const res = await addChildItemApi(repoPath, parentId, newSubtaskInput.trim());
      if (res.success) {
        newSubtaskInput = '';
        await loadData();
      }
    } finally {
      addingSubtask = false;
    }
  }

  // Edit subtask title inline
  let editingChildId: string | null = null;
  let editingChildTitle = '';
  function startEditChild(childId: string, currentTitle: string) {
    editingChildId = childId;
    editingChildTitle = currentTitle;
  }
  async function saveEditChild() {
    if (!repoPath || !editingChildId || !editingChildTitle.trim()) return;
    const res = await editItemApi(repoPath, editingChildId, editingChildTitle.trim());
    if (res.success) {
      editingChildId = null;
      editingChildTitle = '';
      await loadData();
    }
  }
  function cancelEditChild() {
    editingChildId = null;
    editingChildTitle = '';
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

  // Signal handlers
  async function handleDismissSignal(signalId: string) {
    try {
      const res = await dismissSignal(signalId);
      if (res.success) {
        await loadData();
      }
    } catch (e) {
      console.error('Failed to dismiss signal:', e);
    }
  }

  async function handleSignalAction(signal: ManagerSignal, action: string) {
    console.log('Signal action:', signal.id, action);

    // Handle conflict resolution actions
    if (action === 'View Conflicts' && isConflictSignal(signal)) {
      const worker = getWorkerForSignal(signal);
      if (worker) {
        openConflictResolution(worker, signal);
        return;
      }
    }

    // Handle quick conflict resolution from signal actions
    if (action === 'Keep Worker Changes' && signal.workerId) {
      await resolveWorkerConflict(signal.workerId, 'ours');
      await handleDismissSignal(signal.id);
      await loadData();
      return;
    }

    if (action === 'Keep Main' && signal.workerId) {
      await resolveWorkerConflict(signal.workerId, 'theirs');
      await handleDismissSignal(signal.id);
      await loadData();
      return;
    }

    if (action === 'Abort' && signal.workerId) {
      await resolveWorkerConflict(signal.workerId, 'abort');
      await handleDismissSignal(signal.id);
      await loadData();
      return;
    }

    // Default: just dismiss the signal
    await handleDismissSignal(signal.id);
  }

  // Spawn worker handlers
  function openSpawnWorker(repo: Repository) {
    spawnWorkerRepoId = repo.id;
    spawnTaskId = '';
    spawnTaskTitle = '';
    showSpawnWorker = true;
  }

  async function handleSpawnWorker() {
    if (!spawnWorkerRepoId || !spawnTaskId.trim() || !spawnTaskTitle.trim() || spawningWorker) return;

    const repo = repos.find(r => r.id === spawnWorkerRepoId);
    if (!repo) return;

    spawningWorker = true;
    try {
      const res = await spawnWorker(repo.path, spawnTaskId.trim(), spawnTaskTitle.trim());
      if (res.success) {
        showSpawnWorker = false;
        spawnWorkerRepoId = null;
        spawnTaskId = '';
        spawnTaskTitle = '';
        await loadData();
      } else {
        console.error('Failed to spawn worker:', res.error);
      }
    } finally {
      spawningWorker = false;
    }
  }

  // Worker action handlers
  async function handleWorkerAction(workerId: string, action: 'pause' | 'resume' | 'stop') {
    try {
      if (action === 'stop') {
        const res = await deleteWorker(workerId, true);
        if (res.success) {
          await loadData();
        }
      } else {
        const status = action === 'pause' ? 'paused' : 'working';
        const res = await updateWorker(workerId, { status });
        if (res.success) {
          await loadData();
        }
      }
    } catch (e) {
      console.error(`Failed to ${action} worker:`, e);
    }
  }

  function handleViewWorkerCode(worktreePath: string | null) {
    if (!worktreePath) return;
    // Show the worktree path to the user
    console.log('View code at:', worktreePath);
    alert(`Worker code is at:\n${worktreePath}`);
  }

  // Conflict resolution handlers
  function openConflictResolution(worker: Worker, signal: ManagerSignal) {
    conflictWorker = worker;
    conflictSignal = signal;
    showConflictResolution = true;
  }

  async function handleResolveConflict(e: CustomEvent<{ workerId: string; strategy: 'ours' | 'theirs' | 'abort'; signalId: string }>) {
    const { workerId, strategy, signalId } = e.detail;
    try {
      const res = await resolveWorkerConflict(workerId, strategy);
      if (res.success) {
        showConflictResolution = false;
        conflictWorker = null;
        conflictSignal = null;
        await loadData();
      } else {
        console.error('Failed to resolve conflict:', res.error);
        alert(`Failed to resolve conflict: ${res.error}`);
      }
    } catch (error) {
      console.error('Error resolving conflict:', error);
    }
  }

  // Check if a signal is a conflict signal that can be resolved
  function isConflictSignal(signal: ManagerSignal): boolean {
    return signal.type === 'help' &&
           signal.actionRequired === true &&
           signal.actionOptions?.includes('View Conflicts');
  }

  // Find worker for a signal
  function getWorkerForSignal(signal: ManagerSignal): Worker | null {
    if (!signal.workerId || !currentRepo) return null;
    const status = repoStatuses.get(currentRepo.id);
    if (!status?.workers) return null;
    return status.workers.find(w => w.id === signal.workerId) || null;
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
      body: JSON.stringify({ repoPath, title, severity: newBugSeverity })
    });
    const data = await res.json();
    if (data.success) {
      const newBugId = data.data?.id;

      // Attach file if one was selected during creation
      if (bugCreationFile && newBugId) {
        await uploadAttachment(repoPath, 'bug', newBugId, bugCreationFile);
        clearBugCreationFile();
      }

      bugInput = '';
      newBugSeverity = 'medium';
      bugPolishPending = false;
      bugOriginalTitle = '';
      bugPolishedTitle = '';
      // Refresh bugs
      const bugsRes = await getBugs(repoPath);
      if (bugsRes.success && bugsRes.data) {
        bugs = bugsRes.data;
      }
      bugsExpanded = true;

      // If we attached a file, expand the bug to show it
      if (newBugId && bugCreationFile) {
        expandedBugId = newBugId;
        loadBugAttachments(newBugId);
      }
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

  async function handleSetAnchor(item: SpecItem) {
    settingAnchor = true;
    try {
      await setAnchor(repoPath, item.id, item.title);
      await loadData();
    } finally {
      settingAnchor = false;
    }
  }

  async function handleClearAnchor() {
    settingAnchor = true;
    try {
      await clearAnchor(repoPath);
      await loadData();
    } finally {
      settingAnchor = false;
    }
  }

  function startEdit() {
    if (!selectedFeature) return;
    editTitle = selectedFeature.item.title;
    editDescription = selectedFeature.item.description;
    editStory = selectedFeature.item.story || '';
    editing = true;
  }

  async function saveEdit() {
    if (!selectedFeature) return;
    await editItemApi(repoPath, selectedFeature.item.id, editTitle, editDescription, editStory);
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

  // Tags editing
  let editingTags = false;
  let tagInput = '';
  let savingTags = false;

  function startEditTags() {
    if (!selectedFeature) return;
    editingTags = true;
    tagInput = selectedFeature.item.tags.join(' ');
  }

  function cancelEditTags() {
    editingTags = false;
    tagInput = '';
  }

  async function saveTagsEdit() {
    if (!selectedFeature) return;
    savingTags = true;
    try {
      // Parse tags from input: space-separated, lowercase, alphanumeric + hyphens/underscores
      const tags = tagInput
        .split(/\s+/)
        .map(t => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(t => t.length > 0 && /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/.test(t));

      await setTagsApi(repoPath, selectedFeature.item.id, tags);
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

      editingTags = false;
      tagInput = '';
    } finally {
      savingTags = false;
    }
  }

  // Spec item attachments
  let itemAttachments: Attachment[] = [];
  let itemAttaching = false;

  async function loadItemAttachments(itemId: string) {
    const res = await getAttachments(repoPath, 'item', itemId);
    if (res.success && res.data) {
      itemAttachments = res.data;
    } else {
      itemAttachments = [];
    }
  }

  async function handleItemFileSelect(event: Event) {
    if (!selectedFeature) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || itemAttaching) return;

    itemAttaching = true;
    try {
      const res = await uploadAttachment(repoPath, 'item', selectedFeature.item.id, file);
      if (res.success) {
        await loadItemAttachments(selectedFeature.item.id);
      }
    } finally {
      itemAttaching = false;
      input.value = ''; // Reset input
    }
  }

  async function handleDeleteItemAttachment(filename: string) {
    if (!selectedFeature) return;
    const res = await deleteAttachment(repoPath, filename);
    if (res.success) {
      await loadItemAttachments(selectedFeature.item.id);
    }
  }

  // Load attachments when feature is selected
  $: if (selectedFeature) {
    loadItemAttachments(selectedFeature.item.id);
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

  // Get epic tags for an item (tags that match known epic tags)
  function getItemEpicTags(item: SpecItem): string[] {
    if (!item.tags || item.tags.length === 0) return [];
    const epicTags = epics.map(e => e.tag);
    return item.tags.filter(t => epicTags.includes(t));
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

  // Collect all unique tags from spec
  $: allTags = (() => {
    if (!spec) return [];
    const tags = new Set<string>();
    const collectTags = (items: SpecItem[]) => {
      for (const item of items) {
        for (const tag of item.tags || []) {
          tags.add(tag);
        }
        collectTags(item.children);
      }
    };
    for (const area of spec.areas) {
      collectTags(area.items);
    }
    return Array.from(tags).sort();
  })();

  // Filter areas by tag (if selected)
  $: filteredAreas = (() => {
    if (!spec) return [];
    const areas = spec.areas.filter(a => a.items.length > 0);
    if (!selectedTagFilter) return areas;

    // Filter items within each area by tag
    return areas.map(area => {
      const filterItems = (items: SpecItem[]): SpecItem[] => {
        return items.filter(item => {
          const hasTag = item.tags?.includes(selectedTagFilter!) || false;
          const childrenWithTag = filterItems(item.children);
          return hasTag || childrenWithTag.length > 0;
        }).map(item => ({
          ...item,
          children: filterItems(item.children)
        }));
      };
      return {
        ...area,
        items: filterItems(area.items)
      };
    }).filter(area => area.items.length > 0);
  })();

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
  $: groupedTodos = (() => {
    if (!spec) return [];
    const todos = getGroupedTodos();
    if (!selectedTagFilter) return todos;

    // Filter items by tag
    return todos.map(group => ({
      ...group,
      items: group.items.filter(({ item }) => item.tags?.includes(selectedTagFilter!) || false)
    })).filter(group => group.items.length > 0);
  })();

  // Keyboard handler for closing popups
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
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
    <div
      class="repo-cards-scroll"
      bind:this={repoCardsScrollEl}
      on:mousedown={handleDragStart}
      on:mousemove={handleDragMove}
      on:mouseup={handleDragEnd}
      on:mouseleave={handleDragEnd}
      role="region"
      aria-label="Repository cards"
    >
      <button class="repo-card repo-card-add" on:click={(e) => handleCardClick(e, () => showAddRepo = true)} title="Add Repository">
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
          on:click={(e) => handleCardClick(e, () => selectRepo(repo))}
        >
          <div class="repo-card-header">
            <span class="repo-card-name">{repo.name}</span>
            <div class="repo-card-badges">
              {#if status?.lastActivity && status.status !== 'idle'}
                {@const timeAgo = formatTimeAgo(status.lastActivity)}
                {#if timeAgo}
                  <span class="repo-card-activity" title="Last activity">{timeAgo}</span>
                {/if}
              {/if}
              {#if status?.queueCount && status.queueCount > 0}
                <span class="repo-card-queue-badge" title="Messages in queue">{status.queueCount}</span>
              {/if}
              {#if status?.workers && status.workers.length > 0}
                {@const workingCount = status.workers.filter(w => w.status === 'working').length}
                {@const conflictCount = status.workers.filter(w => w.status === 'paused').length}
                {@const mergingCount = status.workers.filter(w => w.status === 'merging').length}
                <span class="repo-card-workers-badge" title="{status.workers.length} worker{status.workers.length > 1 ? 's' : ''}" class:has-conflict={conflictCount > 0}>
                  {#if conflictCount > 0}⚠️{:else if mergingCount > 0}🟡{:else}🟢{/if}
                  {status.workers.length}
                </span>
              {/if}
              {#if status?.signals && status.signals.length > 0}
                <span class="repo-card-signals-badge" title="Signals needing attention">
                  🔔 {status.signals.length}
                </span>
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
          <!-- Workers Strip -->
          {#if status?.workers && status.workers.length > 0}
            <div class="repo-card-workers">
              {#each status.workers.slice(0, 3) as worker}
                <div class="worker-chip" class:working={worker.status === 'working'} class:merging={worker.status === 'merging'} class:paused={worker.status === 'paused'} class:error={worker.status === 'error'} title="{worker.taskTitle || worker.taskId || 'Worker'}: {worker.message || worker.status}">
                  <span class="worker-status">
                    {#if worker.status === 'working'}🟢{:else if worker.status === 'merging'}🟡{:else if worker.status === 'paused'}⚠️{:else if worker.status === 'error'}🔴{:else}⏸️{/if}
                  </span>
                  <span class="worker-task">{worker.taskId || 'W'}</span>
                  {#if worker.progress > 0}
                    <span class="worker-progress">{worker.progress}%</span>
                  {/if}
                </div>
              {/each}
              {#if status.workers.length > 3}
                <span class="workers-more">+{status.workers.length - 3}</span>
              {/if}
            </div>
          {/if}
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
        <!-- Spawn Worker button -->
        <button
          class="repo-card-spawn-btn"
          on:click|stopPropagation={() => openSpawnWorker(repo)}
          title="Spawn a worker"
        >
          👷
        </button>
        <!-- Signal preview (show first actionable signal) -->
        {#if status?.signals && status.signals.length > 0}
          {@const topSignal = status.signals[0]}
          <div class="repo-card-signal" class:help={topSignal.type === 'help'} class:warning={topSignal.type === 'warning'} class:decision={topSignal.type === 'decision'}>
            <span class="signal-icon">
              {#if topSignal.type === 'help'}🆘{:else if topSignal.type === 'warning'}⚠️{:else if topSignal.type === 'decision'}❓{:else}ℹ️{/if}
            </span>
            <span class="signal-msg">{topSignal.message.length > 50 ? topSignal.message.slice(0, 47) + '...' : topSignal.message}</span>
            {#if topSignal.actionRequired && topSignal.actionOptions}
              <div class="signal-actions">
                {#each topSignal.actionOptions.slice(0, 2) as action}
                  <button class="signal-action-btn" on:click|stopPropagation={() => handleSignalAction(topSignal, action)}>{action}</button>
                {/each}
              </div>
            {/if}
            <button class="signal-dismiss" on:click|stopPropagation={() => handleDismissSignal(topSignal.id)} title="Dismiss">×</button>
          </div>
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
          <!-- Bug input area -->
          <div class="bug-input-area">
            <div class="bug-input-row">
              <div class="bug-severity-picker">
                <button type="button" class:selected={newBugSeverity === 'critical'} on:click={() => newBugSeverity = 'critical'} title="Critical">🔴</button>
                <button type="button" class:selected={newBugSeverity === 'high'} on:click={() => newBugSeverity = 'high'} title="High">🟠</button>
                <button type="button" class:selected={newBugSeverity === 'medium'} on:click={() => newBugSeverity = 'medium'} title="Medium">🟡</button>
                <button type="button" class:selected={newBugSeverity === 'low'} on:click={() => newBugSeverity = 'low'} title="Low">🟢</button>
              </div>
              <textarea
                class="bug-textarea"
                placeholder="Describe the bug..."
                bind:value={bugInput}
                disabled={addingBug}
                rows="2"
                on:input={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddBug(); }}}
              ></textarea>
            </div>
            <div class="bug-input-actions">
              <input
                type="file"
                bind:this={bugCreationFileInputRef}
                on:change={handleBugCreationFileSelect}
                style="display: none;"
              />
              <button
                class="bug-attach-btn"
                class:has-file={bugCreationFile}
                type="button"
                title={bugCreationFile ? `Attached: ${bugCreationFile.name} (click to remove)` : 'Attach file'}
                on:click={() => {
                  if (bugCreationFile) {
                    clearBugCreationFile();
                  } else {
                    bugCreationFileInputRef?.click();
                  }
                }}
              >
                {bugCreationFile ? '📎✓' : '📎'}
              </button>
              <button class="bug-submit-btn" on:click={handleAddBug} disabled={!bugInput.trim() || addingBug}>
                {addingBug ? 'Adding...' : 'Add Bug'}
              </button>
            </div>
          </div>

          <!-- AI polish suggestion (inline, non-blocking) -->
          {#if bugPolishPending}
            <div class="bug-polish-inline">
              <div class="polish-suggestion">
                <span class="polish-icon">✨</span>
                <span class="polish-text">{bugPolishedTitle}</span>
              </div>
              <div class="polish-actions">
                <button class="polish-use" on:click={acceptBugPolish}>Use</button>
                <button class="polish-dismiss" on:click={cancelBugPolish}>×</button>
              </div>
            </div>
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
                  <button class="bug-item-header" on:click={() => { expandedBugId = isExpanded ? null : bug.id; if (!isExpanded) loadBugAttachments(bug.id); }}>
                    <code class="bug-id-code" title="Click to copy" on:click|stopPropagation={() => navigator.clipboard.writeText(bug.id.slice(0, 6))}>{bug.id.slice(0, 6)}</code>
                    <span class="bug-severity-btn {bug.severity}" role="button" tabindex="0" title="Click to cycle severity" on:click|stopPropagation={() => cycleBugSeverity(bug)} on:keydown|stopPropagation={(e) => e.key === 'Enter' && cycleBugSeverity(bug)}>
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

                        <!-- Attachments -->
                        {@const attachments = bugAttachments.get(bug.id) || []}
                        <div class="bug-attachments" on:click|stopPropagation>
                          {#if attachments.length > 0}
                            <div class="attachment-list">
                              {#each attachments as att}
                                <div class="attachment-item">
                                  <span class="attachment-icon">📎</span>
                                  <span class="attachment-name" title={att.path}>{att.originalName}</span>
                                  <button class="attachment-delete" on:click={() => handleDeleteAttachment(att.filename, bug.id)} title="Remove">×</button>
                                </div>
                              {/each}
                            </div>
                          {/if}
                          <div class="attachment-upload">
                            <input
                              type="file"
                              class="attachment-file-input"
                              on:change={(e) => handleBugFileSelect(bug.id, e)}
                              disabled={attachingFile}
                            />
                            <button
                              class="attachment-pick-btn"
                              on:click={(e) => e.currentTarget.previousElementSibling?.click()}
                              disabled={attachingFile}
                            >
                              {attachingFile ? 'Uploading...' : '📎 Attach File'}
                            </button>
                          </div>
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
          <!-- Quick add input - redesigned -->
          <div class="qw-input-area">
            <textarea
              class="qw-textarea"
              placeholder="Add a quick win..."
              bind:value={quickWinInput}
              disabled={addingQuickWin}
              rows="2"
              on:input={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
              on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddQuickWin(); }}}
            ></textarea>
            <button class="qw-submit-btn" on:click={handleAddQuickWin} disabled={!quickWinInput.trim() || addingQuickWin}>
              {addingQuickWin ? '...' : 'Add'}
            </button>
          </div>

          {#if displayWins.length === 0}
            <p class="quick-win-empty">{quickWins.length === 0 ? 'No quick wins yet' : 'All done!'}</p>
          {:else}
            <ul class="quick-win-list">
              {#each displayWins as win}
                {@const isExpanded = expandedQuickWinId === win.id}
                {@const attachments = qwAttachments.get(win.id) || []}
                <li class="quick-win-item" class:done={win.status === 'done'} class:editing={editingQuickWinId === win.id} class:expanded={isExpanded}>
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
                    <div class="quick-win-header">
                      <button
                        class="quick-win-check"
                        on:click={() => handleCompleteQuickWin(win)}
                        disabled={win.status === 'done'}
                        title={win.status === 'done' ? 'Done' : 'Mark done'}
                      >
                        {win.status === 'done' ? '✓' : '○'}
                      </button>
                      <span class="quick-win-title" on:click={() => startEditQuickWin(win)} title="Click to edit">{win.title}</span>
                      {#if attachments.length > 0}
                        <span class="quick-win-attachment-count" title="{attachments.length} attachment{attachments.length > 1 ? 's' : ''}">📎{attachments.length}</span>
                      {/if}
                      <button
                        class="quick-win-expand"
                        on:click={() => toggleQuickWinExpand(win)}
                        title={isExpanded ? 'Collapse' : 'Attach files'}
                      >
                        {isExpanded ? '▾' : '📎'}
                      </button>
                      <button
                        class="quick-win-delete"
                        on:click={() => handleDeleteQuickWin(win)}
                        title="Delete"
                      >×</button>
                    </div>
                    {#if isExpanded}
                      <div class="quick-win-details" on:click|stopPropagation>
                        <!-- Attachments -->
                        <div class="qw-attachments">
                          {#if attachments.length > 0}
                            <div class="attachment-list">
                              {#each attachments as att}
                                <div class="attachment-item">
                                  <span class="attachment-icon">📎</span>
                                  <span class="attachment-name" title={att.path}>{att.originalName}</span>
                                  <button class="attachment-delete" on:click={() => handleDeleteQWAttachment(att.filename, win.id)} title="Remove">×</button>
                                </div>
                              {/each}
                            </div>
                          {/if}
                          <div class="attachment-upload">
                            <input
                              type="file"
                              class="attachment-file-input"
                              on:change={(e) => handleQWFileSelect(win.id, e)}
                              disabled={qwAttachingFile}
                            />
                            <button
                              class="attachment-pick-btn"
                              on:click={(e) => e.currentTarget.previousElementSibling?.click()}
                              disabled={qwAttachingFile}
                            >
                              {qwAttachingFile ? 'Uploading...' : '📎 Attach File'}
                            </button>
                          </div>
                        </div>
                      </div>
                    {/if}
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

    <!-- Recent Activity Card -->
    {#if recentAdded.length > 0 || recentCompleted.length > 0}
    <div class="recent-card-wrapper">
      <button
        class="recent-card"
        class:expanded={recentExpanded}
        on:click={() => recentExpanded = !recentExpanded}
      >
        <div class="recent-card-header">
          <span class="recent-card-icon">📊</span>
          <div class="recent-card-titles">
            <span class="recent-card-title">Recent</span>
            <span class="recent-card-repo">{currentRepo?.name || 'No repo'}</span>
          </div>
          <span class="recent-card-count">{recentAdded.length + recentCompleted.length}</span>
        </div>
        {#if recentCompleted.length > 0}
          <div class="recent-card-preview">
            <span class="recent-preview-icon">✓</span>
            <span class="recent-preview-title">{recentCompleted[0].title}</span>
          </div>
        {:else if recentAdded.length > 0}
          <div class="recent-card-preview">
            <span class="recent-preview-icon">+</span>
            <span class="recent-preview-title">{recentAdded[0].title}</span>
          </div>
        {/if}
      </button>

      <!-- Recent dropdown panel -->
      {#if recentExpanded}
        <div class="recent-backdrop" on:click={() => recentExpanded = false}></div>
        <div class="recent-dropdown">
          {#if recentCompleted.length > 0}
            <div class="recent-section">
              <h4 class="recent-section-title">Recently Completed</h4>
              <ul class="recent-list">
                {#each recentCompleted as item}
                  <li class="recent-item completed">
                    <span class="recent-item-icon">✓</span>
                    <span class="recent-item-id">{item.id}</span>
                    <span class="recent-item-title">{item.title}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if recentAdded.length > 0}
            <div class="recent-section">
              <h4 class="recent-section-title">Recently Added</h4>
              <ul class="recent-list">
                {#each recentAdded as item}
                  <li class="recent-item added">
                    <span class="recent-item-icon">+</span>
                    <span class="recent-item-id">{item.id}</span>
                    <span class="recent-item-title">{item.title}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
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

  <!-- Spawn Worker Modal -->
  {#if showSpawnWorker}
    <div class="modal-overlay" on:click={() => showSpawnWorker = false}>
      <div class="modal" on:click|stopPropagation>
        <h2>Spawn Worker</h2>
        <p class="modal-desc">Spawn a new worker Claude to work on a task in parallel.</p>
        <form on:submit|preventDefault={handleSpawnWorker}>
          <div class="form-group">
            <label for="spawn-task-id">Task ID</label>
            <input
              id="spawn-task-id"
              type="text"
              bind:value={spawnTaskId}
              placeholder="e.g., SD.1, FE.2"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label for="spawn-task-title">Task Title</label>
            <input
              id="spawn-task-title"
              type="text"
              bind:value={spawnTaskTitle}
              placeholder="e.g., Implement user authentication"
              class="form-input"
            />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" on:click={() => showSpawnWorker = false}>
              Cancel
            </button>
            <button type="submit" class="btn-primary" disabled={spawningWorker || !spawnTaskId.trim() || !spawnTaskTitle.trim()}>
              {spawningWorker ? 'Spawning...' : 'Spawn Worker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Conflict Resolution Modal -->
  {#if showConflictResolution && conflictWorker && conflictSignal}
    <ConflictResolution
      worker={conflictWorker}
      signal={conflictSignal}
      on:resolve={handleResolveConflict}
      on:cancel={() => { showConflictResolution = false; conflictWorker = null; conflictSignal = null; }}
    />
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

  <div class="main-area">
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
      <!-- Pending Anchor Card (show when anchor set but idle) -->
      {#if (!session || session.status === 'idle' || !session.currentTask) && anchor}
        <div class="pending-anchor-card">
          <div class="pending-header">
            <span class="pending-badge">🎯 PENDING</span>
            <span class="pending-label">Waiting for Claude</span>
          </div>
          <div class="pending-task">{anchor.title}</div>
          <p class="pending-hint">Claude will see this and start working on it. Or run <code>/chkd {anchor.id}</code></p>
          <button class="btn btn-ghost btn-sm" on:click={handleClearAnchor} disabled={settingAnchor}>
            Clear anchor
          </button>
        </div>
      {/if}

      <!-- Simple How-To Guide (show when no active task AND no anchor) -->
      {#if (!session || session.status === 'idle' || !session.currentTask) && !anchor}
        <div class="how-to-guide">
          <h2>Quick Start</h2>
          <div class="steps">
            <div class="step">
              <span class="step-num">1</span>
              <div class="step-content">
                <strong>Set a task</strong>
                <p>Click a spec item and press "🎯 Set as Active Task" to tell Claude what to work on</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <div class="step-content">
                <strong>Claude starts</strong>
                <p>Claude sees the pending task and kicks it off automatically</p>
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
          <p class="guide-note">Or use CLI: <code>/chkd SD.1</code> in Claude Code</p>
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
            {#if demoMode}
              <span class="session-badge {badgeClass}">{sessionBadge}</span>
            {:else}
              <select
                class="session-state-select {badgeClass}"
                value={activeSession?.mode || 'building'}
                on:change={(e) => handleSetSessionState('building', e.currentTarget.value)}
              >
                <option value="building">BUILDING</option>
                <option value="debugging">DEBUG</option>
                <option value="impromptu">IMPROMPTU</option>
                <option value="quickwin">QUICKWIN</option>
                <option value="idle">IDLE</option>
              </select>
            {/if}
            <span class="session-time">{formatElapsed(activeSession?.elapsedMs || 0)}</span>
            {#if activeSession?.iteration}
              <span class="session-iteration">#{activeSession.iteration}</span>
            {/if}
            {#if activeSession?.lastActivity}
              {@const timeAgo = formatTimeAgo(activeSession.lastActivity)}
              {#if timeAgo && timeAgo !== 'now'}
                <span class="session-activity" title="Last activity from Claude">⚡ {timeAgo}</span>
              {/if}
            {/if}
            {#if demoMode}
              <button class="demo-state-btn" on:click={cycleDemoState}>{currentDemoState.toUpperCase()}</button>
              <button class="demo-toggle" on:click={toggleDemoMode}>Exit Demo</button>
            {/if}
          </div>
          <div class="session-task-title">{@html markedInline(activeSession?.currentTask?.title || '')}</div>

          <!-- Off-track warning (anchor set but working on different task) -->
          {#if !demoMode && anchor && !anchorOnTrack}
            <div class="off-track-warning">
              <span class="warning-icon">⚠️</span>
              <span>Anchor: <strong>{anchor.title}</strong></span>
            </div>
          {/if}

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
                <button
                  class="checklist-item clickable"
                  class:done={item.done}
                  class:current={item.current}
                  on:click={() => handleTickItem(item.id)}
                  title={item.done ? 'Already complete' : 'Click to mark complete'}
                >
                  <span class="check-icon">
                    {#if item.done}✓{:else if item.current}◐{:else}○{/if}
                  </span>
                  <span class="check-title">{@html markedInline(item.title)}</span>
                </button>
              {/each}
            </div>
            <!-- Progress summary -->
            <div class="session-progress-summary">
              <span class="progress-label">{realChecklist.filter(i => i.done).length} / {realChecklist.length} complete</span>
              {#if activeSession?.iteration}
                <span class="progress-iteration">Iteration #{activeSession.iteration}</span>
              {/if}
            </div>
          {:else}
            <!-- No sub-items, show simple status -->
            <div class="session-progress-summary">
              <span class="progress-label">Working on task...</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Split Brain View (Multi-Worker) -->
      {@const currentStatus = currentRepo ? repoStatuses.get(currentRepo.id) : null}
      {#if currentStatus?.workers && currentStatus.workers.length > 0}
        <SplitBrainView
          workers={currentStatus.workers}
          signals={currentStatus.signals || []}
          repoName={currentRepo?.name || ''}
          on:dismisssignal={(e) => handleDismissSignal(e.detail.signalId)}
          on:signalaction={(e) => handleSignalAction(e.detail.signal, e.detail.action)}
          on:pauseworker={(e) => handleWorkerAction(e.detail.workerId, 'pause')}
          on:resumeworker={(e) => handleWorkerAction(e.detail.workerId, 'resume')}
          on:stopworker={(e) => handleWorkerAction(e.detail.workerId, 'stop')}
          on:viewcode={(e) => handleViewWorkerCode(e.detail.worktreePath)}
          on:spawnworker={() => currentRepo && openSpawnWorker(currentRepo)}
        />
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
          <button
            class="toggle-btn"
            class:active={viewMode === 'epic'}
            on:click={() => viewMode = 'epic'}
            title="View items grouped by epic"
          >
            By Epic
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
        <button
          class="filter-toggle-btn"
          class:active={showCompleted}
          on:click={() => showCompleted = !showCompleted}
        >
          {#if showCompleted}
            <span class="toggle-icon">✓</span>
          {:else}
            <span class="toggle-icon">○</span>
          {/if}
          Show completed
        </button>
      </div>

      <!-- Todo List View -->
      {#if viewMode === 'todo'}
        <!-- Tag Filter Bar -->
        {#if allTags.length > 0}
          <div class="tag-filter-bar">
            <span class="tag-filter-label">Filter:</span>
            <button
              class="tag-filter-btn"
              class:active={!selectedTagFilter}
              on:click={() => selectedTagFilter = null}
            >All</button>
            {#each allTags as tag}
              <button
                class="tag-filter-btn"
                class:active={selectedTagFilter === tag}
                on:click={() => selectedTagFilter = selectedTagFilter === tag ? null : tag}
              >#{tag}</button>
            {/each}
          </div>
        {/if}

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
                    {@const itemEpicTags = getItemEpicTags(item)}
                    <div class="todo-item {getStatusClass(item.status)}" class:selected={selectedFeature?.item.id === item.id}>
                      <button class="todo-row" on:click={() => selectFeature(item, area)}>
                        <span class="todo-status">{getStatusIcon(item.status)}</span>
                        <div class="todo-content">
                          <div class="todo-title-row">
                            <span class="todo-title">{@html markedInline(item.title)}</span>
                            {#each itemEpicTags as epicTag}
                              <span class="item-epic-tag" title="Part of epic">#{epicTag}</span>
                            {/each}
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
        <!-- Tag Filter Bar -->
        {#if allTags.length > 0}
          <div class="tag-filter-bar">
            <span class="tag-filter-label">Filter:</span>
            <button
              class="tag-filter-btn"
              class:active={!selectedTagFilter}
              on:click={() => selectedTagFilter = null}
            >All</button>
            {#each allTags as tag}
              <button
                class="tag-filter-btn"
                class:active={selectedTagFilter === tag}
                on:click={() => selectedTagFilter = selectedTagFilter === tag ? null : tag}
              >#{tag}</button>
            {/each}
          </div>
        {/if}

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
                        {@const itemEpicTags = getItemEpicTags(item)}
                        <li class="item {getStatusClass(item.status)}" class:has-handover={!!itemHandover}>
                          <button class="item-row" on:click={() => selectFeature(item, area)}>
                            <span class="item-status">{getStatusIcon(item.status)}</span>
                            <span class="item-title">{@html markedInline(item.title)}</span>
                            {#if item.tags && item.tags.length > 0}
                              <span class="item-tags">
                                {#each item.tags as tag}
                                  <span class="item-tag" class:epic-tag={itemEpicTags.includes(tag)}>#{tag}</span>
                                {/each}
                              </span>
                            {/if}
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

      <!-- Epic View -->
      {#if viewMode === 'epic'}
        {#if epics.length === 0}
          <div class="empty-state">
            <div class="empty-icon">📦</div>
            <p>No epics yet</p>
            <p class="empty-hint">Create an epic with <code>chkd epic "Epic Name"</code></p>
          </div>
        {:else}
          <div class="epic-list">
            {#each epics as epic}
              {@const epicItems = spec?.areas.flatMap(a => a.items.filter(i => i.tags?.includes(epic.tag))) || []}
              {@const filtered = filterItems(epicItems)}
              {@const isCollapsed = collapsedEpics.has(epic.slug)}
              <div class="epic-group" class:complete={epic.status === 'complete'}>
                <div class="epic-header">
                  <div class="epic-status-dot" class:planning={epic.status === 'planning'} class:in-progress={epic.status === 'in-progress'} class:review={epic.status === 'review'} class:complete={epic.status === 'complete'}></div>
                  <h3 class="epic-name">{epic.name}</h3>
                  <span class="epic-tag">#{epic.tag}</span>
                  <div class="epic-progress">
                    <span class="epic-count">{epic.completedCount}/{epic.itemCount}</span>
                    <div class="epic-progress-bar">
                      <div class="epic-progress-fill" style="width: {epic.progress}%"></div>
                    </div>
                  </div>
                  <span class="epic-status-badge {epic.status}">{epic.status}</span>
                </div>

                {#if epic.description}
                  <div class="epic-description">
                    <p>{epic.description}</p>
                    <button class="epic-file-link" on:click={() => openFile(epic.filePath)} title="Open in editor">
                      <span class="file-icon">📄</span>
                      <span class="file-path">{epic.filePath.split('/').slice(-3).join('/')}</span>
                    </button>
                  </div>
                {/if}

                <div class="epic-stories">
                  <button class="epic-stories-header" on:click={() => toggleEpicCollapse(epic.slug)}>
                    <span class="epic-toggle">{isCollapsed ? '▶' : '▼'}</span>
                    <span class="epic-stories-label">Stories ({filtered.length})</span>
                  </button>

                  {#if !isCollapsed}
                    {#if filtered.length > 0}
                      <ul class="epic-items">
                        {#each filtered as item}
                          {@const area = spec?.areas.find(a => a.items.some(i => i.id === item.id))}
                          <li class="epic-item {getStatusClass(item.status)}" title={item.id}>
                            <button class="item-row" on:click={() => area && selectFeature(item, area)}>
                              <span class="item-status">{getStatusIcon(item.status)}</span>
                              <span class="item-title">{@html markedInline(item.title)}</span>
                              {#if item.children.length > 0}
                                {@const childCounts = countItems(item.children)}
                                <span class="item-progress">{childCounts.done}/{childCounts.total}</span>
                              {/if}
                            </button>
                          </li>
                        {/each}
                      </ul>
                    {:else if !filterText}
                      <p class="epic-empty">No items linked yet. Tag items with <code>#{epic.tag}</code></p>
                    {/if}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
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
          rows="2"
        ></textarea>
        <textarea
          bind:value={editStory}
          class="edit-story"
          placeholder="User story (e.g., As a user, I want...)"
          rows="2"
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
          <div class="detail-desc editable" on:click={startEdit} title="Click to edit">
            {@html markedInline(selectedFeature.item.description)}
          </div>
        {:else}
          <div class="detail-desc empty editable" on:click={startEdit} title="Click to add description">
            Add description...
          </div>
        {/if}

        <!-- User story (item-level, or fall back to area-level) -->
        {#if selectedFeature.item.story || selectedFeature.area.story}
          <div class="detail-story editable" on:click={startEdit} title="Click to edit">
            <h3>User Story</h3>
            <blockquote>{@html markedInline(selectedFeature.item.story || selectedFeature.area.story || '')}</blockquote>
          </div>
        {:else}
          <div class="detail-story empty editable" on:click={startEdit} title="Click to add story">
            <h3>User Story</h3>
            <blockquote>Add user story...</blockquote>
          </div>
        {/if}

        <h3>Checklist</h3>
        {#if selectedFeature.item.children.length > 0}
          <ul class="detail-checklist">
            {#each selectedFeature.item.children as child}
              <li class="{getStatusClass(child.status)}">
                {#if editingChildId === child.id}
                  <form class="edit-child-form" on:submit|preventDefault={saveEditChild}>
                    <input
                      type="text"
                      bind:value={editingChildTitle}
                      on:keydown={(e) => e.key === 'Escape' && cancelEditChild()}
                      autofocus
                    />
                    <button type="submit" title="Save">✓</button>
                    <button type="button" on:click={cancelEditChild} title="Cancel">×</button>
                  </form>
                {:else}
                  <button
                    class="detail-checklist-tick"
                    on:click={() => handleTickItem(child.id)}
                    title={child.status === 'done' ? 'Already complete' : 'Click to mark complete'}
                  >
                    <span class="item-status">{getStatusIcon(child.status)}</span>
                  </button>
                  <span
                    class="detail-checklist-title"
                    on:dblclick={() => startEditChild(child.id, child.title)}
                    title="Double-click to edit"
                  >{@html markedInline(child.title)}</span>
                  <button
                    class="detail-checklist-edit"
                    on:click|stopPropagation={() => startEditChild(child.id, child.title)}
                    title="Edit subtask"
                  >✎</button>
                  <button
                    class="detail-checklist-remove"
                    on:click|stopPropagation={() => handleDeleteChild(child.id)}
                    title="Remove subtask"
                  >×</button>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="no-subtasks">No subtasks yet</p>
        {/if}
        <form class="add-subtask-form" on:submit|preventDefault={() => handleAddSubtask(selectedFeature.item.id)}>
          <input
            type="text"
            bind:value={newSubtaskInput}
            placeholder="Add subtask..."
            disabled={addingSubtask}
          />
          <button type="submit" disabled={addingSubtask || !newSubtaskInput.trim()}>+</button>
        </form>

        <div class="detail-meta">
          <span class="meta-area">{selectedFeature.area.name}</span>
          <span class="meta-status {getStatusClass(selectedFeature.item.status)}">
            {selectedFeature.item.status}
          </span>
        </div>

        <!-- Anchor control - set task for Claude to work on -->
        {#if anchor?.id === selectedFeature.item.id}
          <div class="anchor-active">
            <span class="anchor-badge">🎯 Active Task</span>
            <button
              class="btn btn-ghost btn-sm"
              on:click={handleClearAnchor}
              disabled={settingAnchor}
            >
              Clear
            </button>
          </div>
        {:else}
          <button
            class="btn btn-primary anchor-btn"
            on:click={() => handleSetAnchor(selectedFeature!.item)}
            disabled={settingAnchor || selectedFeature.item.status === 'done'}
            title={selectedFeature.item.status === 'done' ? 'Item already complete' : 'Set as active task for Claude'}
          >
            {settingAnchor ? '...' : '🎯 Set as Active Task'}
          </button>
        {/if}

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

        <!-- Tags -->
        <div class="tags-section">
          <div class="tags-header">
            <h3>Tags</h3>
            {#if !editingTags}
              <button class="btn-edit-tags" on:click={startEditTags}>Edit</button>
            {/if}
          </div>
          {#if editingTags}
            <div class="tags-editor">
              <input
                type="text"
                class="tags-input"
                placeholder="backend api frontend (space-separated)"
                bind:value={tagInput}
                on:keydown={(e) => e.key === 'Enter' && saveTagsEdit()}
                on:keydown={(e) => e.key === 'Escape' && cancelEditTags()}
                autofocus
              />
              <div class="tags-editor-actions">
                <button class="btn btn-primary" on:click={saveTagsEdit} disabled={savingTags}>
                  {savingTags ? 'Saving...' : 'Save'}
                </button>
                <button class="btn btn-ghost" on:click={cancelEditTags}>Cancel</button>
              </div>
              <p class="tags-hint">Use lowercase letters, numbers, hyphens, and underscores</p>
            </div>
          {:else}
            <div class="tags-display">
              {#if selectedFeature.item.tags.length > 0}
                {#each selectedFeature.item.tags as tag}
                  <span class="tag-badge">{tag}</span>
                {/each}
              {:else}
                <span class="tags-empty">No tags</span>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Attachments -->
        <div class="attachments-section">
          <h3>Attachments</h3>
          {#if itemAttachments.length > 0}
            <div class="item-attachment-list">
              {#each itemAttachments as att}
                <div class="item-attachment">
                  <span class="item-att-icon">📎</span>
                  <span class="item-att-name" title={att.path}>{att.originalName}</span>
                  <button class="item-att-delete" on:click={() => handleDeleteItemAttachment(att.filename)}>×</button>
                </div>
              {/each}
            </div>
          {/if}
          <div class="item-attach-upload">
            <input
              type="file"
              class="item-attach-file-input"
              on:change={handleItemFileSelect}
              disabled={itemAttaching}
            />
            <button
              class="item-attach-btn"
              on:click={(e) => e.currentTarget.previousElementSibling?.click()}
              disabled={itemAttaching}
            >
              {itemAttaching ? 'Uploading...' : '📎 Attach File'}
            </button>
          </div>
          <p class="attachments-hint">MCP: chkd_attach(path, "item", "{selectedFeature.item.id}")</p>
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

  /* Main Area */
  .main-area {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .main-area main {
    flex: 1;
    overflow-y: auto;
  }

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
    flex: 1 1 0;
    display: flex;
    align-items: stretch;
    gap: var(--space-sm);
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
    cursor: grab;
  }

  .repo-cards-scroll:active {
    cursor: grabbing;
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

  .repo-card-activity {
    font-size: 9px;
    color: var(--text-muted);
    opacity: 0.8;
  }

  /* Worker and Signal Badges */
  .repo-card-workers-badge,
  .repo-card-signals-badge {
    font-size: 9px;
    font-weight: 500;
    padding: 1px 5px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .repo-card-workers-badge {
    background: var(--success-bg);
    color: var(--success);
  }

  .repo-card-workers-badge.has-conflict {
    background: var(--warning-bg);
    color: var(--warning);
  }

  .repo-card-signals-badge {
    background: var(--primary-bg);
    color: var(--primary);
  }

  /* Workers Strip (inside card) */
  .repo-card-workers {
    display: flex;
    gap: 4px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .worker-chip {
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--surface-hover);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 9px;
  }

  .worker-chip.working {
    background: var(--success-bg);
  }

  .worker-chip.merging {
    background: var(--warning-bg);
  }

  .worker-chip.paused {
    background: var(--warning-bg);
  }

  .worker-chip.error {
    background: var(--error-bg);
  }

  .worker-status {
    font-size: 8px;
  }

  .worker-task {
    font-weight: 500;
    color: var(--text);
  }

  .worker-progress {
    color: var(--text-muted);
    font-size: 8px;
  }

  .workers-more {
    font-size: 9px;
    color: var(--text-muted);
    padding: 2px 4px;
  }

  /* Signal Preview (below card) */
  .repo-card-signal {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    margin-top: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    z-index: 2;
    box-shadow: var(--shadow-md);
  }

  .repo-card-signal.help {
    border-color: var(--error);
    background: var(--error-bg);
  }

  .repo-card-signal.warning {
    border-color: var(--warning);
    background: var(--warning-bg);
  }

  .repo-card-signal.decision {
    border-color: var(--primary);
    background: var(--primary-bg);
  }

  .signal-icon {
    font-size: 12px;
  }

  .signal-msg {
    flex: 1;
    color: var(--text);
    line-height: 1.2;
  }

  .signal-actions {
    display: flex;
    gap: 4px;
  }

  .signal-action-btn {
    background: var(--surface-hover);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    padding: 2px 6px;
    font-size: 9px;
    cursor: pointer;
  }

  .signal-action-btn:hover {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  .signal-dismiss {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 12px;
    line-height: 1;
  }

  .signal-dismiss:hover {
    color: var(--error);
  }

  /* Spawn Worker Button */
  .repo-card-spawn-btn {
    position: absolute;
    top: 6px;
    right: 32px;
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

  .repo-card-wrapper:hover .repo-card-spawn-btn,
  .repo-card-wrapper.active .repo-card-spawn-btn {
    opacity: 1;
  }

  .repo-card-spawn-btn:hover {
    background: var(--success);
    border-color: var(--success);
  }

  /* Modal description */
  .modal-desc {
    color: var(--text-muted);
    font-size: 13px;
    margin-bottom: 16px;
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

  /* Bug input area - redesigned */
  .bug-input-area {
    margin-bottom: var(--space-md);
  }

  .bug-input-row {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .bug-severity-picker {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bug-severity-picker button {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .bug-severity-picker button:hover {
    background: var(--bg-tertiary);
  }

  .bug-severity-picker button.selected {
    border-color: var(--text-muted);
    background: var(--bg);
  }

  .bug-textarea {
    flex: 1;
    padding: var(--space-sm);
    font-size: 13px;
    font-family: inherit;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    resize: none;
    min-height: 60px;
    line-height: 1.4;
  }

  .bug-textarea:focus {
    outline: none;
    border-color: var(--primary);
  }

  .bug-textarea::placeholder {
    color: var(--text-muted);
  }

  .bug-input-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-xs);
  }

  .bug-attach-btn {
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    cursor: pointer;
    opacity: 0.7;
  }

  .bug-attach-btn:hover {
    opacity: 1;
    background: var(--bg-tertiary);
  }

  .bug-attach-btn.has-file {
    opacity: 1;
    background: var(--success-bg);
    border-color: var(--success);
    color: var(--success);
  }

  .bug-submit-btn {
    padding: var(--space-xs) var(--space-md);
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .bug-submit-btn:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .bug-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Inline AI polish suggestion */
  .bug-polish-inline {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1));
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
  }

  .polish-suggestion {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: var(--space-xs);
    font-size: 13px;
  }

  .polish-icon {
    flex-shrink: 0;
  }

  .polish-suggestion .polish-text {
    color: var(--text);
    line-height: 1.3;
  }

  .polish-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .polish-use {
    padding: 4px 12px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .polish-use:hover {
    background: var(--primary-hover);
  }

  .polish-dismiss {
    padding: 4px 8px;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
  }

  .polish-dismiss:hover {
    color: var(--text);
  }

  /* Legacy - keep for backwards compat but hide */
  .bug-dropdown .bug-input-form {
    display: none;
  }

  .bug-polish-confirm {
    display: none;
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
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-sm);
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    font-size: 13px;
    line-height: 1.4;
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
    line-height: 1.3;
    /* Allow text to wrap - no more truncation */
  }

  .bug-dropdown .bug-item.expanded .bug-item-title {
    /* Same as collapsed now */
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

  /* Bug attachments */
  .bug-attachments {
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
  }

  .attachment-list {
    margin-bottom: var(--space-xs);
  }

  .attachment-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
    font-size: 11px;
  }

  .attachment-icon {
    opacity: 0.7;
  }

  .attachment-name {
    flex: 1;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-delete {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 14px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .attachment-item:hover .attachment-delete {
    opacity: 1;
  }

  .attachment-delete:hover {
    color: var(--error);
  }

  .attachment-upload {
    position: relative;
  }

  .attachment-file-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .attachment-pick-btn {
    width: 100%;
    padding: 6px 12px;
    font-size: 12px;
    background: var(--bg-secondary);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s;
  }

  .attachment-pick-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--primary);
    color: var(--text);
  }

  .attachment-pick-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    width: 380px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-md);
    z-index: 1000;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }

  .app.has-detail .quick-win-dropdown {
    right: calc(400px + var(--space-lg) + var(--space-md));
  }

  /* New quick win input area */
  .qw-input-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
  }

  .qw-textarea {
    width: 100%;
    padding: var(--space-sm);
    font-size: 13px;
    font-family: inherit;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    resize: none;
    min-height: 50px;
    line-height: 1.4;
  }

  .qw-textarea:focus {
    outline: none;
    border-color: var(--info);
  }

  .qw-textarea::placeholder {
    color: var(--text-muted);
  }

  .qw-submit-btn {
    align-self: flex-end;
    padding: var(--space-xs) var(--space-md);
    background: var(--info);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .qw-submit-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .qw-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Legacy - hide old form */
  .quick-win-input-form {
    display: none;
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
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
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
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    line-height: 1.4;
    /* Allow wrapping - no truncation */
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

  .quick-win-item.expanded {
    flex-direction: column;
    gap: var(--space-sm);
  }

  .quick-win-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    width: 100%;
    cursor: pointer;
  }

  .quick-win-attachment-count {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .quick-win-details {
    padding-left: 28px;
    width: 100%;
  }

  .qw-attachments {
    background: var(--bg);
    border-radius: var(--radius-sm);
    padding: var(--space-sm);
  }

  .qw-attachments .attachment-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
  }

  .qw-attachments .attachment-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 12px;
  }

  .qw-attachments .attachment-icon {
    flex-shrink: 0;
  }

  .qw-attachments .attachment-name {
    flex: 1;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .qw-attachments .attachment-delete {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
    opacity: 0.5;
  }

  .qw-attachments .attachment-delete:hover {
    color: var(--error);
    opacity: 1;
  }

  .qw-attachments .attachment-upload {
    position: relative;
  }

  .qw-attachments .attachment-file-input {
    position: absolute;
    left: -9999px;
  }

  .qw-attachments .attachment-pick-btn {
    background: var(--bg-secondary);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    padding: 6px 10px;
    width: 100%;
    transition: all 0.15s ease;
  }

  .qw-attachments .attachment-pick-btn:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }

  .qw-attachments .attachment-pick-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .quick-win-expand {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    padding: 0 4px;
    opacity: 0.6;
    transition: opacity 0.15s ease;
  }

  .quick-win-expand:hover {
    opacity: 1;
    color: var(--primary);
  }

  .quick-win-item:hover .quick-win-expand {
    opacity: 1;
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

  /* Recent Activity Card */
  .recent-card-wrapper {
    flex-shrink: 0;
    align-self: stretch;
    display: flex;
    position: relative;
  }

  .recent-card {
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
    border: 2px solid var(--info);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    overflow: hidden;
  }

  .recent-card:hover {
    border-color: var(--info);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
  }

  .recent-card.expanded {
    border-color: var(--info);
    background: linear-gradient(135deg, var(--bg), rgba(59, 130, 246, 0.05));
  }

  .recent-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .recent-card-icon {
    font-size: 14px;
  }

  .recent-card-titles {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .recent-card-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
  }

  .recent-card-repo {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-card-count {
    font-size: 11px;
    font-weight: 600;
    background: var(--info);
    color: white;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }

  .recent-card-preview {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding-top: var(--space-xs);
    overflow: hidden;
  }

  .recent-preview-icon {
    font-size: 11px;
    color: var(--success);
    font-weight: bold;
  }

  .recent-preview-title {
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .recent-dropdown {
    position: fixed;
    top: 70px;
    right: var(--space-lg);
    min-width: 320px;
    max-width: 400px;
    background: var(--bg);
    border: 1px solid var(--info);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-sm);
    z-index: 1000;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }

  .app.has-detail .recent-dropdown {
    right: calc(400px + var(--space-lg) + var(--space-md));
  }

  .recent-section {
    margin-bottom: var(--space-md);
  }

  .recent-section:last-child {
    margin-bottom: 0;
  }

  .recent-section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: var(--space-xs) var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--border);
  }

  .recent-item.completed {
    border-left-color: var(--success);
  }

  .recent-item.added {
    border-left-color: var(--info);
  }

  .recent-item-icon {
    font-size: 12px;
    font-weight: bold;
    min-width: 16px;
    text-align: center;
  }

  .recent-item.completed .recent-item-icon {
    color: var(--success);
  }

  .recent-item.added .recent-item-icon {
    color: var(--info);
  }

  .recent-item-id {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .recent-item-title {
    font-size: 12px;
    color: var(--text);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .session-state-select {
    background: var(--info);
    color: white;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    border: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }

  .session-state-select.debug,
  .session-state-select[value="debugging"] {
    background: var(--error);
  }

  .session-state-select.impromptu,
  .session-state-select[value="impromptu"] {
    background: var(--warning);
    color: var(--text);
  }

  .session-state-select.quickwin,
  .session-state-select[value="quickwin"] {
    background: #f59e0b;
    color: #1a1a1a;
  }

  .session-state-select:hover {
    opacity: 0.9;
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
  }

  .session-activity {
    font-size: 11px;
    color: var(--text-muted);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  /* Off-track warning */
  .off-track-warning {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--warning-bg);
    border: 1px solid var(--warning);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
    font-size: 13px;
    color: var(--warning);
  }

  .off-track-warning .warning-icon {
    font-size: 14px;
  }

  .off-track-warning strong {
    color: var(--text);
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
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    cursor: default;
  }

  .checklist-item.clickable {
    cursor: pointer;
    border-radius: var(--radius-sm);
    padding: var(--space-xs) var(--space-sm);
    margin: 0 calc(-1 * var(--space-sm));
    width: calc(100% + var(--space-md));
  }

  .checklist-item.clickable:hover:not(.done) {
    background: var(--bg-hover);
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

  .filter-toggle-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: 13px;
    font-family: inherit;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .filter-toggle-btn:hover {
    border-color: var(--coral);
    color: var(--text);
  }

  .filter-toggle-btn.active {
    background: var(--coral-dim);
    border-color: var(--coral);
    color: var(--coral);
  }

  .filter-toggle-btn .toggle-icon {
    font-size: 12px;
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

  .empty-state .empty-icon {
    font-size: 48px;
    margin-bottom: var(--space-md);
    opacity: 0.5;
  }

  .empty-state .empty-hint {
    font-size: 13px;
    color: var(--text-dim);
    margin-top: var(--space-sm);
  }

  .empty-state code {
    background: var(--bg-secondary);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    color: var(--coral);
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
  .tag-filter-bar {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-sm);
    flex-wrap: wrap;
  }

  .tag-filter-label {
    font-size: 12px;
    color: var(--text-muted);
    margin-right: var(--space-xs);
  }

  .tag-filter-btn {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tag-filter-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .tag-filter-btn.active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

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

  /* Epic View */
  .epic-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .epic-group {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .epic-group.complete {
    border-color: var(--success);
    opacity: 0.7;
  }

  .epic-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: var(--bg-tertiary);
  }

  .epic-description {
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .epic-description p {
    color: var(--text-muted);
    font-size: 14px;
    margin: 0 0 var(--space-sm);
    line-height: 1.5;
  }

  .epic-file-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s;
  }

  .epic-file-link:hover {
    border-color: var(--coral);
    color: var(--coral);
  }

  .epic-file-link .file-icon {
    font-size: 12px;
  }

  .epic-stories {
    border-top: 1px solid var(--border);
  }

  .epic-stories-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg-secondary);
    border: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .epic-stories-header:hover {
    background: var(--bg-tertiary);
  }

  .epic-toggle {
    font-size: 10px;
    color: var(--text-muted);
    width: 12px;
  }

  .epic-stories-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .epic-status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .epic-status-dot.planning { background: var(--text-muted); }
  .epic-status-dot.in-progress { background: var(--info); }
  .epic-status-dot.review { background: var(--warning); }
  .epic-status-dot.complete { background: var(--success); }

  .epic-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
    flex: 1;
  }

  .epic-tag {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--coral);
    background: var(--coral-dim);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .epic-progress {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .epic-count {
    font-size: 13px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .epic-progress-bar {
    width: 80px;
    height: 6px;
    background: var(--bg);
    border-radius: 3px;
    overflow: hidden;
  }

  .epic-progress-fill {
    height: 100%;
    background: var(--teal);
    transition: width 0.3s ease;
  }

  .epic-status-badge {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .epic-status-badge.planning { color: var(--text-muted); }
  .epic-status-badge.in-progress { color: var(--info); background: var(--info-bg); }
  .epic-status-badge.review { color: var(--warning); background: var(--warning-bg); }
  .epic-status-badge.complete { color: var(--success); background: var(--success-bg); }

  .epic-items {
    list-style: none;
    padding: var(--space-md);
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .epic-item {
    display: flex;
    align-items: center;
  }

  .epic-item .item-row {
    flex: 1;
  }


  .epic-empty {
    padding: var(--space-lg);
    text-align: center;
    color: var(--text-dim);
    font-size: 13px;
  }

  .epic-empty code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    color: var(--coral);
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

  .item-tags {
    display: flex;
    gap: 4px;
    margin-left: var(--space-xs);
  }

  .item-tag {
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 500;
    background: var(--bg-tertiary);
    color: var(--text-muted);
    border-radius: 3px;
    text-transform: lowercase;
  }

  .item-tag.epic-tag {
    background: var(--coral-dim);
    color: var(--coral);
    font-weight: 600;
  }

  .item-epic-tag {
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    background: var(--coral-dim);
    color: var(--coral);
    border-radius: 3px;
    font-family: var(--font-mono);
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
    padding: 0;
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    font-size: 14px;
  }

  .detail-checklist-tick {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-sm);
    padding-right: 0;
  }

  .detail-checklist-tick:hover {
    opacity: 0.7;
  }

  .detail-checklist-title {
    flex: 1;
    padding: var(--space-sm);
    cursor: text;
  }

  .detail-checklist li.done .detail-checklist-title {
    opacity: 0.7;
  }

  .detail-checklist-edit,
  .detail-checklist-remove {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: var(--space-xs);
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .detail-checklist li:hover .detail-checklist-edit,
  .detail-checklist li:hover .detail-checklist-remove {
    opacity: 1;
  }

  .detail-checklist-edit:hover {
    color: var(--accent);
  }

  .detail-checklist-remove:hover {
    color: var(--error);
  }

  .edit-child-form {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex: 1;
    padding: var(--space-xs);
  }

  .edit-child-form input {
    flex: 1;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
  }

  .edit-child-form button {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-xs);
    font-size: 14px;
    color: var(--text-muted);
  }

  .edit-child-form button[type="submit"] {
    color: var(--success);
  }

  .edit-child-form button[type="submit"]:hover {
    color: var(--success);
    opacity: 0.8;
  }

  .edit-child-form button[type="button"]:hover {
    color: var(--error);
  }

  .no-subtasks {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: var(--space-md);
  }

  .add-subtask-form {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-lg);
  }

  .add-subtask-form input {
    flex: 1;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text);
    font-size: 13px;
  }

  .add-subtask-form input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .add-subtask-form button {
    padding: var(--space-xs) var(--space-sm);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 600;
  }

  .add-subtask-form button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .add-subtask-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .edit-desc,
  .edit-story {
    width: 100%;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    resize: vertical;
    margin-bottom: var(--space-md);
    background: var(--bg);
    color: var(--text);
  }

  .edit-story {
    font-style: italic;
  }

  .editable {
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background 0.15s;
  }

  .editable:hover {
    background: var(--bg-hover);
  }

  .detail-desc.empty,
  .detail-story.empty blockquote {
    color: var(--text-muted);
    font-style: italic;
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

  /* Anchor controls */
  .anchor-active {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--success-bg);
    border: 1px solid var(--success);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
  }

  .anchor-badge {
    font-size: 13px;
    font-weight: 600;
    color: var(--success);
  }

  .anchor-btn {
    width: 100%;
    margin-bottom: var(--space-md);
    font-size: 14px;
    padding: var(--space-sm) var(--space-md);
  }

  .anchor-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  /* Tags section */
  .tags-section {
    border-top: 1px solid var(--border);
    padding-top: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .tags-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-sm);
  }

  .tags-header h3 {
    margin: 0;
  }

  .btn-edit-tags {
    padding: 2px 8px;
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 11px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .btn-edit-tags:hover {
    background: var(--bg-secondary);
    color: var(--text);
  }

  .tags-display {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag-badge {
    padding: 4px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--text-secondary);
  }

  .tags-empty {
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }

  .tags-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .tags-input {
    width: 100%;
    padding: var(--space-sm);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
  }

  .tags-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .tags-editor-actions {
    display: flex;
    gap: var(--space-xs);
  }

  .tags-hint {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0;
  }

  /* Attachments section */
  .attachments-section {
    border-top: 1px solid var(--border);
    padding-top: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .attachments-section h3 {
    margin: 0 0 var(--space-sm);
    font-size: 14px;
  }

  .item-attachment-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
  }

  .item-attachment {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .item-att-icon {
    opacity: 0.7;
  }

  .item-att-name {
    flex: 1;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-att-delete {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 14px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .item-attachment:hover .item-att-delete {
    opacity: 1;
  }

  .item-att-delete:hover {
    color: var(--error);
  }

  .item-attach-upload {
    position: relative;
    margin-bottom: var(--space-xs);
  }

  .item-attach-file-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .item-attach-btn {
    width: 100%;
    padding: var(--space-sm);
    background: var(--bg-secondary);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s;
  }

  .item-attach-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--primary);
    color: var(--text);
  }

  .item-attach-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .attachments-hint {
    font-size: 10px;
    color: var(--text-muted);
    margin: 0;
    font-family: var(--font-mono);
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

  /* Pending Anchor Card */
  .pending-anchor-card {
    background: linear-gradient(135deg, var(--warning-bg) 0%, var(--bg-secondary) 100%);
    border: 2px solid var(--warning);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
    text-align: center;
  }

  .pending-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .pending-badge {
    background: var(--warning);
    color: var(--bg);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-md);
    font-size: 12px;
    font-weight: 700;
  }

  .pending-label {
    font-size: 13px;
    color: var(--text-muted);
  }

  .pending-task {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: var(--space-md);
    color: var(--text);
  }

  .pending-hint {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0 0 var(--space-md);
  }

  .pending-hint code {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 12px;
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

  .session-progress-summary .progress-iteration {
    font-size: 12px;
    color: var(--accent);
    background: var(--accent-muted);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    margin-left: var(--space-sm);
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

  .bug-severity-btn {
    font-size: 12px;
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    transition: background 0.15s;
  }

  .bug-severity-btn:hover {
    background: var(--bg-tertiary);
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

  .bug-severity-quick {
    display: flex;
    gap: 2px;
  }

  .bug-severity-quick button {
    padding: 4px 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.5;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .bug-severity-quick button:hover {
    opacity: 0.8;
  }

  .bug-severity-quick button.selected {
    opacity: 1;
    border-color: var(--accent);
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
