const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const db = require('../db');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/billing/create-checkout-session
router.post('/create-checkout-session', async (req, res) => {
  const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  const user = userResult.rows[0];

  // Reuse existing Stripe customer or create a new one
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: user.name });
    customerId = customer.id;
    await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.userId]);
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/billing?canceled=1`,
  });

  res.json({ url: session.url });
});

// GET /api/billing/portal
router.get('/portal', async (req, res) => {
  const userResult = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.userId]);
  const customerId = userResult.rows[0]?.stripe_customer_id;
  if (!customerId) return res.status(400).json({ error: 'No billing account found.' });

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/billing`,
  });

  res.json({ url: session.url });
});

// GET /api/billing/status
router.get('/status', async (req, res) => {
  const result = await db.query('SELECT plan FROM users WHERE id = $1', [req.userId]);
  res.json({ plan: result.rows[0]?.plan || 'free' });
});

module.exports = router;
