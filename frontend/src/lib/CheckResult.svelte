<script lang="ts">
  import { checkResult } from './stores';
</script>

{#if $checkResult}
  <div class="results">
    <!-- Summary -->
    <div class="summary">
      {#if $checkResult.summary.danger > 0}
        <div class="summary-item danger">
          <span class="count">{$checkResult.summary.danger}</span>
          <span class="label">위험</span>
        </div>
      {/if}
      {#if $checkResult.summary.caution > 0}
        <div class="summary-item warning">
          <span class="count">{$checkResult.summary.caution}</span>
          <span class="label">주의</span>
        </div>
      {/if}
      <div class="summary-item safe">
        <span class="count">{$checkResult.summary.safe}</span>
        <span class="label">안전</span>
      </div>
    </div>

    <!-- Unmapped drugs warning -->
    {#if $checkResult.unmappedDrugs?.length > 0}
      <div class="unmapped-warning">
        <strong>DUR 미등록 약:</strong>
        {$checkResult.unmappedDrugs.map(d => d.itemName).join(', ')}
        <p>위 약은 DUR 병용금기 데이터가 등록되지 않아 교차 검사가 제한됩니다.</p>
      </div>
    {/if}

    <!-- Pair cards -->
    {#if $checkResult.pairs.length === 0}
      <div class="no-issues">
        <span class="no-issues-icon">&#10003;</span>
        <p>선택한 약 사이에 알려진 병용금기가 없습니다.</p>
      </div>
    {:else}
      <div class="cards">
        {#each $checkResult.pairs as pair}
          <div class="card" class:card-danger={pair.severity === 'critical'} class:card-warning={pair.severity === 'warning'}>
            <div class="card-header">
              <span class="severity-badge" class:badge-danger={pair.severity === 'critical'} class:badge-warning={pair.severity === 'warning'}>
                {pair.severity === 'critical' ? '위험' : '주의'}
              </span>
              <span class="pair-names">
                {pair.drugA.itemName} <span class="arrow">&harr;</span> {pair.drugB.itemName}
              </span>
            </div>
            {#if pair.type}
              <div class="card-type">{pair.type}</div>
            {/if}
            {#if pair.reason}
              <div class="card-reason">{pair.reason}</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .results { margin-top: 8px; }

  .unmapped-warning {
    background: var(--warning-bg);
    border: 1px solid var(--warning-border);
    border-radius: var(--radius);
    padding: 12px 16px;
    margin-bottom: 16px;
    font-size: 14px;
    color: var(--text);
  }
  .unmapped-warning strong { color: var(--warning); }
  .unmapped-warning p { margin: 6px 0 0; font-size: 13px; color: var(--text-muted); }

  .summary {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }
  .summary-item {
    flex: 1;
    text-align: center;
    padding: 14px 8px;
    border-radius: var(--radius);
    border: 1px solid;
  }
  .summary-item.danger { background: var(--danger-bg); border-color: var(--danger-border); }
  .summary-item.warning { background: var(--warning-bg); border-color: var(--warning-border); }
  .summary-item.safe { background: var(--safe-bg); border-color: var(--safe-border); }
  .count { display: block; font-size: 28px; font-weight: 700; line-height: 1; }
  .danger .count { color: var(--danger); }
  .warning .count { color: var(--warning); }
  .safe .count { color: var(--safe); }
  .label { font-size: 13px; color: var(--text-muted); margin-top: 4px; display: block; }

  .no-issues {
    text-align: center;
    padding: 32px 16px;
    background: var(--safe-bg);
    border: 1px solid var(--safe-border);
    border-radius: var(--radius);
    color: var(--safe);
  }
  .no-issues-icon { font-size: 36px; display: block; margin-bottom: 8px; }
  .no-issues p { color: var(--text); }

  .cards { display: flex; flex-direction: column; gap: 12px; }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .card-danger { border-left: 4px solid var(--danger); }
  .card-warning { border-left: 4px solid var(--warning); }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .severity-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .badge-danger { background: var(--danger); color: #fff; }
  .badge-warning { background: var(--warning); color: #fff; }
  .pair-names { font-weight: 500; color: var(--text-h); font-size: 15px; }
  .arrow { color: var(--text-muted); margin: 0 2px; }

  .card-type { font-size: 13px; color: var(--text-muted); margin-bottom: 6px; }
  .card-reason { font-size: 14px; line-height: 1.6; color: var(--text); }
</style>
