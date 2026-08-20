/**
 * api/verify-photo.js
 * ---------------------------------------------------------------
 * Real fix for "any photo works" on the pre-ride audit. Uses Google
 * Gemini for two checks in one call:
 *   1. Is this actually a bike/e-bike/scooter/e-scooter/rollerskates/
 *      skateboard (or a person with one)?
 *   2. If a listing reference photo is provided — is this the SAME
 *      physical item, even from a different angle?
 *
 * ENV VAR NEEDED:
 *   GEMINI_API_KEY
 *
 * POST body:
 *   imageBase64            (required)
 *   mediaType               (required)
 *   referenceImageBase64    (optional)
 *   referenceMediaType      (optional)
 * ---------------------------------------------------------------
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { GEMINI_API_KEY } = process.env;

  if (!GEMINI_API_KEY) {
    return res.status(200).json({
      skipped: true,
      reason: 'GEMINI_API_KEY not configured'
    });
  }

  const {
    imageBase64,
    mediaType,
    referenceImageBase64,
    referenceMediaType
  } = req.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({
      error: 'imageBase64 required'
    });
  }

  if (imageBase64.length > 20 * 1024 * 1024) {
    return res.status(413).json({
      error: 'Image too large'
    });
  }

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  const type = allowedTypes.includes(mediaType)
    ? mediaType
    : 'image/jpeg';

  const hasRef =
    typeof referenceImageBase64 === 'string' &&
    referenceImageBase64.length > 0;

  const refType = allowedTypes.includes(referenceMediaType)
    ? referenceMediaType
    : 'image/jpeg';

  const parts = [
    {
      inline_data: {
        mime_type: type,
        data: imageBase64
      }
    }
  ];

  if (hasRef) {
    parts.push({
      inline_data: {
        mime_type: refType,
        data: referenceImageBase64
      }
    });

    parts.push({
      text: `The FIRST image is a photo just taken by a renter. The SECOND image is the reference photo the owner uploaded when listing their item (a bike, e-bike, scooter, e-scooter, rollerskates, skateboard, or similar ride-share item).

Answer two yes/no questions, each on its own line, in exactly this format:

VALID: YES or NO (does the first image clearly show a real bike/e-bike/scooter/e-scooter/rollerskates/skateboard or similar, not something unrelated?)

MATCH: YES or NO (do the two images show the SAME physical item, allowing for a different angle, lighting, or background? If VALID is NO, answer MATCH as NO.)`
    });
  } else {
    parts.push({
      text: 'Does this photo clearly show a real bike, e-bike, scooter, e-scooter, rollerskates, skateboard, or similar ride-share item (or a person with one)? Reply with exactly one word: YES or NO.'
    });
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: 30,
            temperature: 0
          }
        })
      }
    );

    if (!r.ok) {
      const detail = await r.text();

      return res.status(502).json({
        error: 'Vision check failed',
        detail
      });
    }

    const data = await r.json();

    const answer = (
      data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    )
      .trim()
      .toUpperCase();

    if (hasRef) {
      const validMatch = /VALID:\s*(YES|NO)/.exec(answer);
      const matchMatch = /MATCH:\s*(YES|NO)/.exec(answer);

      return res.status(200).json({
        skipped: false,
        isValidVehicle: validMatch
          ? validMatch[1] === 'YES'
          : true,
        matchesListing: matchMatch
          ? matchMatch[1] === 'YES'
          : true
      });
    }

    return res.status(200).json({
      skipped: false,
      isValidVehicle: answer.startsWith('YES'),
      matchesListing: true
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Vision check errored',
      detail: String(err)
    });
  }
};
