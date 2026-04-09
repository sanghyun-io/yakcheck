const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface DrugSearchItem {
  itemSeq: string;
  itemName: string;
  entpName: string;
  ingredientNames: string[];
  hasDurData: boolean;
}

export interface CheckResult {
  pairs: Array<{
    drugA: { itemSeq: string; itemName: string };
    drugB: { itemSeq: string; itemName: string };
    reason: string;
  }>;
  summary: { contraindicated: number; safe: number };
  unmappedDrugs: Array<{ itemSeq: string; itemName: string }>;
}

export function searchDrugs(q: string): Promise<{ items: DrugSearchItem[] }> {
  return request(`/drugs?q=${encodeURIComponent(q)}`);
}

export function checkInteractions(drugIds: string[]): Promise<CheckResult> {
  return request('/check', {
    method: 'POST',
    body: JSON.stringify({ drugIds }),
  });
}

export interface IdentifyItem {
  itemSeq: string;
  itemName: string;
  entpName: string;
  imageUrl: string | null;
  shape: string;
  colorFront: string;
  colorBack: string | null;
  printFront: string | null;
  printBack: string | null;
  className: string | null;
  etcOtcName: string | null;
  inDb: boolean;
  hasDurData: boolean;
  ingredientNames: string[];
}

export function identifyPill(params: Record<string, string>): Promise<{ items: IdentifyItem[]; totalCount: number }> {
  const qs = new URLSearchParams(params).toString();
  return request(`/identify?${qs}`);
}

export interface FilterOption {
  value: string;
  count: number;
}

export function getIdentifyOptions(): Promise<{ shapes: FilterOption[]; colors: FilterOption[] }> {
  return request('/identify/options');
}
