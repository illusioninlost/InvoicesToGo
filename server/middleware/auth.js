const db = require('../db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  const result = await db.query('SELECT * FROM sessions WHERE token = $1', [token]);
  if (!result.rows[0]) return res.status(401).json({ error: 'Invalid or expired session' });
  req.userId = result.rows[0].user_id;
  next();
}

module.exports = { requireAuth };
