/**
 * 낱알식별 데이터 전체 동기화 스크립트
 * API: MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03
 * 500건/페이지, 전체 ~25,000건 → ~51페이지
 */

import 'dotenv/config';
import pg from 'pg';

const API_KEY = process.env.DATA_GO_KR_API_KEY!;
const BASE_URL = 'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03';
const DELAY_MS = 300;
const PAGE_SIZE = 500;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : '';
}

async function run() {
  console.log('[pill-sync] 낱알식별 데이터 동기화 시작');

  // 1) 전체 건수 확인
  const countUrl = `${BASE_URL}?serviceKey=${API_KEY}&numOfRows=1&pageNo=1`;
  const countRes = await fetch(countUrl);
  const countXml = await countRes.text();
  const totalCount = parseInt(xmlVal(countXml, 'totalCount') || '0');
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`[pill-sync] 전체: ${totalCount}건, ${totalPages}페이지`);

  let upserted = 0;
  let errors = 0;

  for (let page = 1; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    const url = `${BASE_URL}?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${page}`;
    const res = await fetch(url);
    const xml = await res.text();

    if (xmlVal(xml, 'resultCode') !== '00') {
      console.error(`[pill-sync] 페이지 ${page} 에러: ${xmlVal(xml, 'resultMsg')}`);
      errors++;
      continue;
    }

    const items = xml.split('<item>').slice(1);
    for (const item of items) {
      const itemSeq = xmlVal(item, 'ITEM_SEQ');
      if (!itemSeq) continue;

      try {
        await pool.query(`
          INSERT INTO yakcheck.pill_identifications
            (item_seq, item_name, entp_name, drug_shape, color_class1, color_class2,
             print_front, print_back, line_front, line_back, class_name, etc_otc_name,
             form_code_name, image_url, leng_long, leng_short, thick, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
          ON CONFLICT (item_seq) DO UPDATE SET
            item_name = EXCLUDED.item_name,
            drug_shape = EXCLUDED.drug_shape,
            color_class1 = EXCLUDED.color_class1,
            color_class2 = EXCLUDED.color_class2,
            print_front = EXCLUDED.print_front,
            print_back = EXCLUDED.print_back,
            line_front = EXCLUDED.line_front,
            line_back = EXCLUDED.line_back,
            class_name = EXCLUDED.class_name,
            image_url = EXCLUDED.image_url,
            form_code_name = EXCLUDED.form_code_name,
            updated_at = NOW()
        `, [
          itemSeq,
          xmlVal(item, 'ITEM_NAME'),
          xmlVal(item, 'ENTP_NAME'),
          xmlVal(item, 'DRUG_SHAPE'),
          xmlVal(item, 'COLOR_CLASS1'),
          xmlVal(item, 'COLOR_CLASS2') || null,
          xmlVal(item, 'PRINT_FRONT') || null,
          xmlVal(item, 'PRINT_BACK') || null,
          xmlVal(item, 'LINE_FRONT') || null,
          xmlVal(item, 'LINE_BACK') || null,
          xmlVal(item, 'CLASS_NAME') || null,
          xmlVal(item, 'ETC_OTC_NAME') || null,
          xmlVal(item, 'FORM_CODE_NAME') || null,
          xmlVal(item, 'ITEM_IMAGE') || null,
          xmlVal(item, 'LENG_LONG') || null,
          xmlVal(item, 'LENG_SHORT') || null,
          xmlVal(item, 'THICK') || null,
        ]);
        upserted++;
      } catch (err: any) {
        console.error(`[pill-sync] item_seq=${itemSeq} 에러:`, err.message);
        errors++;
      }
    }

    console.log(`[pill-sync] 페이지 ${page}/${totalPages} 완료 (누적: ${upserted}건)`);
  }

  // distinct 값 확인
  const shapes = await pool.query('SELECT drug_shape, COUNT(*) as cnt FROM yakcheck.pill_identifications GROUP BY drug_shape ORDER BY cnt DESC');
  const colors = await pool.query('SELECT color_class1, COUNT(*) as cnt FROM yakcheck.pill_identifications GROUP BY color_class1 ORDER BY cnt DESC');

  console.log('\n[pill-sync] === 모양 분포 ===');
  for (const r of shapes.rows) console.log(`  ${r.drug_shape}: ${r.cnt}건`);

  console.log('\n[pill-sync] === 색상(앞) 분포 ===');
  for (const r of colors.rows) console.log(`  ${r.color_class1}: ${r.cnt}건`);

  console.log(`\n[pill-sync] 완료: ${upserted}건 upsert, ${errors}건 에러`);
  await pool.end();
}

run().catch((err) => {
  console.error('[pill-sync] 치명적 에러:', err);
  process.exit(1);
});
