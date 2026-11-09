// Deepgram can transcribe straight from a public URL — no need to
// download/re-upload the audio buffer, since the voice note is already
// sitting at a public Cloudinary URL.
async function transcribeAudio(audioUrl) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not configured.');

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audioUrl }),
      signal: AbortSignal.timeout(60_000),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Deepgram request failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

  return typeof transcript === 'string' ? transcript.trim() : '';
}

module.exports = { transcribeAudio };
