module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) {
    return res.status(200).json({ skipped: true, reason: 'GEMINI_API_KEY not configured' });
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 required' });
  }
  if (imageBase64.length > 20 * 1024 * 1024) {
    return res.status(413).json({ error: 'Image too large' });
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const type = allowedTypes.includes(mediaType) ? mediaType : 'image/jpeg';

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: type, data: imageBase64 } },
              { text: 'Does this photo clearly show a real bicycle (or a person with one)? Reply with exactly one word: YES or NO.' }
            ]
          }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 }
        })
      }
    );
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: 'Vision check failed', detail });
    }
    const data = await r.json();
    const answer = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toUpperCase();
    return res.status(200).json({ skipped: false, isBike: answer.startsWith('YES') });
  } catch (err) {
    return res.status(500).json({ error: 'Vision check errored', detail: String(err) });
  }
};
