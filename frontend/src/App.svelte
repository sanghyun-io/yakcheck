<script lang="ts">
  import DrugSearch from './lib/DrugSearch.svelte';
  import PillIdentify from './lib/PillIdentify.svelte';
  import SelectedDrugs from './lib/SelectedDrugs.svelte';
  import CheckResult from './lib/CheckResult.svelte';

  let activeTab = $state<'search' | 'identify'>('search');
</script>

<header>
  <h1>약체크</h1>
  <p class="subtitle">여러 약을 함께 먹어도 되는지 확인하세요</p>
</header>

<main>
  <div class="tabs">
    <button class="tab" class:active={activeTab === 'search'} onclick={() => activeTab = 'search'}>
      이름 검색
    </button>
    <button class="tab" class:active={activeTab === 'identify'} onclick={() => activeTab = 'identify'}>
      낱알 식별
    </button>
  </div>

  {#if activeTab === 'search'}
    <DrugSearch />
  {:else}
    <PillIdentify />
  {/if}

  <SelectedDrugs />
  <CheckResult />
</main>

<footer>
  <p>공공데이터포털(data.go.kr) DUR 병용금기 정보 기반 &middot; 의료 판단을 대체하지 않습니다</p>
</footer>

<style>
  header {
    text-align: center;
    padding: 32px 0 24px;
  }
  h1 {
    font-size: 32px;
    font-weight: 700;
    color: var(--text-h);
    margin: 0 0 6px;
    letter-spacing: -0.5px;
  }
  .subtitle {
    color: var(--text-muted);
    font-size: 15px;
  }
  main {
    margin-top: 8px;
  }
  .tabs {
    display: flex;
    gap: 0;
    margin-bottom: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .tab {
    flex: 1;
    padding: 10px;
    background: var(--card-bg);
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 500;
    border-radius: 0;
    transition: background 0.15s, color 0.15s;
  }
  .tab:hover { background: var(--bg); }
  .tab.active {
    background: var(--accent);
    color: #fff;
  }
  footer {
    margin-top: 48px;
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    padding: 16px 0;
    border-top: 1px solid var(--border);
  }
</style>
