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
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Invalid state payload' });
    }
    const size = Buffer.byteLength(JSON.stringify(body));
    if (size > 3 * 1024 * 1024) {
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
