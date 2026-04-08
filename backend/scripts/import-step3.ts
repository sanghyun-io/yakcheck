/**
 * Step 3만 실행: ITEM_SEQ → INGR_CODE 매핑
 * 실행: npx tsx scripts/import-step3.ts
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const API_KEY = process.env.DATA_GO_KR_API_KEY!;
const DELAY_MS = 200;

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchApi(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function main() {
  console.log('Step 3: 품목→성분 매핑 추출');

  const ingrResult = await pool.query(`
    SELECT DISTINCT code FROM (
      SELECT ingredient_code_a AS code FROM yakcheck.contraindications
      UNION
      SELECT ingredient_code_b AS code FROM yakcheck.contraindications
    ) t
  `);
  const ingrCodes = ingrResult.rows.map((r) => r.code);
  console.log(`성분코드 ${ingrCodes.length}개`);

  const mapping = new Map<string, Set<string>>();
  let apiCalls = 0;
  let errors = 0;

  for (const ingrCode of ingrCodes) {
    await sleep(DELAY_MS);
    apiCalls++;
    if (apiCalls % 50 === 0) console.log(`  ${apiCalls}/${ingrCodes.length}...`);

    try {
      // 첫 페이지만 가져옴 (각 성분코드별 100건이면 대부분 충분)
      const url = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03?serviceKey=${API_KEY}&ingrCode=${ingrCode}&pageNo=1&numOfRows=100&type=json`;
      const data = await fetchApi(url);
      const items = data.body.items;
      if (!items || data.body.totalCount === 0) continue;

      const itemArr = Array.isArray(items) ? items : [items];
      for (const d of itemArr) {
        if (d.ITEM_SEQ) {
          if (!mapping.has(d.ITEM_SEQ)) mapping.set(d.ITEM_SEQ, new Set());
          mapping.get(d.ITEM_SEQ)!.add(d.INGR_CODE || ingrCode);
        }
        if (d.MIXTURE_ITEM_SEQ && d.MIXTURE_INGR_CODE) {
          if (!mapping.has(d.MIXTURE_ITEM_SEQ)) mapping.set(d.MIXTURE_ITEM_SEQ, new Set());
          mapping.get(d.MIXTURE_ITEM_SEQ)!.add(d.MIXTURE_INGR_CODE);
        }
      }
    } catch (err: any) {
      errors++;
      if (errors <= 5) console.error(`  Error ${ingrCode}: ${err.message}`);
    }
  }

  console.log(`API 호출: ${apiCalls}, 에러: ${errors}`);
  console.log(`매핑된 품목 수: ${mapping.size}`);

  // DB 업데이트
  let updated = 0;
  for (const [itemSeq, codes] of mapping) {
    const codesArr = Array.from(codes);
    const namesResult = await pool.query(`
      SELECT DISTINCT name FROM (
        SELECT ingredient_name_a AS name FROM yakcheck.contraindications WHERE ingredient_code_a = ANY($1)
        UNION
        SELECT ingredient_name_b AS name FROM yakcheck.contraindications WHERE ingredient_code_b = ANY($1)
      ) t WHERE name IS NOT NULL
    `, [codesArr]);
    const namesArr = namesResult.rows.map((r) => r.name);

    const result = await pool.query(
      `UPDATE yakcheck.drugs SET ingredient_codes = $2, ingredient_names = $3, updated_at = NOW() WHERE item_seq = $1`,
      [itemSeq, codesArr, namesArr],
    );
    if (result.rowCount && result.rowCount > 0) updated++;
  }

  console.log(`DB 업데이트: ${updated}건`);

  // 결과 통계
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM yakcheck.drugs WHERE ingredient_codes IS NOT NULL AND array_length(ingredient_codes, 1) > 0) AS mapped,
      (SELECT COUNT(*) FROM yakcheck.drugs) AS total
  `);
  console.log(`매핑 완료: ${stats.rows[0].mapped}/${stats.rows[0].total}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
