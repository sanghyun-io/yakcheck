/**
 * DUR 병용금기 품목 데이터(814K건)에서 고유 약품을 추출하여 DB에 upsert.
 * 전문의약품 포함 — e약은요 미수록 약도 DUR에 등록되어 있으면 추가됨.
 *
 * 실행: npx tsx scripts/import-dur-products.ts
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const API_KEY = process.env.DATA_GO_KR_API_KEY!;

const PAGE_SIZE = 500;    // API max
const DELAY_MS = 150;     // rate limit 대응
const PROGRESS_INTERVAL = 10; // 10페이지마다 진행상황 출력

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface DrugRecord {
  itemSeq: string;
  itemName: string;
  entpName: string;
  ingrCode: string;
  ingrName: string;
  mainIngr: string;
  etcOtcName: string;
  className: string;
}

/** XML 태그에서 텍스트 추출 */
function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : '';
}

/** 한 페이지의 XML에서 약품 레코드 추출 (양쪽 모두) */
function extractDrugsFromXml(xml: string): DrugRecord[] {
  const drugs: DrugRecord[] = [];
  const items = xml.split('<item>').slice(1); // 첫 번째는 빈 문자열

  for (const item of items) {
    // Side A
    const seqA = xmlVal(item, 'ITEM_SEQ');
    if (seqA) {
      drugs.push({
        itemSeq: seqA,
        itemName: xmlVal(item, 'ITEM_NAME'),
        entpName: xmlVal(item, 'ENTP_NAME'),
        ingrCode: xmlVal(item, 'INGR_CODE'),
        ingrName: xmlVal(item, 'INGR_KOR_NAME'),
        mainIngr: xmlVal(item, 'MAIN_INGR'),
        etcOtcName: xmlVal(item, 'ETC_OTC_NAME'),
        className: xmlVal(item, 'CLASS_NAME'),
      });
    }

    // Side B (MIXTURE_*)
    const seqB = xmlVal(item, 'MIXTURE_ITEM_SEQ');
    if (seqB) {
      drugs.push({
        itemSeq: seqB,
        itemName: xmlVal(item, 'MIXTURE_ITEM_NAME'),
        entpName: xmlVal(item, 'MIXTURE_ENTP_NAME'),
        ingrCode: xmlVal(item, 'MIXTURE_INGR_CODE'),
        ingrName: xmlVal(item, 'MIXTURE_INGR_KOR_NAME'),
        mainIngr: xmlVal(item, 'MIXTURE_MAIN_INGR'),
        etcOtcName: xmlVal(item, 'MIXTURE_ETC_OTC_NAME'),
        className: xmlVal(item, 'MIXTURE_CLASS_NAME'),
      });
    }
  }
  return drugs;
}

async function main() {
  console.log('=== DUR 병용금기 품목 데이터에서 약품 추출 ===');

  // 1. 총 건수 확인
  const countUrl = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03?serviceKey=${API_KEY}&numOfRows=1&pageNo=1`;
  const countRes = await fetch(countUrl);
  const countXml = await countRes.text();
  const totalCount = parseInt(xmlVal(countXml, 'totalCount') || '0');
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`총 건수: ${totalCount}, 페이지: ${totalPages} (${PAGE_SIZE}건/페이지)`);

  // 2. 약품 수집 (Map: itemSeq → DrugRecord + ingredientCodes set)
  const drugMap = new Map<string, {
    itemName: string;
    entpName: string;
    ingrCodes: Set<string>;
    ingrNames: Set<string>;
    etcOtcName: string;
    className: string;
  }>();

  let apiCalls = 0;
  let errors = 0;

  for (let page = 1; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    apiCalls++;

    try {
      const url = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${page}`;
      const res = await fetch(url);
      const xml = await res.text();

      // Check for errors
      const resultCode = xmlVal(xml, 'resultCode');
      if (resultCode !== '00') {
        errors++;
        if (errors <= 5) console.error(`  Page ${page}: API error ${resultCode} - ${xmlVal(xml, 'resultMsg')}`);
        continue;
      }

      const records = extractDrugsFromXml(xml);

      for (const rec of records) {
        if (!rec.itemSeq || !rec.ingrCode) continue;

        const existing = drugMap.get(rec.itemSeq);
        if (existing) {
          existing.ingrCodes.add(rec.ingrCode);
          if (rec.ingrName) existing.ingrNames.add(rec.ingrName);
        } else {
          drugMap.set(rec.itemSeq, {
            itemName: rec.itemName,
            entpName: rec.entpName,
            ingrCodes: new Set([rec.ingrCode]),
            ingrNames: new Set(rec.ingrName ? [rec.ingrName] : []),
            etcOtcName: rec.etcOtcName,
            className: rec.className,
          });
        }
      }

    } catch (err: any) {
      errors++;
      if (errors <= 10) console.error(`  Page ${page} fetch error: ${err.message}`);
    }

    if (page % PROGRESS_INTERVAL === 0) {
      console.log(`  ${page}/${totalPages} pages (${drugMap.size} unique drugs, ${errors} errors)`);
    }
  }

  console.log(`\n수집 완료: ${drugMap.size}개 고유 약품, API ${apiCalls}회, 에러 ${errors}회`);

  // 3. DB upsert
  console.log('\nDB upsert 시작...');
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const [itemSeq, drug] of drugMap) {
    const codesArr = Array.from(drug.ingrCodes);
    const namesArr = Array.from(drug.ingrNames);

    try {
      // UPSERT: 새 약은 INSERT, 기존 약은 ingredient_codes만 업데이트 (e약은요 데이터 보존)
      const result = await pool.query(`
        INSERT INTO yakcheck.drugs (item_seq, item_name, entp_name, ingredient_codes, ingredient_names, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (item_seq) DO UPDATE SET
          ingredient_codes = COALESCE(
            CASE WHEN yakcheck.drugs.ingredient_codes IS NULL OR array_length(yakcheck.drugs.ingredient_codes, 1) IS NULL
              THEN $4
              ELSE yakcheck.drugs.ingredient_codes
            END,
            $4
          ),
          ingredient_names = COALESCE(
            CASE WHEN yakcheck.drugs.ingredient_names IS NULL OR array_length(yakcheck.drugs.ingredient_names, 1) IS NULL
              THEN $5
              ELSE yakcheck.drugs.ingredient_names
            END,
            $5
          ),
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `, [itemSeq, drug.itemName, drug.entpName, codesArr, namesArr]);

      if (result.rows[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err: any) {
      skipped++;
      if (skipped <= 5) console.error(`  Upsert error ${itemSeq}: ${err.message}`);
    }
  }

  console.log(`\nDB 결과: 신규 ${inserted}건, 업데이트 ${updated}건, 스킵 ${skipped}건`);

  // 4. 최종 통계
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN ingredient_codes IS NOT NULL AND array_length(ingredient_codes, 1) > 0 THEN 1 END) AS mapped,
      COUNT(CASE WHEN ingredient_codes IS NULL OR array_length(ingredient_codes, 1) IS NULL THEN 1 END) AS unmapped
    FROM yakcheck.drugs
  `);
  console.log(`\n=== 최종 DB 상태 ===`);
  console.log(`  전체 약: ${stats.rows[0].total}`);
  console.log(`  매핑됨: ${stats.rows[0].mapped}`);
  console.log(`  미매핑: ${stats.rows[0].unmapped}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
