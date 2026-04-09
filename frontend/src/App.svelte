<script lang="ts">
  import DrugSearch from './lib/DrugSearch.svelte';
  import PillIdentify from './lib/PillIdentify.svelte';
  import MyDrugs from './lib/MyDrugs.svelte';
  import SelectedDrugs from './lib/SelectedDrugs.svelte';
  import CheckResult from './lib/CheckResult.svelte';
  import { myDrugs } from './lib/stores';

  let activeTab = $state<'search' | 'identify' | 'mydrugs'>('search');
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
    <button class="tab" class:active={activeTab === 'mydrugs'} onclick={() => activeTab = 'mydrugs'}>
      내 약{#if $myDrugs.length > 0}<span class="tab-badge">{$myDrugs.length}</span>{/if}
    </button>
  </div>

  {#if activeTab === 'search'}
    <DrugSearch />
  {:else if activeTab === 'identify'}
    <PillIdentify />
  {:else}
    <MyDrugs />
  {/if}

  {#if activeTab !== 'mydrugs'}
    <SelectedDrugs />
    <CheckResult />
  {/if}
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
  .tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 700;
    margin-left: 4px;
    background: var(--danger);
    color: #fff;
  }
  .tab.active .tab-badge {
    background: rgba(255,255,255,0.3);
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
