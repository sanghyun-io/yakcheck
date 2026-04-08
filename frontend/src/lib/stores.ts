import { writable } from 'svelte/store';
import type { DrugSearchItem, CheckResult } from './api';

export const selectedDrugs = writable<DrugSearchItem[]>([]);
export const checkResult = writable<CheckResult | null>(null);
export const isChecking = writable(false);
