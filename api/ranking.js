import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const scores = await sql`
      SELECT name, score, created_at
      FROM scores
      ORDER BY score DESC, created_at ASC
      LIMIT 10
    `;

    return res.status(200).json(scores);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
}
