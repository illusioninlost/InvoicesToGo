require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const emailConfig = require('./email.config');
const db = require('./db');
const invoiceRoutes = require('./routes/invoices');
const clientRoutes = require('./routes/clients');
const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const { requireAuth } = require('./middleware/auth');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = 3001;

app.use(cors());

// Stripe webhook must receive raw body — register before express.json()
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await db.query(
      'UPDATE users SET plan = $1 WHERE stripe_customer_id = $2',
      ['pro', session.customer]
    );
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    await db.query(
      'UPDATE users SET plan = $1 WHERE stripe_customer_id = $2',
      ['free', subscription.customer]
    );
  }

  res.json({ received: true });
});

app.use(express.json());

function unsubscribeToken(email) {
  return crypto.createHmac('sha256', process.env.UNSUBSCRIBE_SECRET || 'rentinvoicestogo-unsub')
    .update(email.toLowerCase()).digest('hex');
}

// GET /api/unsubscribe — public, no auth required
app.get('/api/unsubscribe', async (req, res) => {
  const { email, token } = req.query;
  if (!email || !token || token !== unsubscribeToken(email)) {
    return res.status(400).send('<p>Invalid unsubscribe link.</p>');
  }
  await db.query('INSERT INTO email_optouts (email) VALUES ($1) ON CONFLICT DO NOTHING', [email.toLowerCase()]);
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Unsubscribed — RentInvoicesToGo</title>
    <style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#1a1d23;}
    h1{font-size:20px;margin-bottom:12px;}p{color:#6b7280;line-height:1.6;}</style></head>
    <body><h1>You've been unsubscribed.</h1>
    <p>The email address <strong>${email}</strong> will no longer receive invoice emails from RentInvoicesToGo.</p>
    <p>If this was a mistake, ask your landlord to contact <a href="mailto:itsoveragainagain@gmail.com">itsoveragainagain@gmail.com</a> to have it reversed.</p>
    </body></html>`);
});

app.use('/api/auth', authRoutes);
app.use('/api/invoices', requireAuth, invoiceRoutes);
app.use('/api/clients', requireAuth, clientRoutes);
app.use('/api/billing', requireAuth, billingRoutes);

// Reports endpoint with filter query params
app.get('/api/reports', requireAuth, async (req, res) => {
  const { startDate, endDate, client, status } = req.query;
  const conditions = ['user_id = $1'];
  const params = [req.userId];
  let paramCount = 1;

  if (startDate) { conditions.push(`date_created >= $${++paramCount}`); params.push(startDate); }
  if (endDate)   { conditions.push(`date_created <= $${++paramCount}`); params.push(endDate); }
  if (client)    { conditions.push(`LOWER(client_name) LIKE $${++paramCount}`); params.push(`%${client.toLowerCase()}%`); }
  if (status)    { conditions.push(`status = $${++paramCount}`); params.push(status); }

  const where = 'WHERE ' + conditions.join(' AND ');
  const result = await db.query(`SELECT * FROM invoices ${where} ORDER BY date_created DESC`, params);
  res.json(result.rows.map(inv => ({ ...inv, items: typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items })));
});

// Email invoice to tenant
app.post('/api/invoices/:id/email', requireAuth, async (req, res) => {
  const invResult = await db.query('SELECT * FROM invoices WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const inv = invResult.rows[0];
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (!inv.client_email) return res.status(400).json({ error: 'This invoice has no tenant email address.' });

  const optout = await db.query('SELECT 1 FROM email_optouts WHERE email = $1', [inv.client_email.toLowerCase()]);
  if (optout.rows[0]) return res.status(400).json({ error: 'This tenant has unsubscribed from invoice emails.' });

  const items = typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items;
  const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const unsubLink = `${appUrl}/api/unsubscribe?email=${encodeURIComponent(inv.client_email)}&token=${unsubscribeToken(inv.client_email)}`;

  const statusColors = {
    paid:    { bg: '#dcfce7', color: '#14532d' },
    unpaid:  { bg: '#fef3c7', color: '#92400e' },
    overdue: { bg: '#fee2e2', color: '#7f1d1d' },
  };
  const badge = statusColors[inv.status] || statusColors.unpaid;

  const itemRows = items.map(it => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e5ea;font-size:13px;">${it.description || '—'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e5ea;font-size:13px;text-align:right;">${it.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e5ea;font-size:13px;text-align:right;">${fmt(it.unit_price)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e5ea;font-size:13px;text-align:right;font-weight:500;">${fmt(it.amount)}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;background:#f7f8fa;padding:24px;">
      <div style="background:#fff;border:1px solid #e2e5ea;border-radius:8px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
          <tr>
            <td style="vertical-align:top;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:22px;font-weight:700;color:#2563eb;letter-spacing:-0.5px;">&#127968; RentInvoicesToGo</span>
              </div>
              <div style="font-size:20px;font-weight:700;margin-top:8px;color:#1a1d23;">${inv.invoice_number}</div>
            </td>
            <td style="vertical-align:top;text-align:right;">
              <span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;background:${badge.bg};color:${badge.color};">${inv.status}</span>
              <div style="margin-top:10px;font-size:13px;color:#6b7280;">
                <div>Invoice Date: <strong style="color:#1a1d23;">${inv.date_created}</strong></div>
                <div style="margin-top:2px;">Payment Due: <strong style="color:#1a1d23;">${inv.due_date}</strong></div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Rental Property -->
        ${inv.property_address ? `
        <div style="margin-bottom:24px;">
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Rental Property</div>
          <div style="font-weight:600;font-size:14px;color:#1a1d23;">${inv.property_address}</div>
        </div>` : ''}

        <!-- Bill To -->
        <div style="margin-bottom:32px;">
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Bill To</div>
          <div style="font-weight:600;font-size:14px;color:#1a1d23;">${inv.client_name}</div>
          ${inv.client_address ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${inv.client_address}</div>` : ''}
          ${inv.client_email ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${inv.client_email}</div>` : ''}
        </div>

        <!-- Line Items -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr style="background:#f7f8fa;">
              <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid #e2e5ea;">Description</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid #e2e5ea;">Qty</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid #e2e5ea;">Unit Price</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid #e2e5ea;">Amount</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <!-- Totals -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-top:16px;">
          <div style="display:flex;gap:48px;font-size:16px;font-weight:700;border-top:2px solid #e2e5ea;padding-top:8px;">
            <span style="color:#1a1d23;">Total Due</span>
            <span style="color:#1a1d23;">${fmt(inv.total)}</span>
          </div>
        </div>

        <!-- Notes -->
        ${inv.notes ? `
        <div style="margin-top:24px;border-top:1px solid #e2e5ea;padding-top:16px;">
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Notes</div>
          <p style="font-size:13px;color:#6b7280;margin:0;white-space:pre-line;">${inv.notes}</p>
        </div>` : ''}

      </div>

        <!-- Unsubscribe footer -->
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e5ea;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">
            This invoice was sent on behalf of your landlord via RentInvoicesToGo.<br>
            <a href="${unsubLink}" style="color:#9ca3af;">Unsubscribe</a> from future invoice emails.
          </p>
        </div>

      </div>
    </div>`;

  try {
    if (!emailConfig.user || !emailConfig.pass) {
      return res.status(500).json({ error: 'Email not configured. Fill in server/email.config.js with your SMTP credentials.' });
    }

    const transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: false,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
    });

    await transporter.sendMail({
      from: emailConfig.from || emailConfig.user,
      to: inv.client_email,
      subject: `Rental Invoice ${inv.invoice_number} — ${fmt(inv.total)} Due ${inv.due_date}`,
      html,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
