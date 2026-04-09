import { writable, derived, get } from 'svelte/store';
import type { DrugSearchItem, CheckResult } from './api';
import { checkInteractions } from './api';

export const selectedDrugs = writable<DrugSearchItem[]>([]);
export const checkResult = writable<CheckResult | null>(null);
export const isChecking = writable(false);

// ── 내 약 (localStorage 연동) ──

const MY_DRUGS_KEY = 'yakcheck_my_drugs';

function loadMyDrugs(): DrugSearchItem[] {
  try {
    const raw = localStorage.getItem(MY_DRUGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const myDrugs = writable<DrugSearchItem[]>(loadMyDrugs());

myDrugs.subscribe((list) => {
  try {
    localStorage.setItem(MY_DRUGS_KEY, JSON.stringify(list));
  } catch { /* quota exceeded 등 무시 */ }
});

export function addMyDrug(drug: DrugSearchItem) {
  myDrugs.update((list) => {
    if (list.some((d) => d.itemSeq === drug.itemSeq)) return list;
    return [...list, drug];
  });
}

export function removeMyDrug(itemSeq: string) {
  myDrugs.update((list) => list.filter((d) => d.itemSeq !== itemSeq));
}

// ── 내 약 금기 캐시 (검색 결과 경고용) ──

export interface MyDrugContra {
  myDrugName: string;
  reason: string;
}

// itemSeq → 금기 내 약 목록
export const myDrugContraMap = writable<Map<string, MyDrugContra[]>>(new Map());

/**
 * 주어진 약 목록과 내 약을 합쳐서 /check API 호출 후
 * 내 약과 금기인 약만 추출하여 contraMap 업데이트
 */
export async function checkAgainstMyDrugs(targetDrugs: Array<{ itemSeq: string; itemName: string }>) {
  const my = get(myDrugs);
  if (my.length === 0 || targetDrugs.length === 0) {
    myDrugContraMap.set(new Map());
    return;
  }

  const mySeqs = new Set(my.map((d) => d.itemSeq));
  const targetSeqs = targetDrugs.filter((d) => !mySeqs.has(d.itemSeq));
  if (targetSeqs.length === 0) {
    myDrugContraMap.set(new Map());
    return;
  }

  const allIds = [...my.map((d) => d.itemSeq), ...targetSeqs.map((d) => d.itemSeq)];
  if (allIds.length < 2) {
    myDrugContraMap.set(new Map());
    return;
  }

  try {
    const result = await checkInteractions(allIds);
    const map = new Map<string, MyDrugContra[]>();

    for (const pair of result.pairs) {
      const aIsMy = mySeqs.has(pair.drugA.itemSeq);
      const bIsMy = mySeqs.has(pair.drugB.itemSeq);

      if (aIsMy && !bIsMy) {
        const list = map.get(pair.drugB.itemSeq) || [];
        list.push({ myDrugName: pair.drugA.itemName, reason: pair.reason });
        map.set(pair.drugB.itemSeq, list);
      } else if (bIsMy && !aIsMy) {
        const list = map.get(pair.drugA.itemSeq) || [];
        list.push({ myDrugName: pair.drugB.itemName, reason: pair.reason });
        map.set(pair.drugA.itemSeq, list);
      }
    }

    myDrugContraMap.set(map);
  } catch {
    myDrugContraMap.set(new Map());
  }
}
