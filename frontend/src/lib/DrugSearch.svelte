<script lang="ts">
  import { searchDrugs, type DrugSearchItem } from './api';
  import { selectedDrugs } from './stores';

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
    selectedDrugs.update((list) => {
      if (list.length >= 10) return list;
      if (list.some((d) => d.itemSeq === drug.itemSeq)) return list;
      return [...list, drug];
    });
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
    // Delay to allow click on dropdown item
    setTimeout(() => { showDropdown = false; }, 200);
  }
</script>

<div class="search-wrapper">
  <div class="search-input-row">
    <input
      type="text"
      placeholder="약 이름을 검색하세요 (예: 타이레놀, 아스피린)"
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
          onmousedown={() => selectDrug(drug)}
        >
          <span class="drug-name">
            {drug.itemName}
            {#if !drug.hasDurData}
              <span class="no-dur-tag">DUR 미등록</span>
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

<style>
  .search-wrapper {
    position: relative;
    margin-bottom: 16px;
  }
  .search-input-row {
    position: relative;
  }
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
    background: var(--accent);
    color: #fff;
  }
  .dropdown li:hover .drug-meta,
  .dropdown li.highlighted .drug-meta,
  .dropdown li:hover .drug-ingr,
  .dropdown li.highlighted .drug-ingr {
    color: rgba(255,255,255,0.8);
  }
  .drug-name { font-weight: 500; color: var(--text-h); display: flex; align-items: center; gap: 6px; }
  .no-dur-tag {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--text-muted);
    color: #fff;
    font-weight: 600;
    flex-shrink: 0;
  }
  .drug-meta { font-size: 13px; color: var(--text-muted); }
  .drug-ingr { font-size: 12px; color: var(--accent); }
  .dropdown li:hover .drug-name,
  .dropdown li.highlighted .drug-name { color: #fff; }
</style>
