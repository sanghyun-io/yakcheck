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
  <div class="logo">
    <span class="logo-icon">💊</span>
    <h1>약체크</h1>
  </div>
  <p class="subtitle">여러 약을 함께 먹어도 되는지 확인하세요</p>
</header>

<main>
  <nav class="tabs" role="tablist">
    <button class="tab" class:active={activeTab === 'search'} onclick={() => activeTab = 'search'} role="tab" aria-selected={activeTab === 'search'}>
      <svg class="tab-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"/></svg>
      이름 검색
    </button>
    <button class="tab" class:active={activeTab === 'identify'} onclick={() => activeTab = 'identify'} role="tab" aria-selected={activeTab === 'identify'}>
      <svg class="tab-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm-8-5a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 012 10zm13 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0115 10zM10 6a4 4 0 100 8 4 4 0 000-8zm-2.5 4a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0z"/></svg>
      낱알 식별
    </button>
    <button class="tab" class:active={activeTab === 'mydrugs'} onclick={() => activeTab = 'mydrugs'} role="tab" aria-selected={activeTab === 'mydrugs'}>
      <svg class="tab-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M7 8a3 3 0 100-6 3 3 0 000 6zm7.5 1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z"/></svg>
      내 약{#if $myDrugs.length > 0}<span class="tab-badge">{$myDrugs.length}</span>{/if}
    </button>
  </nav>

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
    padding: 28px 0 20px;
  }
  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .logo-icon {
    font-size: 28px;
    line-height: 1;
  }
  h1 {
    font-size: 26px;
    font-weight: 800;
    color: var(--text-h);
    margin: 0;
    letter-spacing: -0.5px;
  }
  .subtitle {
    color: var(--text-muted);
    font-size: 14px;
  }
  main {
    flex: 1;
  }
  .tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 20px;
    padding: 4px;
    background: var(--card-bg);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }
  .tab {
    flex: 1;
    padding: 9px 8px;
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    border-radius: var(--radius);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .tab-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }
  .tab:hover {
    background: var(--accent-light);
    color: var(--accent);
  }
  .tab.active {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
  }
  .tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    font-size: 10px;
    font-weight: 700;
    margin-left: 2px;
    background: var(--danger);
    color: #fff;
  }
  .tab.active .tab-badge {
    background: rgba(255,255,255,0.3);
  }
  footer {
    margin-top: auto;
    padding-top: 32px;
    text-align: center;
    font-size: 11px;
    color: var(--text-muted);
    padding-bottom: 16px;
  }

  @media (max-width: 480px) {
    header { padding: 20px 0 16px; }
    .logo-icon { font-size: 24px; }
    h1 { font-size: 22px; }
    .tab { font-size: 12px; padding: 8px 4px; gap: 3px; }
    .tab-icon { width: 13px; height: 13px; }
  }
</style>
