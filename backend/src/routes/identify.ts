import { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

export async function identifyRoutes(app: FastifyInstance) {

  // 낱알 식별 검색 (로컬 DB)
  app.get('/identify', async (req, reply) => {
    const { shape, color, print_front, print_back, item_name } = req.query as Record<string, string>;

    if (!shape && !color && !print_front && !print_back && !item_name) {
      return reply.status(400).send({ error: '검색 조건을 하나 이상 입력해주세요.' });
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (shape) {
      conditions.push(`p.drug_shape = $${idx++}`);
      params.push(shape);
    }
    if (color) {
      conditions.push(`p.color_class1 LIKE $${idx++}`);
      params.push(`%${color}%`);
    }
    if (print_front) {
      conditions.push(`p.print_front ILIKE $${idx++}`);
      params.push(`%${print_front}%`);
    }
    if (print_back) {
      conditions.push(`p.print_back ILIKE $${idx++}`);
      params.push(`%${print_back}%`);
    }
    if (item_name) {
      conditions.push(`p.item_name ILIKE $${idx++}`);
      params.push(`%${item_name}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM yakcheck.pill_identifications p ${where}`,
      params,
    );
    const totalCount = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT p.*, d.ingredient_codes, d.ingredient_names
       FROM yakcheck.pill_identifications p
       LEFT JOIN yakcheck.drugs d ON d.item_seq = p.item_seq
       ${where}
       ORDER BY p.item_name
       LIMIT 30`,
      params,
    );

    const items = result.rows.map((r) => ({
      itemSeq: r.item_seq,
      itemName: r.item_name,
      entpName: r.entp_name,
      imageUrl: r.image_url,
      shape: r.drug_shape,
      colorFront: r.color_class1,
      colorBack: r.color_class2,
      printFront: r.print_front,
      printBack: r.print_back,
      className: r.class_name,
      etcOtcName: r.etc_otc_name,
      inDb: !!r.ingredient_codes,
      hasDurData: r.ingredient_codes?.length > 0,
      ingredientNames: r.ingredient_names || [],
    }));

    return { items, totalCount };
  });

  // 필터 옵션 (실제 DB에 있는 distinct 값)
  app.get('/identify/options', async () => {
    const [shapes, colors] = await Promise.all([
      pool.query(
        `SELECT drug_shape AS value, COUNT(*)::int AS count
         FROM yakcheck.pill_identifications
         GROUP BY drug_shape ORDER BY count DESC`,
      ),
      pool.query(
        `SELECT color_class1 AS value, COUNT(*)::int AS count
         FROM yakcheck.pill_identifications
         GROUP BY color_class1 ORDER BY count DESC`,
      ),
    ]);

    return {
      shapes: shapes.rows,
      colors: colors.rows,
    };
  });
}
