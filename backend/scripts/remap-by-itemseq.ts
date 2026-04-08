/**
 * Phase A: 미매핑 약을 itemSeq로 DUR 품목정보 API 조회하여 INGR_CODE 매핑
 * Phase B: 약 이름에서 성분명 텍스트 매칭으로 추가 매핑
 *
 * 실행: npx tsx scripts/remap-by-itemseq.ts
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const API_KEY = process.env.DATA_GO_KR_API_KEY!;
const DELAY_MS = 200;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchApi(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function phaseA() {
  console.log('=== Phase A: DUR 품목정보 API (itemSeq 조회) ===');

  const unmapped = await pool.query(
    `SELECT item_seq FROM yakcheck.drugs WHERE ingredient_codes IS NULL ORDER BY item_seq`
  );
  console.log(`미매핑 약: ${unmapped.rows.length}개`);

  let apiCalls = 0;
  let hits = 0;
  let errors = 0;
  let updated = 0;

  for (const row of unmapped.rows) {
    const itemSeq = row.item_seq;
    await sleep(DELAY_MS);
    apiCalls++;

    if (apiCalls % 100 === 0) {
      console.log(`  ${apiCalls}/${unmapped.rows.length} (hits: ${hits}, errors: ${errors})`);
    }

    try {
      const url = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03?serviceKey=${API_KEY}&itemSeq=${itemSeq}&pageNo=1&numOfRows=100&type=json&typeName=%EB%B3%91%EC%9A%A9%EA%B8%88%EA%B8%B0`;
      const data = await fetchApi(url);

      const totalCount = data.body?.totalCount ?? 0;
      if (totalCount === 0) continue;

      const items = data.body.items;
      if (!items) continue;

      // items can be {item: {...}} or {item: [{...}, ...]}
      let itemArr: any[];
      if (Array.isArray(items)) {
        itemArr = items;
      } else if (items.item) {
        itemArr = Array.isArray(items.item) ? items.item : [items.item];
      } else {
        itemArr = [items];
      }

      // Extract unique INGR_CODEs for this drug
      const codes = new Set<string>();
      for (const d of itemArr) {
        if (d.INGR_CODE) codes.add(d.INGR_CODE);
      }

      if (codes.size === 0) continue;
      hits++;

      const codesArr = Array.from(codes);

      // Look up ingredient names from contraindications table
      const namesResult = await pool.query(`
        SELECT DISTINCT name FROM (
          SELECT ingredient_name_a AS name FROM yakcheck.contraindications WHERE ingredient_code_a = ANY($1)
          UNION
          SELECT ingredient_name_b AS name FROM yakcheck.contraindications WHERE ingredient_code_b = ANY($1)
        ) t WHERE name IS NOT NULL
      `, [codesArr]);
      const namesArr = namesResult.rows.map((r: any) => r.name);

      const result = await pool.query(
        `UPDATE yakcheck.drugs SET ingredient_codes = $2, ingredient_names = $3, updated_at = NOW() WHERE item_seq = $1`,
        [itemSeq, codesArr, namesArr],
      );
      if (result.rowCount && result.rowCount > 0) updated++;

    } catch (err: any) {
      errors++;
      if (errors <= 10) console.error(`  Error ${itemSeq}: ${err.message}`);
    }
  }

  console.log(`\nPhase A 완료:`);
  console.log(`  API 호출: ${apiCalls}, 히트: ${hits}, 에러: ${errors}`);
  console.log(`  DB 업데이트: ${updated}건`);
}

async function phaseB() {
  console.log('\n=== Phase B: 약 이름 텍스트 매칭 ===');

  // Get all unique ingredient names from contraindications
  const ingrResult = await pool.query(`
    SELECT DISTINCT code, name FROM (
      SELECT ingredient_code_a AS code, ingredient_name_a AS name FROM yakcheck.contraindications
      UNION
      SELECT ingredient_code_b AS code, ingredient_name_b AS name FROM yakcheck.contraindications
    ) t WHERE name IS NOT NULL AND name != ''
    ORDER BY length(name) DESC
  `);
  console.log(`DUR 성분명: ${ingrResult.rows.length}개`);

  // Get remaining unmapped drugs
  const unmapped = await pool.query(
    `SELECT item_seq, item_name FROM yakcheck.drugs WHERE ingredient_codes IS NULL`
  );
  console.log(`Phase A 후 미매핑 약: ${unmapped.rows.length}개`);

  let matched = 0;

  for (const drug of unmapped.rows) {
    const drugName = drug.item_name;

    // Try to find ingredient name in drug name (usually in parentheses)
    const matchedIngredients: { code: string; name: string }[] = [];

    for (const ingr of ingrResult.rows) {
      // Match ingredient name in drug name (e.g., "타이레놀정500밀리그람(아세트아미노펜)")
      if (drugName.includes(ingr.name) && ingr.name.length >= 2) {
        matchedIngredients.push({ code: ingr.code, name: ingr.name });
      }
    }

    if (matchedIngredients.length === 0) continue;

    // Deduplicate by code
    const codeMap = new Map<string, string>();
    for (const m of matchedIngredients) {
      if (!codeMap.has(m.code)) codeMap.set(m.code, m.name);
    }

    const codesArr = Array.from(codeMap.keys());
    const namesArr = Array.from(codeMap.values());

    await pool.query(
      `UPDATE yakcheck.drugs SET ingredient_codes = $2, ingredient_names = $3, updated_at = NOW() WHERE item_seq = $1`,
      [drug.item_seq, codesArr, namesArr],
    );
    matched++;
  }

  console.log(`Phase B 매칭: ${matched}건`);
}

async function main() {
  await phaseA();
  await phaseB();

  // Final stats
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM yakcheck.drugs) AS total,
      (SELECT COUNT(*) FROM yakcheck.drugs WHERE ingredient_codes IS NOT NULL) AS mapped,
      (SELECT COUNT(*) FROM yakcheck.drugs WHERE ingredient_codes IS NULL) AS unmapped
  `);
  console.log(`\n=== 최종 결과 ===`);
  console.log(`  전체: ${stats.rows[0].total}`);
  console.log(`  매핑됨: ${stats.rows[0].mapped}`);
  console.log(`  미매핑: ${stats.rows[0].unmapped}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
