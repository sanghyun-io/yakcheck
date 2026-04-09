/**
 * 일일 DUR/약품 데이터 동기화 배치
 * 매일 새벽 3시(KST) 실행
 */

import cron from 'node-cron';
import { pool } from '../db.js';

const API_KEY = process.env.DATA_GO_KR_API_KEY!;
const DELAY_MS = 300;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchApi(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function syncDurContraindications() {
  console.log('[sync] DUR 성분 병용금기 동기화 시작');
  const baseUrl = `https://apis.data.go.kr/1471000/DURIrdntInfoService03/getUsjntTabooInfoList02?serviceKey=${API_KEY}`;

  let pageNo = 1;
  let totalPages = 1;
  let upserted = 0;

  do {
    const url = `${baseUrl}&pageNo=${pageNo}&numOfRows=100&type=json`;
    const data = await fetchApi(url);
    const total = data.body.totalCount;
    totalPages = Math.ceil(total / 100);

    const items = data.body.items;
    const itemArr = Array.isArray(items)
      ? items
      : items?.item
        ? Array.isArray(items.item) ? items.item : [items.item]
        : [];

    for (const raw of itemArr) {
      const d = raw.item || raw;
      if (d.DEL_YN !== '정상') continue;

      await pool.query(
        `INSERT INTO yakcheck.contraindications
         (ingredient_code_a, ingredient_name_a, ingredient_code_b, ingredient_name_b,
          contraindication_type, severity, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (ingredient_code_a, ingredient_code_b) DO UPDATE SET
           reason = EXCLUDED.reason,
           contraindication_type = EXCLUDED.contraindication_type`,
        [d.INGR_CODE, d.INGR_KOR_NAME, d.MIXTURE_INGR_CODE, d.MIXTURE_INGR_KOR_NAME,
         d.TYPE_NAME || '병용금기', 'critical', d.PROHBT_CONTENT],
      );
      upserted++;
    }

    pageNo++;
    await sleep(DELAY_MS);
  } while (pageNo <= totalPages);

  console.log(`[sync] DUR 병용금기: ${upserted}건 upsert`);
  return upserted;
}

async function syncDrugInfo() {
  console.log('[sync] e약은요 약품 정보 동기화 시작');
  const baseUrl = `https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList?serviceKey=${API_KEY}`;

  let pageNo = 1;
  let totalPages = 1;
  let upserted = 0;

  do {
    const url = `${baseUrl}&pageNo=${pageNo}&numOfRows=100&type=json`;
    const data = await fetchApi(url);
    const total = data.body.totalCount;
    totalPages = Math.ceil(total / 100);

    const items = Array.isArray(data.body.items) ? data.body.items : [];

    for (const d of items) {
      await pool.query(
        `INSERT INTO yakcheck.drugs
         (item_seq, item_name, entp_name, efficacy, usage_info, caution, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (item_seq) DO UPDATE SET
           item_name = EXCLUDED.item_name,
           efficacy = EXCLUDED.efficacy,
           caution = EXCLUDED.caution,
           image_url = EXCLUDED.image_url,
           updated_at = NOW()`,
        [d.itemSeq, d.itemName, d.entpName, d.efcyQesitm, d.useMethodQesitm,
         [d.atpnWarnQesitm, d.atpnQesitm, d.intrcQesitm, d.seQesitm].filter(Boolean).join('\n\n'),
         d.itemImage],
      );
      upserted++;
    }

    pageNo++;
    await sleep(DELAY_MS);
  } while (pageNo <= totalPages);

  console.log(`[sync] 약품 정보: ${upserted}건 upsert`);
  return upserted;
}

const DUR_EXTRA_OPERATIONS = [
  'getPwnmTabooInfoList03',
  'getEfcyDplctInfoList03',
  'getCpctyAtentInfoList03',
  'getOdsnAtentInfoList03',
  'getSpcifyAgrdeTabooInfoList03',
  'getMdctnPdAtentInfoList03',
];

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : '';
}

async function syncDurExtraOperations() {
  console.log('[sync] DUR 추가 오퍼레이션 약품 동기화 시작');
  let totalUpserted = 0;

  for (const op of DUR_EXTRA_OPERATIONS) {
    try {
      const countUrl = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/${op}?serviceKey=${API_KEY}&numOfRows=1&pageNo=1`;
      const countRes = await fetch(countUrl);
      const countXml = await countRes.text();
      const totalCount = parseInt(xmlVal(countXml, 'totalCount') || '0');
      const totalPages = Math.ceil(totalCount / 500);

      for (let page = 1; page <= totalPages; page++) {
        await sleep(DELAY_MS);
        const url = `https://apis.data.go.kr/1471000/DURPrdlstInfoService03/${op}?serviceKey=${API_KEY}&numOfRows=500&pageNo=${page}`;
        const res = await fetch(url);
        const xml = await res.text();
        if (xmlVal(xml, 'resultCode') !== '00') continue;

        const items = xml.split('<item>').slice(1);
        for (const item of items) {
          const itemSeq = xmlVal(item, 'ITEM_SEQ');
          const ingrCode = xmlVal(item, 'INGR_CODE');
          if (!itemSeq || !ingrCode) continue;

          await pool.query(`
            INSERT INTO yakcheck.drugs (item_seq, item_name, entp_name, ingredient_codes, ingredient_names, updated_at)
            VALUES ($1, $2, $3, ARRAY[$4], ARRAY[$5], NOW())
            ON CONFLICT (item_seq) DO UPDATE SET
              ingredient_codes = (SELECT ARRAY(SELECT DISTINCT unnest(yakcheck.drugs.ingredient_codes || ARRAY[$4]))),
              ingredient_names = CASE
                WHEN $5 = '' THEN yakcheck.drugs.ingredient_names
                ELSE (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(yakcheck.drugs.ingredient_names, ARRAY[]::text[]) || ARRAY[$5])))
              END,
              updated_at = NOW()
          `, [itemSeq, xmlVal(item, 'ITEM_NAME'), xmlVal(item, 'ENTP_NAME'), ingrCode, xmlVal(item, 'INGR_KOR_NAME')]);
          totalUpserted++;
        }
      }
    } catch (err: any) {
      console.error(`[sync] ${op} 에러:`, err.message);
    }
  }

  console.log(`[sync] DUR 추가 오퍼레이션: ${totalUpserted}건 upsert`);
  return totalUpserted;
}

export async function runSync() {
  const startedAt = new Date();
  try {
    const durCount = await syncDurContraindications();
    const drugCount = await syncDrugInfo();
    const extraCount = await syncDurExtraOperations();

    await pool.query(
      `INSERT INTO yakcheck.sync_logs (sync_type, status, records_affected, started_at, finished_at)
       VALUES ('daily_sync', 'success', $1, $2, NOW())`,
      [durCount + drugCount + extraCount, startedAt],
    );
    console.log('[sync] 동기화 완료');
  } catch (err: any) {
    console.error('[sync] 동기화 실패:', err);
    await pool.query(
      `INSERT INTO yakcheck.sync_logs (sync_type, status, error_message, started_at, finished_at)
       VALUES ('daily_sync', 'failed', $1, $2, NOW())`,
      [err.message, startedAt],
    );
  }
}

// 매일 새벽 3시 KST (UTC 18시)
export function scheduleSyncJob() {
  cron.schedule('0 18 * * *', () => {
    console.log('[sync] 일일 동기화 시작');
    runSync();
  });
  console.log('[sync] 일일 동기화 스케줄 등록: 매일 03:00 KST');
}
