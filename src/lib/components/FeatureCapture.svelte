<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { checkDuplicates, expandFeature, addFeature } from '$lib/api';
  import type { DuplicateMatch, ParsedSpec } from '$lib/api';

  export let repoPath: string;
  export let spec: ParsedSpec | null;
  export let initialTitle = '';

  // DEBUG: Track if component is being recreated vs just re-rendered
  onMount(() => console.log('[FeatureCapture] MOUNTED - component created'));
  onDestroy(() => console.log('[FeatureCapture] DESTROYED - will lose state!'));

  const dispatch = createEventDispatcher();

  // Wizard steps
  type Step = 'discuss' | 'analyze' | 'place' | 'review' | 'add';
  let currentStep: Step = 'discuss';
  const steps: Step[] = ['discuss', 'analyze', 'place', 'review', 'add'];

  // Default workflow tasks
  const DEFAULT_TASKS = [
    'Explore: understand problem, search existing functions',
    'Design: flow diagram if needed',
    'Prototype: backend with test data + frontend calling it',
    'Feedback: user reviews prototype',
    'Implement: replace test data with real logic',
    'Polish: iterate based on usage'
  ];

  // Feature data
  let title = initialTitle;
  let description = '';
  let userStory = '';

  // DEBUG: Log when title gets reset
  $: if (title !== undefined) console.log('[FeatureCapture] title =', JSON.stringify(title));
  let selectedAreaCode: string | null = null;
  let tasks: string[] = [...DEFAULT_TASKS];
  let newTaskText = '';

  // AI analysis state
  let analyzing = false;
  let aiDescription = '';
  let aiStory = '';
  let aiArea: string | null = null;
  let duplicates: DuplicateMatch[] = [];
  let verdict: 'new' | 'enhance' | 'duplicate' | null = null;
  let verdictReason = '';

  // Adding state
  let adding = false;
  let addError: string | null = null;

  // Get available areas
  $: availableAreas = spec?.areas.filter(a =>
    ['SD', 'FE', 'BE'].includes(a.code)
  ) || [];

  // Step labels for sidebar
  const stepLabels: Record<Step, string> = {
    discuss: 'Describe',
    analyze: 'Analyze',
    place: 'Place',
    review: 'Review',
    add: 'Add'
  };

  // Step status
  function getStepStatus(step: Step): 'done' | 'current' | 'pending' {
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);
    if (stepIndex < currentIndex) return 'done';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  }

  function close() {
    dispatch('close');
  }

  // Move to next step
  async function nextStep() {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      const nextStep = steps[currentIndex + 1];

      // Run analysis when moving from discuss to analyze
      if (currentStep === 'discuss' && nextStep === 'analyze') {
        await runAnalysis();
      }

      currentStep = nextStep;
    }
  }

  function prevStep() {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      currentStep = steps[currentIndex - 1];
    }
  }

  // Run AI analysis
  async function runAnalysis() {
    if (!title.trim()) return;

    analyzing = true;
    verdict = null;
    verdictReason = '';

    try {
      // Run duplicate check and expansion in parallel
      const [dupRes, expandRes] = await Promise.all([
        checkDuplicates(repoPath, title.trim()),
        expandFeature(repoPath, title.trim(), selectedAreaCode || undefined)
      ]);

      if (dupRes.success && dupRes.data) {
        duplicates = dupRes.data.matches;
      }

      if (expandRes.success && expandRes.data) {
        aiDescription = expandRes.data.description || '';
        aiStory = expandRes.data.story || '';
        aiArea = expandRes.data.suggestedArea || null;

        // Auto-fill if not already set
        if (!description && aiDescription) description = aiDescription;
        if (!userStory && aiStory) userStory = aiStory;
        if (!selectedAreaCode && aiArea) selectedAreaCode = aiArea;
      }

      // Determine verdict
      if (duplicates.length > 0) {
        const highMatch = duplicates.find(d => d.similarity >= 0.8);
        const mediumMatch = duplicates.find(d => d.similarity >= 0.5);

        if (highMatch) {
          verdict = 'duplicate';
          verdictReason = `Very similar to "${highMatch.item.title}" in ${highMatch.area.name}`;
        } else if (mediumMatch) {
          verdict = 'enhance';
          verdictReason = `Could enhance "${mediumMatch.item.title}" instead of creating new`;
        } else {
          verdict = 'new';
          verdictReason = 'Some related features exist but this appears distinct';
        }
      } else {
        verdict = 'new';
        verdictReason = 'No similar features found - this is new functionality';
      }
    } catch (e) {
      console.error('Analysis failed:', e);
      verdict = 'new';
      verdictReason = 'Analysis unavailable - proceeding as new feature';
    } finally {
      analyzing = false;
    }
  }

  // Add the feature
  async function handleAdd() {
    if (!title.trim()) return;

    adding = true;
    addError = null;

    const areaCode = selectedAreaCode || guessAreaFromTitle(title);
    const fullDescription = userStory
      ? `${description}\n\n> ${userStory}`.trim()
      : description;

    // Pass custom tasks if they differ from default
    const customTasks = tasks.length > 0 ? tasks : undefined;

    const res = await addFeature(repoPath, title.trim(), areaCode, fullDescription || undefined, customTasks);

    if (res.success) {
      dispatch('added');
    } else {
      addError = res.error || 'Failed to add feature';
    }

    adding = false;
  }

  function guessAreaFromTitle(t: string): string {
    const lower = t.toLowerCase();
    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('database') || lower.includes('server') || lower.includes('backend')) {
      return 'BE';
    }
    if (lower.includes('page') || lower.includes('layout') || lower.includes('design') || lower.includes('ui') || lower.includes('ux') || lower.includes('wireframe')) {
      return 'SD';
    }
    return 'FE';
  }

  // Task management
  function addTask() {
    if (newTaskText.trim()) {
      tasks = [...tasks, newTaskText.trim()];
      newTaskText = '';
    }
  }

  function deleteTask(index: number) {
    tasks = tasks.filter((_, i) => i !== index);
  }

  function moveTaskUp(index: number) {
    if (index > 0) {
      const newTasks = [...tasks];
      [newTasks[index - 1], newTasks[index]] = [newTasks[index], newTasks[index - 1]];
      tasks = newTasks;
    }
  }

  function moveTaskDown(index: number) {
    if (index < tasks.length - 1) {
      const newTasks = [...tasks];
      [newTasks[index], newTasks[index + 1]] = [newTasks[index + 1], newTasks[index]];
      tasks = newTasks;
    }
  }

  function resetTasks() {
    tasks = [...DEFAULT_TASKS];
  }

  // Can proceed to next step?
  $: canProceed = (() => {
    switch (currentStep) {
      case 'discuss': return title.trim().length >= 3;
      case 'analyze': return !analyzing;
      case 'place': return selectedAreaCode !== null;
      case 'review': return title.trim().length >= 3 && tasks.length > 0;
      case 'add': return !adding;
      default: return false;
    }
  })();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" on:click={close}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="wizard" on:click|stopPropagation>
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h3>Add Feature</h3>
        <button class="close-btn" on:click={close}>×</button>
      </div>

      <nav class="steps">
        {#each steps as step}
          {@const status = getStepStatus(step)}
          <button
            class="step-item"
            class:done={status === 'done'}
            class:current={status === 'current'}
            class:pending={status === 'pending'}
            disabled={status === 'pending'}
            on:click={() => { if (status === 'done') currentStep = step; }}
          >
            <span class="step-icon">
              {#if status === 'done'}✓{:else if status === 'current'}●{:else}○{/if}
            </span>
            <span class="step-label">{stepLabels[step]}</span>
          </button>
        {/each}
      </nav>

      <!-- Context summary -->
      {#if title}
        <div class="context">
          <div class="context-title">{title}</div>
          {#if selectedAreaCode}
            <span class="context-area">{selectedAreaCode}</span>
          {/if}
        </div>
      {/if}
    </aside>

    <!-- Main content -->
    <main class="content">
      <!-- Step: Discuss -->
      {#if currentStep === 'discuss'}
        <div class="step-content">
          <h2>What do you want to build?</h2>
          <p class="step-desc">Describe the feature in a few words. Be specific.</p>

          <div class="form-group">
            <label for="title">Feature Title</label>
            <input
              id="title"
              type="text"
              bind:value={title}
              placeholder="e.g., User authentication with OAuth"
              class="input-lg"
              autofocus
            />
          </div>

          <div class="form-group">
            <label for="initial-desc">Initial thoughts (optional)</label>
            <textarea
              id="initial-desc"
              bind:value={description}
              placeholder="Any context or requirements you already know..."
              rows="3"
            ></textarea>
          </div>
        </div>
      {/if}

      <!-- Step: Analyze -->
      {#if currentStep === 'analyze'}
        <div class="step-content">
          <h2>Analysis</h2>

          {#if analyzing}
            <div class="analyzing">
              <div class="spinner"></div>
              <span>Analyzing feature and checking for duplicates...</span>
            </div>
          {:else}
            <!-- Verdict -->
            {#if verdict}
              <div class="verdict" class:new={verdict === 'new'} class:enhance={verdict === 'enhance'} class:duplicate={verdict === 'duplicate'}>
                <div class="verdict-icon">
                  {#if verdict === 'new'}✓{:else if verdict === 'enhance'}↗{:else}⚠{/if}
                </div>
                <div class="verdict-content">
                  <div class="verdict-label">
                    {#if verdict === 'new'}New Feature{:else if verdict === 'enhance'}Consider Enhancing{:else}Potential Duplicate{/if}
                  </div>
                  <div class="verdict-reason">{verdictReason}</div>
                </div>
              </div>
            {/if}

            <!-- Duplicates found -->
            {#if duplicates.length > 0}
              <div class="duplicates-section">
                <h3>Similar Features</h3>
                <ul class="duplicate-list">
                  {#each duplicates as dup}
                    <li class="duplicate-item" class:high={dup.similarity >= 0.7}>
                      <span class="dup-title">{dup.item.title}</span>
                      <span class="dup-meta">
                        <span class="dup-area">{dup.area.code}</span>
                        <span class="dup-match">{Math.round(dup.similarity * 100)}%</span>
                      </span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            <!-- AI suggestions -->
            {#if aiDescription || aiStory}
              <div class="ai-section">
                <h3>AI Suggestions</h3>
                {#if aiDescription}
                  <div class="ai-item">
                    <label>Description</label>
                    <p>{aiDescription}</p>
                  </div>
                {/if}
                {#if aiStory}
                  <div class="ai-item">
                    <label>User Story</label>
                    <p class="user-story">{aiStory}</p>
                  </div>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      {/if}

      <!-- Step: Place -->
      {#if currentStep === 'place'}
        <div class="step-content">
          <h2>Where does this belong?</h2>
          <p class="step-desc">Select the area this feature belongs to.</p>

          <div class="area-grid">
            {#each availableAreas as area}
              <button
                class="area-card"
                class:selected={selectedAreaCode === area.code}
                on:click={() => selectedAreaCode = area.code}
              >
                <div class="area-code">{area.code}</div>
                <div class="area-name">{area.name}</div>
                {#if aiArea === area.code}
                  <span class="ai-suggested">AI suggested</span>
                {/if}
              </button>
            {/each}
          </div>

          {#if !selectedAreaCode && title}
            <div class="auto-area">
              Auto-detect suggests: <strong>{guessAreaFromTitle(title) === 'BE' ? 'Backend' : guessAreaFromTitle(title) === 'SD' ? 'Site Design' : 'Frontend'}</strong>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step: Review -->
      {#if currentStep === 'review'}
        <div class="step-content">
          <h2>Review before adding</h2>
          <p class="step-desc">Edit title, story, and tasks. This is what will be added to the spec.</p>

          <div class="review-section">
            <div class="form-group">
              <label for="final-title">Title</label>
              <input
                id="final-title"
                type="text"
                bind:value={title}
                class="input-lg"
              />
            </div>

            <div class="form-group">
              <label for="story">User Story</label>
              <input
                id="story"
                type="text"
                bind:value={userStory}
                placeholder="As a [user], I want to [action] so that [benefit]"
              />
            </div>
          </div>

          <div class="tasks-section">
            <div class="tasks-header">
              <label>Tasks</label>
              <button class="btn-reset" on:click={resetTasks}>Reset to default</button>
            </div>

            <ul class="task-list">
              {#each tasks as task, index}
                <li class="task-item">
                  <span class="task-number">{index + 1}.</span>
                  <input
                    type="text"
                    bind:value={tasks[index]}
                    class="task-input"
                  />
                  <div class="task-actions">
                    <button
                      class="task-btn"
                      on:click={() => moveTaskUp(index)}
                      disabled={index === 0}
                      title="Move up"
                    >↑</button>
                    <button
                      class="task-btn"
                      on:click={() => moveTaskDown(index)}
                      disabled={index === tasks.length - 1}
                      title="Move down"
                    >↓</button>
                    <button
                      class="task-btn task-btn-delete"
                      on:click={() => deleteTask(index)}
                      title="Delete"
                    >×</button>
                  </div>
                </li>
              {/each}
            </ul>

            <div class="add-task">
              <input
                type="text"
                bind:value={newTaskText}
                placeholder="Add a task..."
                on:keydown={(e) => e.key === 'Enter' && addTask()}
              />
              <button class="btn-add-task" on:click={addTask}>+ Add</button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step: Add -->
      {#if currentStep === 'add'}
        <div class="step-content">
          <h2>Ready to add</h2>

          <div class="summary">
            <div class="summary-row">
              <span class="summary-label">Title</span>
              <span class="summary-value">{title}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Area</span>
              <span class="summary-value">{availableAreas.find(a => a.code === selectedAreaCode)?.name || selectedAreaCode}</span>
            </div>
            {#if userStory}
              <div class="summary-row">
                <span class="summary-label">Story</span>
                <span class="summary-value story">{userStory}</span>
              </div>
            {/if}
            {#if description}
              <div class="summary-row">
                <span class="summary-label">Description</span>
                <span class="summary-value">{description}</span>
              </div>
            {/if}
          </div>

          <div class="workflow-info">
            <h4>Tasks ({tasks.length}):</h4>
            <ul class="task-preview">
              {#each tasks as task, i}
                <li>
                  <span class="task-preview-num">{i + 1}.</span>
                  <span class="task-preview-text">{task}</span>
                </li>
              {/each}
            </ul>
          </div>

          {#if addError}
            <div class="error">{addError}</div>
          {/if}
        </div>
      {/if}

      <!-- Navigation -->
      <div class="nav-bar">
        {#if currentStep !== 'discuss'}
          <button class="btn-back" on:click={prevStep}>
            ← Back
          </button>
        {:else}
          <div></div>
        {/if}

        {#if currentStep === 'add'}
          <button class="btn-primary" on:click={handleAdd} disabled={adding}>
            {adding ? 'Adding...' : 'Add Feature'}
          </button>
        {:else}
          <button class="btn-primary" on:click={nextStep} disabled={!canProceed}>
            {analyzing ? 'Analyzing...' : 'Continue →'}
          </button>
        {/if}
      </div>
    </main>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .wizard {
    display: flex;
    width: 90%;
    max-width: 800px;
    height: 80vh;
    max-height: 600px;
    background: var(--bg);
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  /* Sidebar */
  .sidebar {
    width: 200px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    padding: var(--space-lg);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 16px;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-muted);
    line-height: 1;
    padding: 0;
  }

  .close-btn:hover {
    color: var(--text);
  }

  .steps {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .step-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    font-size: 14px;
    color: var(--text-muted);
    transition: all 0.2s;
  }

  .step-item:hover:not(:disabled) {
    background: var(--bg-tertiary);
  }

  .step-item.done {
    color: var(--success);
  }

  .step-item.done:hover {
    background: var(--success-bg);
  }

  .step-item.current {
    background: var(--primary-bg);
    color: var(--primary);
    font-weight: 500;
  }

  .step-item.pending {
    opacity: 0.5;
    cursor: default;
  }

  .step-icon {
    width: 16px;
    font-size: 12px;
    text-align: center;
  }

  .context {
    margin-top: auto;
    padding: var(--space-md);
    border-top: 1px solid var(--border);
    background: var(--bg-tertiary);
  }

  .context-title {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: var(--space-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-area {
    font-size: 11px;
    font-weight: 600;
    background: var(--bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }

  /* Main content */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .step-content {
    flex: 1;
    padding: var(--space-xl);
    overflow-y: auto;
  }

  .step-content h2 {
    margin: 0 0 var(--space-xs);
    font-size: 20px;
  }

  .step-desc {
    color: var(--text-muted);
    margin: 0 0 var(--space-xl);
    font-size: 14px;
  }

  /* Forms */
  .form-group {
    margin-bottom: var(--space-lg);
  }

  .form-group label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: var(--space-xs);
    color: var(--text-muted);
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: var(--space-md);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
  }

  .form-group input:focus,
  .form-group textarea:focus {
    border-color: var(--primary);
    outline: none;
  }

  .input-lg {
    font-size: 16px !important;
    padding: var(--space-md) var(--space-lg) !important;
  }

  /* Analysis step */
  .analyzing {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl);
    color: var(--text-muted);
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .verdict {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-lg);
  }

  .verdict.new {
    background: var(--success-bg);
    border: 1px solid var(--success);
  }

  .verdict.enhance {
    background: var(--warning-bg, #fef3cd);
    border: 1px solid var(--warning);
  }

  .verdict.duplicate {
    background: var(--error-bg);
    border: 1px solid var(--error);
  }

  .verdict-icon {
    font-size: 20px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--bg);
  }

  .verdict.new .verdict-icon { color: var(--success); }
  .verdict.enhance .verdict-icon { color: var(--warning); }
  .verdict.duplicate .verdict-icon { color: var(--error); }

  .verdict-label {
    font-weight: 600;
    font-size: 15px;
  }

  .verdict-reason {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: var(--space-xs);
  }

  .duplicates-section,
  .ai-section {
    margin-bottom: var(--space-lg);
  }

  .duplicates-section h3,
  .ai-section h3 {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin: 0 0 var(--space-sm);
  }

  .duplicate-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .duplicate-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-xs);
    font-size: 13px;
  }

  .duplicate-item.high {
    background: var(--error-bg);
  }

  .dup-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dup-meta {
    display: flex;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .dup-area {
    font-size: 10px;
    font-weight: 600;
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .dup-match {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .ai-item {
    margin-bottom: var(--space-md);
  }

  .ai-item label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .ai-item p {
    margin: var(--space-xs) 0 0;
    font-size: 14px;
    color: var(--text);
  }

  .ai-item .user-story {
    font-style: italic;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-tertiary);
    border-left: 3px solid var(--primary);
    border-radius: var(--radius-sm);
  }

  /* Area selection */
  .area-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
  }

  .area-card {
    padding: var(--space-lg);
    background: var(--bg-secondary);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: center;
    transition: all 0.2s;
    position: relative;
  }

  .area-card:hover {
    border-color: var(--primary);
    background: var(--primary-bg);
  }

  .area-card.selected {
    border-color: var(--primary);
    background: var(--primary-bg);
  }

  .area-card .area-code {
    font-size: 24px;
    font-weight: 700;
    color: var(--primary);
    margin-bottom: var(--space-xs);
  }

  .area-card .area-name {
    font-size: 13px;
    color: var(--text-muted);
  }

  .ai-suggested {
    position: absolute;
    top: var(--space-xs);
    right: var(--space-xs);
    font-size: 9px;
    background: var(--info);
    color: white;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    font-weight: 600;
  }

  .auto-area {
    margin-top: var(--space-lg);
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
  }

  /* Summary */
  .summary {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .summary-row {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--border);
  }

  .summary-row:last-child {
    border-bottom: none;
  }

  .summary-label {
    width: 80px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .summary-value {
    flex: 1;
    font-size: 14px;
  }

  .summary-value.story {
    font-style: italic;
    color: var(--text-muted);
  }

  .workflow-info {
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }

  .workflow-info h4 {
    margin: 0 0 var(--space-sm);
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .task-preview {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
  }

  .task-preview li {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
    font-size: 12px;
    color: var(--text-muted);
  }

  .task-preview-num {
    flex-shrink: 0;
    width: 20px;
    color: var(--text-muted);
  }

  .task-preview-text {
    flex: 1;
  }

  .error {
    padding: var(--space-md);
    background: var(--error-bg);
    border: 1px solid var(--error);
    border-radius: var(--radius-md);
    color: var(--error);
    font-size: 14px;
    margin-top: var(--space-md);
  }

  /* Navigation */
  .nav-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .btn-back {
    padding: var(--space-sm) var(--space-lg);
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
    color: var(--text-muted);
  }

  .btn-back:hover {
    background: var(--bg-tertiary);
    color: var(--text);
  }

  .btn-primary {
    padding: var(--space-sm) var(--space-xl);
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

  /* Review step - task editing */
  .review-section {
    margin-bottom: var(--space-lg);
  }

  .tasks-section {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .tasks-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .tasks-header label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .btn-reset {
    font-size: 12px;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
  }

  .btn-reset:hover {
    color: var(--text);
  }

  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .task-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
    border-bottom: 1px solid var(--border);
  }

  .task-item:last-child {
    border-bottom: none;
  }

  .task-number {
    font-size: 12px;
    color: var(--text-muted);
    width: 24px;
    flex-shrink: 0;
  }

  .task-input {
    flex: 1;
    padding: var(--space-sm);
    font-size: 13px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
  }

  .task-input:hover {
    background: var(--bg);
  }

  .task-input:focus {
    background: var(--bg);
    border-color: var(--primary);
    outline: none;
  }

  .task-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .task-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-muted);
  }

  .task-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text);
  }

  .task-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .task-btn-delete:hover:not(:disabled) {
    background: var(--error-bg);
    color: var(--error);
  }

  .add-task {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
  }

  .add-task input {
    flex: 1;
    padding: var(--space-sm);
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .add-task input:focus {
    border-color: var(--primary);
    outline: none;
  }

  .btn-add-task {
    padding: var(--space-sm) var(--space-md);
    font-size: 13px;
    background: var(--primary-bg);
    color: var(--primary);
    border: 1px solid var(--primary);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .btn-add-task:hover {
    background: var(--primary);
    color: white;
  }
</style>
