module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // No AI vision key configured — skip the "is this really a bike" check
  // and let the app fall back to its other checks (real image file,
  // reasonable size, and the duplicate-photo hash check). This endpoint
  // will never throw a 502 — it always responds cleanly.
  return res.status(200).json({ skipped: true, reason: 'AI photo check not configured' });
};
