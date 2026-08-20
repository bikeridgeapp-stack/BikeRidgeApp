/**
 * BikeRidge Gemini photo verification.
 * Server-side only: GEMINI_API_KEY must be configured in Vercel.
 * Fails closed on API errors or an unparseable answer.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini photo verification is not configured' });
  }

  const { imageBase64, mediaType, referenceImageBase64, referenceMediaType } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') return res.status(400).json({ error: 'imageBase64 required' });
  if (imageBase64.length > 18 * 1024 * 1024) return res.status(413).json({ error: 'Image too large' });

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const type = allowedTypes.includes(mediaType) ? mediaType : 'image/jpeg';
  const hasRef = typeof referenceImageBase64 === 'string' && referenceImageBase64.length > 0;
  const refType = allowedTypes.includes(referenceMediaType) ? referenceMediaType : 'image/jpeg';

  const parts = [{ inline_data: { mime_type: type, data: imageBase64 } }];
  if (hasRef) {
    parts.push({ inline_data: { mime_type: refType, data: referenceImageBase64 } });
    parts.push({ text: `The FIRST image is the newly submitted photo. The SECOND image is the owner's reference photo.
Answer exactly two lines:
VALID: YES or NO
MATCH: YES or NO
VALID is YES only if the first image clearly shows one of these permitted ride-share vehicles: bicycle, e-bike, scooter, e-scooter, roller skates, or skateboard (a person with one is also acceptable). Reject unrelated objects, screenshots, drawings, memes, documents, or ambiguous images.
MATCH is YES only if both images show the same physical item, allowing different angles, lighting, and backgrounds. If VALID is NO, MATCH must be NO.` });
  } else {
    parts.push({ text: 'Does this image clearly show a real bicycle, e-bike, scooter, e-scooter, roller skates, or skateboard (or a person with one)? Reject unrelated objects, screenshots, drawings, documents, memes, and ambiguous images. Reply with exactly YES or NO.' });
  }

  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 40, temperature: 0 } })
    });
    const text = await r.text();
    if (!r.ok) {
      return res.status(502).json({ error: 'Vision check failed', providerStatus: r.status, detail: text.slice(0, 1200) });
    }
    let data;
    try { data = JSON.parse(text); } catch { return res.status(502).json({ error: 'Gemini returned invalid JSON' }); }
    const answer = (data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join(' ') || '').trim().toUpperCase();

    if (hasRef) {
      const valid = /\bVALID:\s*(YES|NO)\b/.exec(answer);
      const match = /\bMATCH:\s*(YES|NO)\b/.exec(answer);
      if (!valid || !match) return res.status(502).json({ error: 'Gemini returned an unrecognized verification response' });
      return res.status(200).json({ skipped: false, isValidVehicle: valid[1] === 'YES', matchesListing: match[1] === 'YES' });
    }

    if (!/^YES\b|^NO\b/.test(answer)) return res.status(502).json({ error: 'Gemini returned an unrecognized verification response' });
    return res.status(200).json({ skipped: false, isValidVehicle: answer.startsWith('YES'), matchesListing: true });
  } catch (err) {
    return res.status(500).json({ error: 'Vision check errored', detail: String(err) });
  }
};
