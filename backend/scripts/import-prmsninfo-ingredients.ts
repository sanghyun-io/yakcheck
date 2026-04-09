/**
 * 의약품 허가정보 API(DrugPrdtPrmsnInfoService07)에서 원료명(주성분)을 수집하여
 * contraindications의 미커버 D-code를 drugs 테이블에 매핑.
 *
 * DUR 품목 API에 등록되지 않은 136개 D-code를 커버하기 위한 보완 소스.
 *
 * API: getDrugPrdtMcpnDtlInq07 (127,709건)
 *   - ITEM_SEQ: 품목기준코드
 *   - MTRAL_NM: 원료명 (한글)
 *   - MAIN_INGR_ENG: 주성분 영문명
 *
 * 실행: npx tsx scripts/import-prmsninfo-ingredients.ts
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const API_KEY = process.env.DATA_GO_KR_API_KEY!;

const PAGE_SIZE = 500;
const DELAY_MS = 200;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * 원료명(MTRAL_NM)이 DUR 성분명(ingrName)과 매칭되는지 판정.
 * 부분문자열 오매칭 방지: 성분명 앞에 한글 문자가 있으면 제외.
 * 예: "에스시탈로프람" 안에서 "시탈로프람"을 찾더라도, 앞에 "에스"(한글)가 있으므로 제외.
 */
function isIngredientMatch(mtralNm: string, ingrName: string): boolean {
  if (ingrName.length < 2) return false;
  const idx = mtralNm.indexOf(ingrName);
  if (idx === -1) return false;
  if (idx > 0) {
    const prevChar = mtralNm[idx - 1];
    if (/[가-힣]/.test(prevChar)) return false;
  }
  return true;
}

// ─── Part 1: 미커버 D-code 목록 추출 ─────────────────────

async function getMissingDcodes(): Promise<Map<string, string>> {
  const result = await pool.query(`
    WITH drug_dcodes AS (
      SELECT DISTINCT unnest(ingredient_codes) AS dcode
      FROM yakcheck.drugs WHERE ingredient_codes IS NOT NULL
    ),
    missing AS (
      SELECT DISTINCT dcode, name FROM (
        SELECT ingredient_code_a AS dcode, ingredient_name_a AS name FROM yakcheck.contraindications
        UNION
        SELECT ingredient_code_b AS dcode, ingredient_name_b AS name FROM yakcheck.contraindications
      ) t
      WHERE dcode NOT IN (SELECT dcode FROM drug_dcodes)
        AND name IS NOT NULL AND name != ''
    )
    SELECT dcode, name FROM missing ORDER BY dcode
  `);

  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(row.dcode, row.name);
  }
  return map;
}

// ─── Part 2: 허가정보 API 수집 ────────────────────────────

interface PrmsnItem {
  ITEM_SEQ: string;
  MTRAL_NM: string;
  MAIN_INGR_ENG: string;
  PRDUCT: string;
}

async function fetchAllPrmsnIngredients(): Promise<PrmsnItem[]> {
  const BASE = `https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtMcpnDtlInq07`;

  // 총 건수 확인
  const countUrl = `${BASE}?serviceKey=${API_KEY}&pageNo=1&numOfRows=1&type=json`;
  const countRes = await fetch(countUrl);
  const countData = await countRes.json();
  const totalCount = countData.body?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`  허가정보 주성분: ${totalCount}건, ${totalPages}페이지`);

  const allItems: PrmsnItem[] = [];
  let errors = 0;

  for (let page = 1; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    try {
      const url = `${BASE}?serviceKey=${API_KEY}&pageNo=${page}&numOfRows=${PAGE_SIZE}&type=json`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.header?.resultCode !== '00') {
        errors++;
        continue;
      }

      const items = data.body?.items;
      if (!items) continue;

      const itemArr = Array.isArray(items) ? items : [items];
      for (const it of itemArr) {
        if (it.ITEM_SEQ && it.MTRAL_NM) {
          allItems.push({
            ITEM_SEQ: it.ITEM_SEQ,
            MTRAL_NM: it.MTRAL_NM,
            MAIN_INGR_ENG: it.MAIN_INGR_ENG || '',
            PRDUCT: it.PRDUCT || '',
          });
        }
      }
    } catch (err: any) {
      errors++;
      if (errors <= 5) console.error(`    Page ${page} error: ${err.message}`);
    }

    if (page % 50 === 0) console.log(`    ${page}/${totalPages} pages (${allItems.length} items, ${errors} errors)`);
  }

  console.log(`  수집 완료: ${allItems.length}건 (에러 ${errors}건)`);
  return allItems;
}

// ─── Part 3: 교차 매칭 + DB upsert ──────────────────────

async function matchAndUpsert(
  missingDcodes: Map<string, string>,
  prmsnItems: PrmsnItem[],
) {
  // ITEM_SEQ → MTRAL_NM[] 맵 구축
  const itemIngredients = new Map<string, Set<string>>();
  for (const it of prmsnItems) {
    if (!itemIngredients.has(it.ITEM_SEQ)) {
      itemIngredients.set(it.ITEM_SEQ, new Set());
    }
    itemIngredients.get(it.ITEM_SEQ)!.add(it.MTRAL_NM);
  }
  console.log(`  고유 ITEM_SEQ: ${itemIngredients.size}개`);

  // 각 ITEM_SEQ에 대해 미커버 D-code 매칭
  const itemDcodeMap = new Map<string, Set<string>>();   // ITEM_SEQ → matched D-codes
  const itemDnameMap = new Map<string, Set<string>>();   // ITEM_SEQ → matched ingredient names

  for (const [itemSeq, mtralNames] of itemIngredients) {
    for (const mtralNm of mtralNames) {
      for (const [dcode, ingrName] of missingDcodes) {
        if (isIngredientMatch(mtralNm, ingrName)) {
          if (!itemDcodeMap.has(itemSeq)) {
            itemDcodeMap.set(itemSeq, new Set());
            itemDnameMap.set(itemSeq, new Set());
          }
          itemDcodeMap.get(itemSeq)!.add(dcode);
          itemDnameMap.get(itemSeq)!.add(ingrName);
        }
      }
    }
  }

  console.log(`  매칭된 ITEM_SEQ: ${itemDcodeMap.size}개`);

  // 매칭된 D-code 통계
  const matchedDcodes = new Set<string>();
  for (const codes of itemDcodeMap.values()) {
    for (const c of codes) matchedDcodes.add(c);
  }
  console.log(`  복구된 D-code: ${matchedDcodes.size}/${missingDcodes.size}개`);

  // DB upsert
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const [itemSeq, dcodes] of itemDcodeMap) {
    const codesArr = Array.from(dcodes);
    const namesArr = Array.from(itemDnameMap.get(itemSeq)!);

    try {
      const result = await pool.query(`
        INSERT INTO yakcheck.drugs (item_seq, item_name, entp_name, ingredient_codes, ingredient_names, updated_at)
        VALUES ($1, '', '', $2, $3, NOW())
        ON CONFLICT (item_seq) DO UPDATE SET
          ingredient_codes = (
            SELECT ARRAY(SELECT DISTINCT unnest(
              COALESCE(yakcheck.drugs.ingredient_codes, ARRAY[]::text[]) || $2
            ))
          ),
          ingredient_names = (
            SELECT ARRAY(SELECT DISTINCT unnest(
              COALESCE(yakcheck.drugs.ingredient_names, ARRAY[]::text[]) || $3
            ))
          ),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `, [itemSeq, codesArr, namesArr]);

      if (result.rows[0]?.is_insert) inserted++;
      else updated++;
    } catch (err: any) {
      skipped++;
      if (skipped <= 5) console.error(`    Upsert error ${itemSeq}: ${err.message}`);
    }
  }

  console.log(`  DB 결과: 신규 ${inserted}건, 업데이트 ${updated}건, 스킵 ${skipped}건`);
}

// ─── Part 4: 커버리지 검증 ──────────────────────────────

async function verifyCoverage() {
  console.log('\n══ 커버리지 검증 ══');

  const result = await pool.query(`
    WITH drug_codes AS (
      SELECT DISTINCT unnest(ingredient_codes) AS code
      FROM yakcheck.drugs WHERE ingredient_codes IS NOT NULL
    ),
    contra_codes AS (
      SELECT DISTINCT ingredient_code_a AS code FROM yakcheck.contraindications
      UNION
      SELECT DISTINCT ingredient_code_b FROM yakcheck.contraindications
    )
    SELECT
      (SELECT COUNT(*) FROM yakcheck.drugs) AS total_drugs,
      (SELECT COUNT(*) FROM yakcheck.drugs WHERE ingredient_codes IS NOT NULL AND array_length(ingredient_codes, 1) > 0) AS mapped_drugs,
      (SELECT COUNT(*) FROM yakcheck.contraindications) AS total_contra,
      (SELECT COUNT(*) FROM drug_codes) AS drug_dcodes,
      (SELECT COUNT(*) FROM contra_codes) AS contra_dcodes,
      (SELECT COUNT(*) FROM drug_codes d JOIN contra_codes c ON d.code = c.code) AS overlapping,
      (SELECT COUNT(*) FROM contra_codes c WHERE c.code NOT IN (SELECT code FROM drug_codes)) AS contra_only
  `);

  const r = result.rows[0];
  console.log(`  drugs: ${r.total_drugs}건 (매핑됨: ${r.mapped_drugs})`);
  console.log(`  contraindications: ${r.total_contra}건`);
  console.log(`  D-code 커버리지: ${r.overlapping}/${r.contra_dcodes} (${(parseInt(r.overlapping) / parseInt(r.contra_dcodes) * 100).toFixed(1)}%)`);
  console.log(`  미커버 D-code: ${r.contra_only}개`);

  // 금기 규칙 체크 가능률
  const matchable = await pool.query(`
    WITH drug_codes AS (
      SELECT DISTINCT unnest(ingredient_codes) AS code
      FROM yakcheck.drugs WHERE ingredient_codes IS NOT NULL
    )
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN a_ok AND b_ok THEN 1 END) AS both_matched,
      COUNT(CASE WHEN a_ok AND NOT b_ok THEN 1 END) AS a_only,
      COUNT(CASE WHEN NOT a_ok AND b_ok THEN 1 END) AS b_only,
      COUNT(CASE WHEN NOT a_ok AND NOT b_ok THEN 1 END) AS neither
    FROM (
      SELECT
        EXISTS(SELECT 1 FROM drug_codes d WHERE d.code = c.ingredient_code_a) AS a_ok,
        EXISTS(SELECT 1 FROM drug_codes d WHERE d.code = c.ingredient_code_b) AS b_ok
      FROM yakcheck.contraindications c
    ) sub
  `);

  const m = matchable.rows[0];
  const pct = (parseInt(m.both_matched) / parseInt(m.total) * 100).toFixed(1);
  console.log(`\n  금기 규칙 체크 가능률: ${m.both_matched}/${m.total} (${pct}%)`);
  console.log(`    한쪽만 매칭: ${parseInt(m.a_only) + parseInt(m.b_only)}건`);
  console.log(`    양쪽 미매칭: ${m.neither}건`);
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  허가정보 API 기반 D-code 커버리지 확대          ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    console.log('\n══ Part 1: 미커버 D-code 추출 ══');
    const missingDcodes = await getMissingDcodes();
    console.log(`  미커버 D-code: ${missingDcodes.size}개`);

    console.log('\n══ Part 2: 허가정보 API 수집 ══');
    const prmsnItems = await fetchAllPrmsnIngredients();

    console.log('\n══ Part 3: 교차 매칭 + DB upsert ══');
    await matchAndUpsert(missingDcodes, prmsnItems);

    await verifyCoverage();
  } catch (err) {
    console.error('\n에러:', err);
  } finally {
    await pool.end();
  }
}

main();
