<script lang="ts">
  import { searchDrugs, type DrugSearchItem } from './api';
  import { myDrugs, addMyDrug, removeMyDrug } from './stores';

  let query = $state('');
  let results = $state<DrugSearchItem[]>([]);
  let isLoading = $state(false);
  let showDropdown = $state(false);
  let highlightIndex = $state(-1);
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput() {
    clearTimeout(debounceTimer);
    highlightIndex = -1;
    if (query.length < 2) {
      results = [];
      showDropdown = false;
      return;
    }
    debounceTimer = setTimeout(async () => {
      isLoading = true;
      try {
        const data = await searchDrugs(query);
        results = data.items;
        showDropdown = results.length > 0;
      } catch {
        results = [];
      } finally {
        isLoading = false;
      }
    }, 300);
  }

  function selectDrug(drug: DrugSearchItem) {
    addMyDrug(drug);
    query = '';
    results = [];
    showDropdown = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIndex = Math.min(highlightIndex + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      selectDrug(results[highlightIndex]);
    } else if (e.key === 'Escape') {
      showDropdown = false;
    }
  }

  function handleBlur() {
    setTimeout(() => { showDropdown = false; }, 200);
  }
</script>

<div class="my-drugs">
  <p class="section-desc">평소 복용하는 약을 등록하면, 검색 시 자동으로 병용금기를 확인합니다.</p>

  <div class="search-wrapper">
    <div class="search-input-row">
      <input
        type="text"
        placeholder="등록할 약 이름을 검색하세요"
        bind:value={query}
        oninput={handleInput}
        onkeydown={handleKeydown}
        onblur={handleBlur}
        onfocus={() => { if (results.length > 0) showDropdown = true; }}
      />
      {#if isLoading}
        <span class="spinner"></span>
      {/if}
    </div>

    {#if showDropdown}
      <ul class="dropdown">
        {#each results as drug, i}
          <li
            class:highlighted={i === highlightIndex}
            class:already-added={$myDrugs.some(d => d.itemSeq === drug.itemSeq)}
            onmousedown={() => selectDrug(drug)}
          >
            <span class="drug-name">
              {drug.itemName}
              {#if $myDrugs.some(d => d.itemSeq === drug.itemSeq)}
                <span class="added-tag">등록됨</span>
              {/if}
            </span>
            <span class="drug-meta">{drug.entpName}</span>
            {#if drug.ingredientNames?.length}
              <span class="drug-ingr">{drug.ingredientNames.join(', ')}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if $myDrugs.length === 0}
    <div class="empty">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/></svg>
      <p>등록된 약이 없습니다</p>
      <span class="empty-sub">위에서 약을 검색하여 등록하세요</span>
    </div>
  {:else}
    <div class="drug-list">
      {#each $myDrugs as drug (drug.itemSeq)}
        <div class="drug-item">
          <div class="drug-item-info">
            <span class="drug-item-name">{drug.itemName}</span>
            <span class="drug-item-meta">
              {drug.entpName}
              {#if drug.ingredientNames?.length}
                · {drug.ingredientNames.join(', ')}
              {/if}
            </span>
          </div>
          <button class="remove-btn" onclick={() => removeMyDrug(drug.itemSeq)} aria-label="삭제">&times;</button>
        </div>
      {/each}
    </div>
    <p class="drug-count">{$myDrugs.length}개 등록됨</p>
  {/if}
</div>

<style>
  .my-drugs {
    margin-bottom: 16px;
  }
  .section-desc {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 12px;
    line-height: 1.5;
  }

  .search-wrapper { position: relative; margin-bottom: 16px; }
  .search-input-row { position: relative; }
  .spinner {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    list-style: none;
    max-height: 320px;
    overflow-y: auto;
    z-index: 10;
    margin-top: 4px;
  }
  .dropdown li {
    padding: 10px 14px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  .dropdown li:last-child { border-bottom: none; }
  .dropdown li:hover, .dropdown li.highlighted {
    background: var(--accent-light);
  }
  .dropdown li.already-added { opacity: 0.5; }
  .drug-name { font-weight: 500; color: var(--text-h); display: flex; align-items: center; gap: 6px; font-size: 14px; }
  .added-tag {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--safe);
    color: #fff;
    font-weight: 600;
  }
  .drug-meta { font-size: 12px; color: var(--text-muted); }
  .drug-ingr { font-size: 11px; color: var(--accent); opacity: 0.8; }

  .empty {
    text-align: center;
    padding: 28px 20px;
    color: var(--text-muted);
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .empty p {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }
  .empty-icon {
    color: var(--border);
    margin-bottom: 4px;
  }
  .empty-sub {
    font-size: 12px;
    color: var(--text-muted);
  }

  .drug-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .drug-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
    transition: box-shadow 0.15s;
  }
  .drug-item:hover {
    box-shadow: var(--shadow-md);
  }
  .drug-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .drug-item-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-h);
  }
  .drug-item-meta {
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remove-btn {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 50%;
    font-size: 16px;
    padding: 0;
    line-height: 1;
  }
  .remove-btn:hover {
    background: var(--danger);
    color: #fff;
    border-color: var(--danger);
  }

  .drug-count {
    font-size: 12px;
    color: var(--text-muted);
    text-align: right;
    margin-top: 8px;
  }
</style>
