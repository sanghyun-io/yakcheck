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
    <p class="empty-hint">위에서 약을 검색하여 추가하세요 (최소 2개)</p>
  {:else}
    <div class="chips">
      {#each $selectedDrugs as drug (drug.itemSeq)}
        <span class="chip">
          {drug.itemName}
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
    padding: 20px;
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    font-size: 14px;
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
    padding: 6px 10px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
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

  .check-btn {
    width: 100%;
    padding: 12px;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 16px;
  }
  .check-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .check-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
