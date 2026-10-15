export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { text = "", tl = "en-IN" } = req.query;
  if (!text.trim()) {
    return res.status(400).json({ error: "Missing text" });
  }

  const clean = text.slice(0, 200);
  const ttsUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(clean)}&tl=${encodeURIComponent(tl)}&client=tw-ob`;

  try {
    const response = await fetch(ttsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: "Voice server busy" });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
