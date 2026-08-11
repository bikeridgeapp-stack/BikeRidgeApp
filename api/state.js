/**
 * api/state.js
 * ---------------------------------------------------------------
 * Proxies all reads/writes to JSONBin through the server, so the
 * JSONBin API key lives only in Vercel's environment variables —
 * never in the browser, never visible in page source, never
 * something a stranger could copy out of dev tools and wipe your
 * data with. This is the real fix for the "no one can steal it"
 * part of the ask.
 *
 * ENV VARS NEEDED (Vercel project settings):
 *   JSONBIN_ID, JSONBIN_KEY
 *
 * GET  /api/state         -> returns the current shared state
 * PUT  /api/state (body)  -> overwrites the shared state
 * ---------------------------------------------------------------
 */
module.exports = async function handler(req, res) {
  const { JSONBIN_ID, JSONBIN_KEY } = process.env;
  if (!JSONBIN_ID || !JSONBIN_KEY) {
    return res.status(500).json({ error: 'Server missing JSONBIN_ID / JSONBIN_KEY' });
  }

  if (req.method === 'GET') {
    try {
      const r = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_KEY }
      });
      const json = await r.json();
      return res.status(200).json(json.record || {});
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load state', detail: String(err) });
    }
  }

  if (req.method === 'PUT') {
    // --- basic write validation so a stray bug or a malicious request can't
    // corrupt or blow up the shared bin (defense in depth, not a full schema check) ---
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Invalid state payload' });
    }
    const size = Buffer.byteLength(JSON.stringify(body));
    if (size > 3 * 1024 * 1024) { // 3MB cap — allows reference photos on listings, still blocks abuse/DoS-style writes
      return res.status(413).json({ error: 'State payload too large' });
    }
    try {
      const r = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
        body: JSON.stringify(req.body)
      });
      if (!r.ok) throw new Error('JSONBin rejected the write');
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save state', detail: String(err) });
    }
  }

  res.status(405).json({ error: 'GET or PUT only' });
};
