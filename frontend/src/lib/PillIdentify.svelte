<script lang="ts">
  import { onMount } from 'svelte';
  import { identifyPill, getIdentifyOptions, type IdentifyItem, type FilterOption } from './api';
  import { selectedDrugs, myDrugs, myDrugContraMap, checkAgainstMyDrugs } from './stores';

  let shapes = $state<FilterOption[]>([]);
  let colors = $state<FilterOption[]>([]);

  let shape = $state('');
  let color = $state('');
  let printFront = $state('');
  let printBack = $state('');
  let itemName = $state('');

  let results = $state<IdentifyItem[]>([]);
  let totalCount = $state(0);
  let isLoading = $state(false);
  let searched = $state(false);
  let optionsLoaded = $state(false);

  const hasInput = $derived(!!shape || !!color || !!printFront || !!printBack || !!itemName);

  onMount(async () => {
    try {
      const opts = await getIdentifyOptions();
      shapes = opts.shapes;
      colors = opts.colors;
    } catch {
      // 옵션 로드 실패 시 빈 배열 유지
    }
    optionsLoaded = true;
  });

  async function handleSearch() {
    if (!hasInput) return;
    isLoading = true;
    searched = true;
    try {
      const params: Record<string, string> = {};
      if (shape) params.shape = shape;
      if (color) params.color = color;
      if (printFront) params.print_front = printFront;
      if (printBack) params.print_back = printBack;
      if (itemName) params.item_name = itemName;

      const data = await identifyPill(params);
      results = data.items;
      totalCount = data.totalCount;

      if ($myDrugs.length > 0 && results.length > 0) {
        checkAgainstMyDrugs(results.map((d) => ({ itemSeq: d.itemSeq, itemName: d.itemName })));
      }
    } catch {
      results = [];
      totalCount = 0;
    } finally {
      isLoading = false;
    }
  }

  function addDrug(item: IdentifyItem) {
    selectedDrugs.update((list) => {
      if (list.length >= 10) return list;
      if (list.some((d) => d.itemSeq === item.itemSeq)) return list;
      return [...list, {
        itemSeq: item.itemSeq,
        itemName: item.itemName,
        entpName: item.entpName,
        ingredientNames: item.ingredientNames,
        hasDurData: item.hasDurData,
      }];
    });
  }

  function handleReset() {
    shape = '';
    color = '';
    printFront = '';
    printBack = '';
    itemName = '';
    results = [];
    totalCount = 0;
    searched = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  function formatOption(opt: FilterOption): string {
    return `${opt.value} (${opt.count.toLocaleString()})`;
  }
</script>

<div class="identify-form">
  <div class="form-row">
    <label class="form-field">
      <span class="field-label">모양</span>
      <select bind:value={shape} disabled={!optionsLoaded}>
        <option value="">전체</option>
        {#each shapes as opt}
          <option value={opt.value}>{formatOption(opt)}</option>
        {/each}
      </select>
    </label>
    <label class="form-field">
      <span class="field-label">색상</span>
      <select bind:value={color} disabled={!optionsLoaded}>
        <option value="">전체</option>
        {#each colors as opt}
          <option value={opt.value}>{formatOption(opt)}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="form-row">
    <label class="form-field">
      <span class="field-label">식별문자 (앞)</span>
      <input type="text" placeholder="예: CJ" bind:value={printFront} onkeydown={handleKeydown} />
    </label>
    <label class="form-field">
      <span class="field-label">식별문자 (뒤)</span>
      <input type="text" placeholder="예: 100" bind:value={printBack} onkeydown={handleKeydown} />
    </label>
  </div>

  <label class="form-field full">
    <span class="field-label">약 이름 (선택)</span>
    <input type="text" placeholder="약 이름의 일부" bind:value={itemName} onkeydown={handleKeydown} />
  </label>

  <div class="btn-row">
    <button class="search-btn" onclick={handleSearch} disabled={!hasInput || isLoading}>
      {#if isLoading}검색 중...{:else}낱알 검색{/if}
    </button>
    {#if searched}
      <button class="reset-btn" onclick={handleReset}>초기화</button>
    {/if}
  </div>
</div>

{#if searched && !isLoading}
  {#if results.length === 0}
    <div class="no-result">조건에 맞는 낱알 정보가 없습니다.</div>
  {:else}
    <p class="result-count">총 {totalCount.toLocaleString()}건 중 {results.length}건 표시</p>
    <div class="pill-list">
      {#each results as item (item.itemSeq)}
        <div class="pill-card" class:pill-card-danger={$myDrugContraMap.has(item.itemSeq)}>
          {#if item.imageUrl}
            <img src={item.imageUrl} alt={item.itemName} class="pill-img" loading="lazy" />
          {:else}
            <div class="pill-img pill-img-empty">이미지 없음</div>
          {/if}
          <div class="pill-info">
            <span class="pill-name">{item.itemName}</span>
            <span class="pill-meta">{item.entpName}</span>
            {#if item.className}
              <span class="pill-class">{item.className}</span>
            {/if}
            <span class="pill-detail">
              {item.shape} · {item.colorFront}{item.colorBack ? ` / ${item.colorBack}` : ''}
              {#if item.printFront} · {item.printFront}{/if}
              {#if item.printBack} / {item.printBack}{/if}
            </span>
            {#if item.ingredientNames.length > 0}
              <span class="pill-ingr">{item.ingredientNames.join(', ')}</span>
            {/if}
            {#if $myDrugContraMap.has(item.itemSeq)}
              <span class="pill-contra-warn">
                {$myDrugContraMap.get(item.itemSeq)?.map(c => c.myDrugName).join(', ')}과(와) 병용금기
              </span>
            {/if}
          </div>
          <button
            class="add-btn"
            onclick={() => addDrug(item)}
            disabled={$selectedDrugs.some(d => d.itemSeq === item.itemSeq)}
            title={$selectedDrugs.some(d => d.itemSeq === item.itemSeq) ? '이미 추가됨' : '약 목록에 추가'}
          >
            {#if $selectedDrugs.some(d => d.itemSeq === item.itemSeq)}
              &#10003;
            {:else}
              +
            {/if}
          </button>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .identify-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }
  .form-row {
    display: flex;
    gap: 10px;
  }
  .form-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .form-field.full { width: 100%; }
  .field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }
  select {
    font: inherit;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    background: var(--card-bg);
    color: var(--text-h);
    outline: none;
    width: 100%;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .btn-row {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  .search-btn {
    flex: 1;
    padding: 11px;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 15px;
    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);
  }
  .search-btn:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: 0 3px 8px rgba(37, 99, 235, 0.3);
  }
  .search-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
  .reset-btn {
    padding: 10px 16px;
    background: var(--card-bg);
    color: var(--text-muted);
    border: 1px solid var(--border);
    font-size: 14px;
  }
  .reset-btn:hover { background: var(--bg); }

  .no-result {
    text-align: center;
    padding: 28px;
    color: var(--text-muted);
    font-size: 14px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .result-count {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  .pill-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }
  .pill-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    transition: box-shadow 0.15s;
  }
  .pill-card:hover {
    box-shadow: var(--shadow-md);
  }
  .pill-img {
    width: 64px;
    height: 64px;
    object-fit: contain;
    border-radius: 8px;
    background: var(--bg);
    flex-shrink: 0;
  }
  .pill-img-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--text-muted);
    border: 1px dashed var(--border);
  }
  .pill-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .pill-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-h);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pill-meta { font-size: 12px; color: var(--text-muted); }
  .pill-class { font-size: 11px; color: var(--accent); }
  .pill-detail { font-size: 11px; color: var(--text-muted); }
  .pill-ingr { font-size: 11px; color: var(--accent); }
  .pill-contra-warn {
    font-size: 11px;
    color: var(--danger);
    font-weight: 600;
  }
  .pill-card-danger {
    border-color: var(--danger);
    border-left: 4px solid var(--danger);
  }

  .add-btn {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: #fff;
    border-radius: 50%;
    font-size: 18px;
    font-weight: 700;
    padding: 0;
    line-height: 1;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.2);
  }
  .add-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .add-btn:disabled {
    background: var(--safe);
    cursor: default;
    font-size: 14px;
    box-shadow: none;
  }

  @media (max-width: 480px) {
    .form-row { flex-direction: column; }
    .pill-img { width: 56px; height: 56px; }
  }
</style>
