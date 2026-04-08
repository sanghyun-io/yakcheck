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

    if (ingredientPairs.length === 0) {
      return { pairs: [], summary: { danger: 0, caution: 0, safe: 0 } };
    }

    // 3. contraindications 테이블에서 매칭
    const values = ingredientPairs
      .flatMap((p) => [p.codeA, p.codeB])
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const contraResult = await pool.query(
      `SELECT ingredient_code_a, ingredient_code_b,
              contraindication_type, severity, reason
       FROM yakcheck.contraindications
       WHERE ingredient_code_a = ANY($1) OR ingredient_code_b = ANY($1)`,
      [values],
    );

    // Build a lookup set for fast matching
    const contraMap = new Map<string, { type: string; severity: string; reason: string }>();
    for (const row of contraResult.rows) {
      const keyFwd = `${row.ingredient_code_a}|${row.ingredient_code_b}`;
      const keyRev = `${row.ingredient_code_b}|${row.ingredient_code_a}`;
      const val = {
        type: row.contraindication_type,
        severity: row.severity,
        reason: row.reason,
      };
      contraMap.set(keyFwd, val);
      contraMap.set(keyRev, val);
    }

    // 4. 결과를 약 쌍 단위로 그룹핑
    const pairResults = new Map<string, {
      drugA: { itemSeq: string; itemName: string };
      drugB: { itemSeq: string; itemName: string };
      severity: string;
      type: string;
      reason: string;
    }>();

    for (const pair of ingredientPairs) {
      const key = `${pair.codeA}|${pair.codeB}`;
      const match = contraMap.get(key);
      if (match) {
        const pairKey = `${pair.drugA.itemSeq}|${pair.drugB.itemSeq}`;
        // Keep the most severe result per drug pair
        const existing = pairResults.get(pairKey);
        if (!existing || severityRank(match.severity) > severityRank(existing.severity)) {
          pairResults.set(pairKey, {
            drugA: { itemSeq: pair.drugA.itemSeq, itemName: pair.drugA.itemName },
            drugB: { itemSeq: pair.drugB.itemSeq, itemName: pair.drugB.itemName },
            severity: match.severity,
            type: match.type,
            reason: match.reason,
          });
        }
      }
    }

    const pairs = Array.from(pairResults.values()).sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity),
    );

    const totalPairs = (drugs.length * (drugs.length - 1)) / 2;
    const dangerCount = pairs.filter((p) => p.severity === 'critical').length;
    const cautionCount = pairs.filter((p) => p.severity === 'warning').length;
    const safeCount = totalPairs - dangerCount - cautionCount;

    return {
      pairs,
      summary: { danger: dangerCount, caution: cautionCount, safe: safeCount },
    };
  });
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'critical': return 2;
    case 'warning': return 1;
    default: return 0;
  }
}
