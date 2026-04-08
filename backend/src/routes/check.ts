import { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

interface CheckBody {
  drugIds: string[];
}

interface DrugInfo {
  itemSeq: string;
  itemName: string;
  ingredientCodes: string[];
}

export async function checkRoutes(app: FastifyInstance) {
  app.post<{ Body: CheckBody }>('/check', async (req, reply) => {
    const { drugIds } = req.body;

    if (!drugIds || !Array.isArray(drugIds) || drugIds.length < 2) {
      return reply.status(400).send({ error: '최소 2개의 약을 선택해야 합니다.' });
    }
    if (drugIds.length > 10) {
      return reply.status(400).send({ error: '최대 10개까지 선택 가능합니다.' });
    }

    // 1. 각 약의 성분 코드 조회
    const drugsResult = await pool.query(
      `SELECT item_seq, item_name, ingredient_codes
       FROM yakcheck.drugs
       WHERE item_seq = ANY($1)`,
      [drugIds],
    );

    const drugs: DrugInfo[] = drugsResult.rows.map((r) => ({
      itemSeq: r.item_seq,
      itemName: r.item_name,
      ingredientCodes: r.ingredient_codes || [],
    }));

    if (drugs.length < 2) {
      return reply.status(400).send({ error: '유효한 약이 2개 미만입니다.' });
    }

    // 2. 약 쌍별 성분 조합 생성
    const ingredientPairs: Array<{ drugA: DrugInfo; drugB: DrugInfo; codeA: string; codeB: string }> = [];

    for (let i = 0; i < drugs.length; i++) {
      for (let j = i + 1; j < drugs.length; j++) {
        for (const codeA of drugs[i].ingredientCodes) {
          for (const codeB of drugs[j].ingredientCodes) {
            ingredientPairs.push({
              drugA: drugs[i],
              drugB: drugs[j],
              codeA,
              codeB,
            });
          }
        }
      }
    }

    // 미매핑 약 목록
    const unmappedDrugs = drugs
      .filter((d) => d.ingredientCodes.length === 0)
      .map((d) => ({ itemSeq: d.itemSeq, itemName: d.itemName }));

    if (ingredientPairs.length === 0) {
      const totalPairs = (drugs.length * (drugs.length - 1)) / 2;
      return { pairs: [], summary: { contraindicated: 0, safe: totalPairs }, unmappedDrugs };
    }

    // 3. contraindications 테이블에서 매칭
    const values = ingredientPairs
      .flatMap((p) => [p.codeA, p.codeB])
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const contraResult = await pool.query(
      `SELECT ingredient_code_a, ingredient_code_b, reason
       FROM yakcheck.contraindications
       WHERE ingredient_code_a = ANY($1) OR ingredient_code_b = ANY($1)`,
      [values],
    );

    // Build a lookup set for fast matching
    const contraMap = new Map<string, string>();
    for (const row of contraResult.rows) {
      const keyFwd = `${row.ingredient_code_a}|${row.ingredient_code_b}`;
      const keyRev = `${row.ingredient_code_b}|${row.ingredient_code_a}`;
      contraMap.set(keyFwd, row.reason);
      contraMap.set(keyRev, row.reason);
    }

    // 4. 결과를 약 쌍 단위로 그룹핑 (약 쌍당 하나만)
    const pairResults = new Map<string, {
      drugA: { itemSeq: string; itemName: string };
      drugB: { itemSeq: string; itemName: string };
      reason: string;
    }>();

    for (const pair of ingredientPairs) {
      const key = `${pair.codeA}|${pair.codeB}`;
      const reason = contraMap.get(key);
      if (reason) {
        const pairKey = `${pair.drugA.itemSeq}|${pair.drugB.itemSeq}`;
        if (!pairResults.has(pairKey)) {
          pairResults.set(pairKey, {
            drugA: { itemSeq: pair.drugA.itemSeq, itemName: pair.drugA.itemName },
            drugB: { itemSeq: pair.drugB.itemSeq, itemName: pair.drugB.itemName },
            reason,
          });
        }
      }
    }

    const pairs = Array.from(pairResults.values());
    const totalPairs = (drugs.length * (drugs.length - 1)) / 2;

    return {
      pairs,
      summary: { contraindicated: pairs.length, safe: totalPairs - pairs.length },
      unmappedDrugs,
    };
  });
}
