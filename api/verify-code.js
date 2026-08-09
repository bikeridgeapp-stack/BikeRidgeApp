const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { JSONBIN_ID, JSONBIN_KEY } = process.env;
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'email and code required' });
  if (!/^\d{6}$/.test(String(code))) return res.status(400).json({ error: 'Code must be 6 digits' });

  try {
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const state = (await getRes.json()).record;
    const user = (state.users || []).find(u => u.email === email);

    if (!user || !user.verification) {
      return res.status(400).json({ error: 'No pending verification for this email' });
    }
    if (Date.now() > user.verification.expiresAt) {
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }
    if (user.verification.attempts >= 5) {
      return res.status(429).json({ error: 'Too many wrong attempts — request a new code' });
    }

    const hash = crypto.createHash('sha256').update(String(code)).digest('hex');
    if (hash !== user.verification.codeHash) {
      user.verification.attempts += 1;
      await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
        body: JSON.stringify(state)
      });
      return res.status(400).json({ error: 'Wrong code', attemptsLeft: 5 - user.verification.attempts });
    }

    user.verified = true;
    delete user.verification;

    await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify(state)
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed', detail: String(err) });
  }
};
