/**
 * yakcheck 벌크 데이터 적재 스크립트
 *
 * 실행: npx tsx scripts/bulk-import.ts
 *
 * 적재 순서:
 * 1. DUR 성분 병용금기 (1,816건) → contraindications
 * 2. e약은요 약품 정보 (4,712건) → drugs
 * 3. DUR 품목 병용금기에서 ITEM_SEQ ↔ INGR_CODE 매핑 추출 → drugs.ingredient_codes 업데이트
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});

const API_KEY = process.env.DATA_GO_KR_API_KEY!;
const DELAY_MS = 300; // API 호출 간 딜레이

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchApi(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchAllPages(baseUrl: string, rowsPerPage = 100): Promise<any[]> {
  const allItems: any[] = [];
  let pageNo = 1;

  // First request to get totalCount
  const firstUrl = `${baseUrl}&pageNo=1&numOfRows=${rowsPerPage}&type=json`;
  const firstData = await fetchApi(firstUrl);
  const totalCount = firstData.body.totalCount;
  const totalPages = Math.ceil(totalCount / rowsPerPage);

  console.log(`  Total: ${totalCount} items, ${totalPages} pages`);

  // Handle both array and single-item responses
  const firstItems = firstData.body.items;
  if (Array.isArray(firstItems)) {
    allItems.push(...firstItems);
  } else if (firstItems?.item) {
    // DUR 성분정보 wraps items in {item: ...}
    const items = Array.isArray(firstItems.item) ? firstItems.item : [firstItems.item];
    allItems.push(...items);
  }

  for (pageNo = 2; pageNo <= totalPages; pageNo++) {
    if (pageNo % 10 === 0) console.log(`  Page ${pageNo}/${totalPages}...`);
    await sleep(DELAY_MS);
    const url = `${baseUrl}&pageNo=${pageNo}&numOfRows=${rowsPerPage}&type=json`;
    try {
      const data = await fetchApi(url);
      const items = data.body.items;
      if (Array.isArray(items)) {
        allItems.push(...items);
      } else if (items?.item) {
        const itemArr = Array.isArray(items.item) ? items.item : [items.item];
        allItems.push(...itemArr);
      }
    } catch (err) {
      console.error(`  Error on page ${pageNo}:`, err);
      // Continue with next page
    }
  }

  return allItems;
}

// ─── Step 1: DUR 성분 병용금기 ───────────────────────

async function importDurIngredientContraindications() {
  console.log('\n═══ Step 1: DUR 성분 병용금기 적재 ═══');
  const baseUrl = `https://apis.data.go.kr/1471000/DURIrdntInfoService03/getUsjntTabooInfoList02?serviceKey=${API_KEY}`;

  const items = await fetchAllPages(baseUrl);
  console.log(`  Fetched ${items.length} contraindication records`);

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    // item might be wrapped: {item: {...}} or direct {...}
    const d = item.item || item;

    if (d.DEL_YN !== '정상') {
      skipped++;
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO yakcheck.contraindications
         (ingredient_code_a, ingredient_name_a, ingredient_code_b, ingredient_name_b,
          contraindication_type, severity, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (ingredient_code_a, ingredient_code_b) DO UPDATE SET
           reason = EXCLUDED.reason,
           contraindication_type = EXCLUDED.contraindication_type`,
        [
          d.INGR_CODE,
          d.INGR_KOR_NAME,
          d.MIXTURE_INGR_CODE,
          d.MIXTURE_INGR_KOR_NAME,
          d.TYPE_NAME || '병용금기',
          'critical', // DUR 병용금기는 모두 critical
          d.PROHBT_CONTENT,
        ],
      );
      inserted++;
    } catch (err: any) {
      if (!err.message.includes('duplicate')) {
        console.error(`  Insert error for ${d.INGR_CODE}↔${d.MIXTURE_INGR_CODE}:`, err.message);
      }
      skipped++;
    }
  }

  console.log(`  Inserted: ${inserted}, Skipped: ${skipped}`);
}

// ─── Step 2: e약은요 약품 정보 ───────────────────────

async function importDrugInfo() {
  console.log('\n═══ Step 2: e약은요 약품 정보 적재 ═══');
  const baseUrl = `https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList?serviceKey=${API_KEY}`;

  const items = await fetchAllPages(baseUrl);
  console.log(`  Fetched ${items.length} drug records`);

  let inserted = 0;

  for (const d of items) {
    try {
      await pool.query(
        `INSERT INTO yakcheck.drugs
         (item_seq, item_name, entp_name, efficacy, usage_info, caution, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (item_seq) DO UPDATE SET
           item_name = EXCLUDED.item_name,
           entp_name = EXCLUDED.entp_name,
           efficacy = EXCLUDED.efficacy,
           usage_info = EXCLUDED.usage_info,
           caution = EXCLUDED.caution,
           image_url = EXCLUDED.image_url,
           updated_at = NOW()`,
        [
          d.itemSeq,
          d.itemName,
          d.entpName,
          d.efcyQesitm,
          d.useMethodQesitm,
          // Combine all caution fields
          [d.atpnWarnQesitm, d.atpnQesitm, d.intrcQesitm, d.seQesitm]
            .filter(Boolean)
            .join('\n\n'),
          d.itemImage,
        ],
      );
      inserted++;
    } catch (err: any) {
      console.error(`  Insert error for ${d.itemSeq}:`, err.message);
    }
  }

  console.log(`  Inserted: ${inserted}`);
}

// ─── Step 3: ITEM_SEQ → INGR_CODE 매핑 ───────────────

async function importItemIngredientMapping() {
  console.log('\n═══ Step 3: 품목→성분 매핑 추출 (DUR 품목 병용금기) ═══');
  const baseUrl = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03?serviceKey=${API_KEY}`;

  // 81만건 전부 가져오면 너무 오래걸림 — 대신 성분코드별로 조회
  // contraindications에 있는 성분코드 목록을 먼저 가져옴
  const ingrResult = await pool.query(`
    SELECT DISTINCT code FROM (
      SELECT ingredient_code_a AS code FROM yakcheck.contraindications
      UNION
      SELECT ingredient_code_b AS code FROM yakcheck.contraindications
    ) t
  `);
  const ingrCodes = ingrResult.rows.map((r) => r.code);
  console.log(`  Unique ingredient codes in contraindications: ${ingrCodes.length}`);

  // 각 성분코드로 DUR 품목정보를 조회하여 ITEM_SEQ ↔ INGR_CODE 매핑 수집
  const mapping = new Map<string, Set<string>>(); // itemSeq → Set<ingrCode>
  let apiCalls = 0;

  for (const ingrCode of ingrCodes) {
    await sleep(DELAY_MS);
    apiCalls++;
    if (apiCalls % 50 === 0) {
      console.log(`  Processing ingredient ${apiCalls}/${ingrCodes.length}...`);
    }

    try {
      const url = `${baseUrl}&ingrCode=${ingrCode}&pageNo=1&numOfRows=100&type=json`;
      const data = await fetchApi(url);
      const items = data.body.items;
      if (!items || data.body.totalCount === 0) continue;

      const itemArr = Array.isArray(items) ? items : [items];
      for (const d of itemArr) {
        const itemSeq = d.ITEM_SEQ;
        const mixItemSeq = d.MIXTURE_ITEM_SEQ;
        if (itemSeq) {
          if (!mapping.has(itemSeq)) mapping.set(itemSeq, new Set());
          mapping.get(itemSeq)!.add(ingrCode);
        }
        if (mixItemSeq && d.MIXTURE_INGR_CODE) {
          if (!mapping.has(mixItemSeq)) mapping.set(mixItemSeq, new Set());
          mapping.get(mixItemSeq)!.add(d.MIXTURE_INGR_CODE);
        }
      }
    } catch (err: any) {
      console.error(`  Error fetching ingrCode=${ingrCode}:`, err.message);
    }
  }

  console.log(`  API calls made: ${apiCalls}`);
  console.log(`  Unique items with ingredient mapping: ${mapping.size}`);

  // Update drugs table with ingredient codes
  let updated = 0;
  for (const [itemSeq, codes] of mapping) {
    const codesArr = Array.from(codes);
    // Also get ingredient names from contraindications
    const namesResult = await pool.query(`
      SELECT DISTINCT name FROM (
        SELECT ingredient_name_a AS name FROM yakcheck.contraindications WHERE ingredient_code_a = ANY($1)
        UNION
        SELECT ingredient_name_b AS name FROM yakcheck.contraindications WHERE ingredient_code_b = ANY($1)
      ) t WHERE name IS NOT NULL
    `, [codesArr]);
    const namesArr = namesResult.rows.map((r) => r.name);

    const result = await pool.query(
      `UPDATE yakcheck.drugs
       SET ingredient_codes = $2, ingredient_names = $3, updated_at = NOW()
       WHERE item_seq = $1`,
      [itemSeq, codesArr, namesArr],
    );
    if (result.rowCount && result.rowCount > 0) updated++;
  }

  console.log(`  Updated drugs with ingredient codes: ${updated}`);
}

// ─── Main ─────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  yakcheck 벌크 데이터 적재 시작      ║');
  console.log('╚══════════════════════════════════════╝');

  const startTime = Date.now();

  try {
    // Log start
    await pool.query(
      `INSERT INTO yakcheck.sync_logs (sync_type, status, started_at)
       VALUES ('bulk_import', 'running', NOW()) RETURNING id`,
    );

    await importDurIngredientContraindications();
    await importDrugInfo();
    await importItemIngredientMapping();

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n✅ 완료! (${elapsed}분 소요)`);

    // Log success
    await pool.query(
      `UPDATE yakcheck.sync_logs
       SET status = 'success', finished_at = NOW()
       WHERE sync_type = 'bulk_import' AND status = 'running'`,
    );

    // Summary
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM yakcheck.contraindications) AS contra_count,
        (SELECT COUNT(*) FROM yakcheck.drugs) AS drug_count,
        (SELECT COUNT(*) FROM yakcheck.drugs WHERE ingredient_codes IS NOT NULL AND array_length(ingredient_codes, 1) > 0) AS mapped_drugs
    `);
    const s = stats.rows[0];
    console.log(`\n📊 적재 결과:`);
    console.log(`  병용금기: ${s.contra_count}건`);
    console.log(`  약품 정보: ${s.drug_count}건`);
    console.log(`  성분코드 매핑 완료: ${s.mapped_drugs}건`);

  } catch (err) {
    console.error('\n❌ 에러 발생:', err);
    await pool.query(
      `UPDATE yakcheck.sync_logs
       SET status = 'failed', error_message = $1, finished_at = NOW()
       WHERE sync_type = 'bulk_import' AND status = 'running'`,
      [String(err)],
    );
  } finally {
    await pool.end();
  }
}

main();
