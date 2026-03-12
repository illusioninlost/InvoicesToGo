const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../db');
const emailConfig = require('../email.config');

const router = express.Router();

async function sendResetEmail(toEmail, token) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  const transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: false,
    auth: { user: emailConfig.user, pass: emailConfig.pass },
  });

  await transporter.sendMail({
    from: emailConfig.from || emailConfig.user,
    to: toEmail,
    subject: 'Reset your RentInvoicesToGo password',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="font-size:20px;font-weight:700;color:#2563eb;margin-bottom:24px;">RentInvoicesToGo</div>
        <p style="font-size:15px;color:#1a1d23;">We received a request to reset your password.</p>
        <p style="font-size:15px;color:#1a1d23;">Click the button below or paste the token into the reset form. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetLink}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Reset password</a>
        <p style="font-size:13px;color:#6b7280;margin-top:8px;">Or copy this token: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${token}</code></p>
        <p style="font-size:12px;color:#9ca3af;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === test;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) return res.status(409).json({ error: 'An account with that email already exists.' });

  const password_hash = hashPassword(password);
  const userResult = await db.query(
    'INSERT INTO users (name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, email, phone || null, password_hash]
  );
  const userId = userResult.rows[0].id;

  const token = generateToken();
  await db.query('INSERT INTO sessions (user_id, token) VALUES ($1, $2)', [userId, token]);

  res.status(201).json({ token, user: { id: userId, name, email, phone } });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = generateToken();
  await db.query('INSERT INTO sessions (user_id, token) VALUES ($1, $2)', [user.id, token]);

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    await db.query('DELETE FROM sessions WHERE token = $1', [token]);
  }
  res.json({ ok: true });
});

// POST /api/auth/request-reset
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  // Always respond with success to avoid email enumeration
  if (!user) return res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });

  // Expire old tokens for this user
  await db.query('UPDATE password_resets SET used = 1 WHERE user_id = $1', [user.id]);

  const token = generateToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  await db.query('INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, token, expires]);

  try {
    await sendResetEmail(email, token);
  } catch (err) {
    console.error('[Password Reset] Failed to send email:', err.message);
    return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
  }

  res.json({ ok: true, message: 'Reset token generated.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });

  const result = await db.query('SELECT * FROM password_resets WHERE token = $1 AND used = 0', [token]);
  const reset = result.rows[0];

  if (!reset) return res.status(400).json({ error: 'Invalid or already used reset token.' });

  if (new Date(reset.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
  }

  const password_hash = hashPassword(password);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, reset.user_id]);
  await db.query('UPDATE password_resets SET used = 1 WHERE id = $1', [reset.id]);
  // Invalidate all sessions for this user after password reset
  await db.query('DELETE FROM sessions WHERE user_id = $1', [reset.user_id]);

  res.json({ ok: true, message: 'Password reset successfully. Please log in.' });
});

module.exports = router;
