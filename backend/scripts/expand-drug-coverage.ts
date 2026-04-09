/**
 * DUR 추가 오퍼레이션에서 약품+성분코드를 수집하여 drugs 커버리지 확대.
 * 병용금기(814K)는 이미 import-dur-products.ts에서 처리됨.
 * 여기서는 나머지 6개 오퍼레이션(35K건)에서 ITEM_SEQ→INGR_CODE 매핑을 추가 수집.
 *
 * 모든 데이터는 동일 DUR 시스템(식약처)에서 발급한 D-code를 사용 → 강한 연결.
 *
 * 추가로 DUR 성분정보 API에서 contraindications를 최신화.
 *
 * 실행: npx tsx scripts/expand-drug-coverage.ts
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const API_KEY = process.env.DATA_GO_KR_API_KEY!;

const PAGE_SIZE = 500;
const DELAY_MS = 200;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : '';
}

// ─── Part 1: DUR 추가 오퍼레이션에서 약품 수집 ───────────────

const EXTRA_OPERATIONS = [
  { op: 'getPwnmTabooInfoList03', name: '임부금기' },
  { op: 'getEfcyDplctInfoList03', name: '효능군중복' },
  { op: 'getCpctyAtentInfoList03', name: '용량주의' },
  { op: 'getOdsnAtentInfoList03', name: '노인주의' },
  { op: 'getSpcifyAgrdeTabooInfoList03', name: '특정연령대금기' },
  { op: 'getMdctnPdAtentInfoList03', name: '투여기간주의' },
];

interface DrugEntry {
  itemName: string;
  entpName: string;
  ingrCodes: Set<string>;
  ingrNames: Set<string>;
}

async function collectDrugsFromOperation(
  op: string, name: string, drugMap: Map<string, DrugEntry>,
): Promise<{ records: number; errors: number }> {
  // 총 건수 확인
  const countUrl = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/${op}?serviceKey=${API_KEY}&numOfRows=1&pageNo=1`;
  const countRes = await fetch(countUrl);
  const countXml = await countRes.text();
  const totalCount = parseInt(xmlVal(countXml, 'totalCount') || '0');
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`  ${name}: ${totalCount}건, ${totalPages}페이지`);

  let records = 0;
  let errors = 0;

  for (let page = 1; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    try {
      const url = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/${op}?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${page}`;
      const res = await fetch(url);
      const xml = await res.text();

      if (xmlVal(xml, 'resultCode') !== '00') {
        errors++;
        continue;
      }

      const items = xml.split('<item>').slice(1);
      for (const item of items) {
        const itemSeq = xmlVal(item, 'ITEM_SEQ');
        const ingrCode = xmlVal(item, 'INGR_CODE');
        if (!itemSeq || !ingrCode) continue;

        records++;
        const existing = drugMap.get(itemSeq);
        if (existing) {
          existing.ingrCodes.add(ingrCode);
          const ingrName = xmlVal(item, 'INGR_KOR_NAME');
          if (ingrName) existing.ingrNames.add(ingrName);
        } else {
          const ingrName = xmlVal(item, 'INGR_KOR_NAME');
          drugMap.set(itemSeq, {
            itemName: xmlVal(item, 'ITEM_NAME'),
            entpName: xmlVal(item, 'ENTP_NAME'),
            ingrCodes: new Set([ingrCode]),
            ingrNames: new Set(ingrName ? [ingrName] : []),
          });
        }

        // MIXTURE_ 측도 있으면 수집 (효능군중복 등 일부에 있을 수 있음)
        const mixSeq = xmlVal(item, 'MIXTURE_ITEM_SEQ');
        const mixIngrCode = xmlVal(item, 'MIXTURE_INGR_CODE');
        if (mixSeq && mixIngrCode) {
          const mixExisting = drugMap.get(mixSeq);
          if (mixExisting) {
            mixExisting.ingrCodes.add(mixIngrCode);
            const mixIngrName = xmlVal(item, 'MIXTURE_INGR_KOR_NAME');
            if (mixIngrName) mixExisting.ingrNames.add(mixIngrName);
          } else {
            const mixIngrName = xmlVal(item, 'MIXTURE_INGR_KOR_NAME');
            drugMap.set(mixSeq, {
              itemName: xmlVal(item, 'MIXTURE_ITEM_NAME'),
              entpName: xmlVal(item, 'MIXTURE_ENTP_NAME'),
              ingrCodes: new Set([mixIngrCode]),
              ingrNames: new Set(mixIngrName ? [mixIngrName] : []),
            });
          }
        }
      }
    } catch (err: any) {
      errors++;
      if (errors <= 5) console.error(`    Page ${page} error: ${err.message}`);
    }
  }

  return { records, errors };
}

async function part1_expandDrugs() {
  console.log('\n══ Part 1: DUR 추가 오퍼레이션에서 약품 수집 ══');

  const drugMap = new Map<string, DrugEntry>();
  let totalRecords = 0;
  let totalErrors = 0;

  for (const { op, name } of EXTRA_OPERATIONS) {
    const { records, errors } = await collectDrugsFromOperation(op, name, drugMap);
    totalRecords += records;
    totalErrors += errors;
  }

  console.log(`\n  수집 완료: ${drugMap.size}개 고유 약품 (레코드 ${totalRecords}건, 에러 ${totalErrors}건)`);

  // DB upsert
  console.log('  DB upsert 시작...');
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const [itemSeq, drug] of drugMap) {
    const codesArr = Array.from(drug.ingrCodes);
    const namesArr = Array.from(drug.ingrNames);

    try {
      const result = await pool.query(`
        INSERT INTO yakcheck.drugs (item_seq, item_name, entp_name, ingredient_codes, ingredient_names, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (item_seq) DO UPDATE SET
          ingredient_codes = CASE
            WHEN yakcheck.drugs.ingredient_codes IS NULL OR array_length(yakcheck.drugs.ingredient_codes, 1) IS NULL
              THEN $4
            ELSE (
              SELECT ARRAY(SELECT DISTINCT unnest(yakcheck.drugs.ingredient_codes || $4))
            )
          END,
          ingredient_names = CASE
            WHEN yakcheck.drugs.ingredient_names IS NULL OR array_length(yakcheck.drugs.ingredient_names, 1) IS NULL
              THEN $5
            ELSE (
              SELECT ARRAY(SELECT DISTINCT unnest(yakcheck.drugs.ingredient_names || $5))
            )
          END,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `, [itemSeq, drug.itemName, drug.entpName, codesArr, namesArr]);

      if (result.rows[0]?.is_insert) inserted++;
      else updated++;
    } catch (err: any) {
      skipped++;
      if (skipped <= 5) console.error(`    Upsert error ${itemSeq}: ${err.message}`);
    }
  }

  console.log(`  결과: 신규 ${inserted}건, 업데이트 ${updated}건, 스킵 ${skipped}건`);
}

// ─── Part 2: contraindications 최신화 ─────────────────────

async function part2_updateContraindications() {
  console.log('\n══ Part 2: DUR 성분정보에서 contraindications 최신화 ══');

  const countUrl = `https://apis.data.go.kr/1471000/DURIrdntInfoService03/getUsjntTabooInfoList02?serviceKey=${API_KEY}&numOfRows=1&pageNo=1&type=json`;
  const countRes = await fetch(countUrl);
  const countData = await countRes.json();
  const totalCount = countData.body.totalCount;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`  총 ${totalCount}건, ${totalPages}페이지`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let page = 1; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    try {
      const url = `https://apis.data.go.kr/1471000/DURIrdntInfoService03/getUsjntTabooInfoList02?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${page}&type=json`;
      const res = await fetch(url);
      const data = await res.json();

      let items = data.body?.items;
      if (!items) continue;
      if (!Array.isArray(items)) {
        items = items.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
      }

      for (const d of items) {
        const rec = d.item || d;
        if (rec.DEL_YN && rec.DEL_YN !== '정상') { skipped++; continue; }
        if (!rec.INGR_CODE || !rec.MIXTURE_INGR_CODE) { skipped++; continue; }

        try {
          const result = await pool.query(`
            INSERT INTO yakcheck.contraindications
            (ingredient_code_a, ingredient_name_a, ingredient_code_b, ingredient_name_b,
             contraindication_type, severity, reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (ingredient_code_a, ingredient_code_b) DO UPDATE SET
              reason = EXCLUDED.reason,
              ingredient_name_a = EXCLUDED.ingredient_name_a,
              ingredient_name_b = EXCLUDED.ingredient_name_b,
              contraindication_type = EXCLUDED.contraindication_type
            RETURNING (xmax = 0) AS is_insert
          `, [
            rec.INGR_CODE,
            rec.INGR_KOR_NAME,
            rec.MIXTURE_INGR_CODE,
            rec.MIXTURE_INGR_KOR_NAME,
            rec.TYPE_NAME || '병용금기',
            'critical',
            rec.PROHBT_CONTENT,
          ]);
          if (result.rows[0]?.is_insert) inserted++;
          else updated++;
        } catch (err: any) {
          skipped++;
        }
      }
    } catch (err: any) {
      errors++;
      if (errors <= 5) console.error(`    Page ${page} error: ${err.message}`);
    }

    if (page % 5 === 0) console.log(`    ${page}/${totalPages} pages`);
  }

  console.log(`  결과: 신규 ${inserted}건, 업데이트 ${updated}건, 스킵 ${skipped}건, 에러 ${errors}건`);
}

// ─── Part 3: 커버리지 검증 ─────────────────────────────────

async function part3_verifyCoverage() {
  console.log('\n══ Part 3: 커버리지 검증 ══');

  const result = await pool.query(`
    WITH drug_codes AS (
      SELECT DISTINCT unnest(ingredient_codes) AS code
      FROM yakcheck.drugs
      WHERE ingredient_codes IS NOT NULL
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
  console.log(`  drugs 테이블: ${r.total_drugs}건 (매핑됨: ${r.mapped_drugs})`);
  console.log(`  contraindications: ${r.total_contra}건`);
  console.log(`  drugs D-code: ${r.drug_dcodes}개`);
  console.log(`  contra D-code: ${r.contra_dcodes}개`);
  console.log(`  교차 매칭 가능: ${r.overlapping}개`);
  console.log(`  contra에만 존재 (미커버): ${r.contra_only}개`);
  const coverageRate = (parseInt(r.overlapping) / parseInt(r.contra_dcodes) * 100).toFixed(1);
  console.log(`  D-code 커버리지: ${coverageRate}%`);

  // 완전 매칭 가능한 규칙 비율
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
        c.ingredient_code_a,
        c.ingredient_code_b,
        EXISTS(SELECT 1 FROM drug_codes d WHERE d.code = c.ingredient_code_a) AS a_ok,
        EXISTS(SELECT 1 FROM drug_codes d WHERE d.code = c.ingredient_code_b) AS b_ok
      FROM yakcheck.contraindications c
    ) sub
  `);

  const m = matchable.rows[0];
  const fullMatchRate = (parseInt(m.both_matched) / parseInt(m.total) * 100).toFixed(1);
  console.log(`\n  금기 규칙 매칭 가능 비율:`);
  console.log(`    양쪽 모두 매칭: ${m.both_matched}/${m.total} (${fullMatchRate}%)`);
  console.log(`    한쪽만 매칭: ${parseInt(m.a_only) + parseInt(m.b_only)}건`);
  console.log(`    양쪽 미매칭: ${m.neither}건`);
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  yakcheck D-code 커버리지 확대               ║');
  console.log('╚══════════════════════════════════════════════╝');

  try {
    await part1_expandDrugs();
    await part2_updateContraindications();
    await part3_verifyCoverage();
  } catch (err) {
    console.error('\n에러:', err);
  } finally {
    await pool.end();
  }
}

main();
