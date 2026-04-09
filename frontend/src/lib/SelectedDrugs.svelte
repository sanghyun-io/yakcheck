<script lang="ts">
  import { selectedDrugs, checkResult, isChecking } from './stores';
  import { checkInteractions } from './api';

  function removeDrug(itemSeq: string) {
    selectedDrugs.update((list) => list.filter((d) => d.itemSeq !== itemSeq));
    checkResult.set(null);
  }

  async function handleCheck() {
    const drugs = $selectedDrugs;
    if (drugs.length < 2) return;

    isChecking.set(true);
    checkResult.set(null);
    try {
      const result = await checkInteractions(drugs.map((d) => d.itemSeq));
      checkResult.set(result);
    } catch (err: any) {
      alert(err.message || '검사 중 오류가 발생했습니다.');
    } finally {
      isChecking.set(false);
    }
  }
</script>

<div class="selected-area">
  {#if $selectedDrugs.length === 0}
    <div class="empty-hint">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <p>위에서 약을 검색하여 추가하세요</p>
      <span class="empty-sub">최소 2개의 약을 선택하면 병용금기를 검사합니다</span>
    </div>
  {:else}
    <div class="chips">
      {#each $selectedDrugs as drug (drug.itemSeq)}
        <span class="chip" class:chip-unmapped={!drug.hasDurData}>
          {drug.itemName}
          {#if !drug.hasDurData}
            <span class="chip-tag">DUR 미등록</span>
          {/if}
          <button class="chip-remove" onclick={() => removeDrug(drug.itemSeq)} aria-label="제거">&times;</button>
        </span>
      {/each}
    </div>

    <button
      class="check-btn"
      onclick={handleCheck}
      disabled={$selectedDrugs.length < 2 || $isChecking}
    >
      {#if $isChecking}
        검사 중...
      {:else}
        병용금기 검사하기 ({$selectedDrugs.length}개)
      {/if}
    </button>
  {/if}
</div>

<style>
  .selected-area {
    margin-bottom: 24px;
  }
  .empty-hint {
    text-align: center;
    color: var(--text-muted);
    padding: 28px 20px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .empty-hint p {
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
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--accent);
    color: #fff;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2);
  }
  .chip-remove {
    background: rgba(255,255,255,0.3);
    color: #fff;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    padding: 0;
    line-height: 1;
  }
  .chip-remove:hover { background: rgba(255,255,255,0.5); }
  .chip-unmapped { background: var(--text-muted); }
  .chip-tag {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255,255,255,0.3);
  }

  .check-btn {
    width: 100%;
    padding: 13px;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 15px;
    border-radius: var(--radius);
    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);
  }
  .check-btn:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: 0 3px 8px rgba(37, 99, 235, 0.3);
  }
  .check-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
</style>
