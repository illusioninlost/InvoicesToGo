const express = require('express');
const router = express.Router();
const db = require('../db');

function parseItems(inv) {
  return { ...inv, items: typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items };
}

// GET /api/invoices
router.get('/', async (req, res) => {
  const result = await db.query('SELECT * FROM invoices WHERE user_id = $1 ORDER BY date_created DESC', [req.userId]);
  res.json(result.rows.map(parseItems));
});

// POST /api/invoices
router.post('/', async (req, res) => {
  const user = (await db.query('SELECT plan FROM users WHERE id = $1', [req.userId])).rows[0];
  if (user?.plan === 'free') {
    const { rows } = await db.query('SELECT COUNT(*) as count FROM invoices WHERE user_id = $1', [req.userId]);
    if (parseInt(rows[0].count) >= 5) {
      return res.status(403).json({ error: 'upgrade_required', limit: 'invoices', message: 'Free plan is limited to 5 invoices. Upgrade to Pro for unlimited.' });
    }
  }

  const inv = req.body;
  try {
    const result = await db.query(`
      INSERT INTO invoices
        (user_id, invoice_number, client_name, client_email, client_address, date_created, due_date, status, items, total, notes, property_address)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      req.userId,
      inv.invoice_number, inv.client_name, inv.client_email || '', inv.client_address || '',
      inv.date_created, inv.due_date, inv.status || 'unpaid',
      JSON.stringify(inv.items || []),
      inv.total || 0, inv.notes || '', inv.property_address || ''
    ]);
    res.status(201).json(parseItems(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Invoice number "${inv.invoice_number}" already exists.` });
    }
    throw err;
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
  const result = await db.query('SELECT * FROM invoices WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  res.json(parseItems(result.rows[0]));
});

// PUT /api/invoices/:id
router.put('/:id', async (req, res) => {
  const inv = req.body;
  try {
    const result = await db.query(`
      UPDATE invoices SET
        invoice_number = $1, client_name = $2, client_email = $3, client_address = $4,
        date_created = $5, due_date = $6, status = $7, items = $8,
        total = $9, notes = $10, property_address = $11
      WHERE id = $12 AND user_id = $13
      RETURNING *
    `, [
      inv.invoice_number, inv.client_name, inv.client_email || '', inv.client_address || '',
      inv.date_created, inv.due_date, inv.status || 'unpaid',
      JSON.stringify(inv.items || []),
      inv.total || 0, inv.notes || '', inv.property_address || '',
      req.params.id, req.userId
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(parseItems(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Invoice number "${inv.invoice_number}" already exists.` });
    }
    throw err;
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', async (req, res) => {
  const result = await db.query('DELETE FROM invoices WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ success: true });
});

module.exports = router;
