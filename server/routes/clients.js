const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/clients
router.get('/', async (req, res) => {
  const result = await db.query('SELECT * FROM clients WHERE user_id = $1 ORDER BY name ASC', [req.userId]);
  res.json(result.rows);
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  const result = await db.query('SELECT * FROM clients WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Tenant not found' });
  res.json(result.rows[0]);
});

// POST /api/clients
router.post('/', async (req, res) => {
  const user = (await db.query('SELECT plan FROM users WHERE id = $1', [req.userId])).rows[0];
  if (user?.plan === 'free') {
    const { rows } = await db.query('SELECT COUNT(*) as count FROM clients WHERE user_id = $1', [req.userId]);
    if (parseInt(rows[0].count) >= 3) {
      return res.status(403).json({ error: 'upgrade_required', limit: 'tenants', message: 'Free plan is limited to 3 tenants. Upgrade to Pro for unlimited.' });
    }
  }

  const { name, address, phone, email, monthly_rent, recurring_enabled, recurring_day } = req.body;
  const result = await db.query(
    'INSERT INTO clients (user_id, name, address, phone, email, monthly_rent, recurring_enabled, recurring_day) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [req.userId, name, address || '', phone || '', email || '', monthly_rent || 0, recurring_enabled || false, recurring_day || 1]
  );
  res.status(201).json(result.rows[0]);
});

// PUT /api/clients/:id
router.put('/:id', async (req, res) => {
  const { name, address, phone, email, monthly_rent, recurring_enabled, recurring_day } = req.body;
  const result = await db.query(
    'UPDATE clients SET name = $1, address = $2, phone = $3, email = $4, monthly_rent = $5, recurring_enabled = $6, recurring_day = $7 WHERE id = $8 AND user_id = $9 RETURNING *',
    [name, address || '', phone || '', email || '', monthly_rent || 0, recurring_enabled || false, recurring_day || 1, req.params.id, req.userId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Client not found' });
  res.json(result.rows[0]);
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  const result = await db.query('DELETE FROM clients WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Client not found' });
  res.json({ success: true });
});

module.exports = router;
