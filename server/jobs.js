const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('./db');
const emailConfig = require('./email.config');

function getTransporter() {
  return nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: false,
    auth: { user: emailConfig.user, pass: emailConfig.pass },
  });
}

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function nextInvoiceNumber(userId) {
  const { rows } = await db.query('SELECT invoice_number FROM invoices WHERE user_id = $1', [userId]);
  const max = rows.reduce((m, inv) => {
    const n = parseInt(inv.invoice_number.replace(/\D/g, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `RENT-${String(max + 1).padStart(3, '0')}`;
}

async function runDailyJobs() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7); // "2026-03"
  const dayOfMonth = today.getDate();

  console.log(`[Jobs] Running daily jobs for ${todayStr}`);

  // 1. Mark unpaid invoices past their due date as overdue
  const { rowCount: markedOverdue } = await db.query(
    `UPDATE invoices SET status = 'overdue' WHERE status = 'unpaid' AND due_date < $1`,
    [todayStr]
  );
  if (markedOverdue > 0) console.log(`[Jobs] Marked ${markedOverdue} invoice(s) as overdue`);

  // 2. Send overdue reminders (once per invoice)
  const { rows: overdueInvoices } = await db.query(`
    SELECT i.* FROM invoices i
    WHERE i.status = 'overdue' AND i.reminder_sent_at IS NULL AND i.client_email != ''
  `);

  if (overdueInvoices.length > 0 && emailConfig.user && emailConfig.pass) {
    const transporter = getTransporter();
    for (const inv of overdueInvoices) {
      try {
        await transporter.sendMail({
          from: emailConfig.from || emailConfig.user,
          to: inv.client_email,
          subject: `Overdue: Invoice ${inv.invoice_number} — ${fmt(inv.total)} Past Due`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              <div style="font-size:20px;font-weight:700;color:#2563eb;margin-bottom:16px;">RentInvoicesToGo</div>
              <div style="background:#fee2e2;border-radius:8px;padding:16px;margin-bottom:20px;">
                <div style="font-weight:700;color:#7f1d1d;font-size:15px;">Invoice Overdue</div>
                <div style="color:#991b1b;font-size:13px;margin-top:4px;">This invoice was due on ${inv.due_date} and has not been marked as paid.</div>
              </div>
              <p style="font-size:14px;color:#1a1d23;">Hi ${inv.client_name},</p>
              <p style="font-size:14px;color:#374151;">Invoice <strong>${inv.invoice_number}</strong> for <strong>${fmt(inv.total)}</strong> was due on <strong>${inv.due_date}</strong> and remains unpaid. Please arrange payment as soon as possible.</p>
              ${inv.notes ? `<p style="font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:12px;">${inv.notes}</p>` : ''}
              <p style="font-size:12px;color:#9ca3af;margin-top:24px;">If you believe this is an error, please contact your landlord directly.</p>
            </div>`,
        });
        await db.query('UPDATE invoices SET reminder_sent_at = NOW() WHERE id = $1', [inv.id]);
        console.log(`[Jobs] Sent overdue reminder for invoice ${inv.invoice_number} to ${inv.client_email}`);
      } catch (err) {
        console.error(`[Jobs] Failed to send reminder for invoice ${inv.id}:`, err.message);
      }
    }
  }

  // 3. Generate recurring invoices for clients whose recurring_day matches today
  const { rows: recurringClients } = await db.query(`
    SELECT c.*, u.plan FROM clients c
    JOIN users u ON u.id = c.user_id
    WHERE c.recurring_enabled = true AND c.recurring_day = $1
  `, [dayOfMonth]);

  for (const client of recurringClients) {
    try {
      // Skip if invoice for this client already exists this month
      const { rows: existing } = await db.query(
        `SELECT id FROM invoices WHERE user_id = $1 AND client_name = $2 AND date_created LIKE $3`,
        [client.user_id, client.name, `${monthStr}%`]
      );
      if (existing.length > 0) continue;

      // Enforce free tier limit
      if (client.plan === 'free') {
        const { rows } = await db.query('SELECT COUNT(*) as count FROM invoices WHERE user_id = $1', [client.user_id]);
        if (parseInt(rows[0].count) >= 5) {
          console.log(`[Jobs] Skipping recurring invoice for user ${client.user_id} — free tier limit reached`);
          continue;
        }
      }

      const invoiceNumber = await nextInvoiceNumber(client.user_id);
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 30);
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      const items = JSON.stringify([{
        description: 'Monthly Rent',
        quantity: 1,
        unit_price: client.monthly_rent,
        amount: client.monthly_rent,
      }]);

      await db.query(`
        INSERT INTO invoices
          (user_id, invoice_number, client_name, client_email, client_address, date_created, due_date, status, items, total, notes, property_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'unpaid', $8, $9, '', '')
      `, [client.user_id, invoiceNumber, client.name, client.email || '', client.address || '', todayStr, dueDateStr, items, client.monthly_rent]);

      console.log(`[Jobs] Created recurring invoice ${invoiceNumber} for ${client.name} (user ${client.user_id})`);
    } catch (err) {
      console.error(`[Jobs] Failed to create recurring invoice for client ${client.id}:`, err.message);
    }
  }
}

function startJobs() {
  // Run daily at 8:00 AM server time
  cron.schedule('0 8 * * *', runDailyJobs);
  console.log('[Jobs] Daily job scheduler started');
}

module.exports = { startJobs };
