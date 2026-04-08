import { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

export async function drugRoutes(app: FastifyInstance) {
  // 약 검색 (자동완성)
  app.get<{ Querystring: { q: string } }>('/drugs', async (req, reply) => {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return reply.status(400).send({ error: '검색어는 최소 2글자 이상이어야 합니다.' });
    }

    const result = await pool.query(
      `SELECT item_seq, item_name, entp_name, ingredient_names
       FROM yakcheck.drugs
       WHERE item_name ILIKE '%' || $1 || '%'
       ORDER BY similarity(item_name, $1) DESC
       LIMIT 20`,
      [q],
    );

    return {
      items: result.rows.map((r) => ({
        itemSeq: r.item_seq,
        itemName: r.item_name,
        entpName: r.entp_name,
        ingredientNames: r.ingredient_names,
        hasDurData: r.ingredient_codes != null && r.ingredient_codes.length > 0,
      })),
    };
  });

  // 약 상세 정보
  app.get<{ Params: { itemSeq: string } }>('/drugs/:itemSeq', async (req, reply) => {
    const { itemSeq } = req.params;

    const result = await pool.query(
      `SELECT * FROM yakcheck.drugs WHERE item_seq = $1`,
      [itemSeq],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: '약품을 찾을 수 없습니다.' });
    }

    const r = result.rows[0];
    return {
      itemSeq: r.item_seq,
      itemName: r.item_name,
      entpName: r.entp_name,
      ingredientCodes: r.ingredient_codes,
      ingredientNames: r.ingredient_names,
      efficacy: r.efficacy,
      usageInfo: r.usage_info,
      caution: r.caution,
      imageUrl: r.image_url,
    };
  });
}
