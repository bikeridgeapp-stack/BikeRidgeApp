/**
 * api/send-code.js
 * ---------------------------------------------------------------
 * Sends a real 6-digit verification code to a real email address
 * using Resend (resend.com — free tier, one-time signup, only you
 * can create that account). Called at signup and whenever someone
 * needs to re-verify.
 *
 * ENV VARS NEEDED:
 *   RESEND_API_KEY   — from resend.com/api-keys
 *   RESEND_FROM      — sender address, e.g. "BikeRidge <onboarding@resend.dev>"
 *                       (resend.dev works with zero setup for testing;
 *                       switch to your own verified domain before real users)
 *   JSONBIN_ID, JSONBIN_KEY — same bin as everything else
 *
 * Basic fraud guard: max 3 code requests per email per 10 minutes,
 * tracked in the shared state so it survives across serverless calls.
 * ---------------------------------------------------------------
 */
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { JSONBIN_ID, JSONBIN_KEY, RESEND_API_KEY, RESEND_FROM } = process.env;
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const state = (await getRes.json()).record;
    state.users = state.users || [];
    let user = state.users.find(u => u.email === email);
    if (!user) {
      return res.status(404).json({ error: 'No account with that email — sign up first' });
    }

    // rate limit: max 3 sends per 10 minutes per account
    const now = Date.now();
    user.codeSendLog = (user.codeSendLog || []).filter(ts => now - ts < 10 * 60 * 1000);
    if (user.codeSendLog.length >= 3) {
      return res.status(429).json({ error: 'Too many codes requested — wait a few minutes and try again' });
    }
    user.codeSendLog.push(now);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    user.verification = {
      codeHash: crypto.createHash('sha256').update(code).digest('hex'),
      expiresAt: now + 10 * 60 * 1000,
      attempts: 0
    };

    await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify(state)
    });

    if (RESEND_API_KEY) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM || 'BikeRidge <onboarding@resend.dev>',
          to: email,
          subject: 'Your BikeRidge verification code',
          text: `Your code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`
        })
      });
      if (!emailRes.ok) {
        const detail = await emailRes.text();
        return res.status(502).json({ error: 'Email send failed', detail });
      }
    } else {
      return res.status(500).json({ error: 'RESEND_API_KEY not configured on the server' });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send code', detail: String(err) });
  }
};
