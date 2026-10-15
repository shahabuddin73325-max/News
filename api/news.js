export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const API_KEY = process.env.NEWS_API_KEY || "d3faacc7d17546cf8ddce6b3d7264343";
  const { category = "india", q = "" } = req.query;

  // Top Indian National Publishers (Includes The Indian Express)
  const indianDomains = [
    "indianexpress.com",
    "thehindu.com",
    "ndtv.com",
    "timesofindia.indiatimes.com",
    "hindustantimes.com",
    "livemint.com",
    "moneycontrol.com"
  ].join(",");

  const validCategories = new Set([
    "business", "entertainment", "general", "health", "science", "sports", "technology"
  ]);

  const cleanQuery = q.trim();
  const urlsToFetch = [];

  if (cleanQuery) {
    // Search both Indian & International sources for the user's keyword
    urlsToFetch.push(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(cleanQuery)}&domains=${indianDomains}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${API_KEY}`,
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(cleanQuery)}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${API_KEY}`
    );
  } else if (category === "india") {
    // 1. Direct Indian National Publishers (Indian Express, Hindu, NDTV, etc.)
    // 2. International coverage of India
    urlsToFetch.push(
      `https://newsapi.org/v2/everything?domains=${indianDomains}&sortBy=publishedAt&language=en&pageSize=25&apiKey=${API_KEY}`,
      `https://newsapi.org/v2/everything?q=India&sortBy=publishedAt&language=en&pageSize=15&apiKey=${API_KEY}`
    );
  } else if (category === "all") {
    // Mix Top World Headlines + Top Indian National Headlines together
    urlsToFetch.push(
      `https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${API_KEY}`,
      `https://newsapi.org/v2/everything?domains=${indianDomains}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${API_KEY}`
    );
  } else if (validCategories.has(category)) {
    // Mix International Category Headlines + Indian Category Headlines (e.g. India Cricket/Sports + World Sports)
    urlsToFetch.push(
      `https://newsapi.org/v2/top-headlines?category=${encodeURIComponent(category)}&language=en&pageSize=20&apiKey=${API_KEY}`,
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(category)}&domains=${indianDomains}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${API_KEY}`
    );
  } else {
    urlsToFetch.push(
      `https://newsapi.org/v2/top-headlines?language=en&pageSize=30&apiKey=${API_KEY}`
    );
  }

  try {
    // Fetch National & International streams simultaneously
    const responses = await Promise.all(
      urlsToFetch.map(url =>
        fetch(url, { headers: { "User-Agent": "WorldNewsAudioAnchor/2.0" } })
          .then(r => r.json())
          .catch(() => ({ status: "error", articles: [] }))
      )
    );

    const lists = responses
      .filter(r => r && r.status === "ok" && Array.isArray(r.articles))
      .map(r => r.articles);

    if (lists.length === 0) {
      const firstErr = responses.find(r => r?.message)?.message || "Unable to fetch news.";
      return res.status(500).json({ status: "error", message: firstErr });
    }

    // Interleave articles (1 National, 1 International, etc.) so the feed has a balanced mix
    const combinedRaw = [];
    const maxLen = Math.max(...lists.map(l => l.length));
    for (let i = 0; i < maxLen; i++) {
      for (const list of lists) {
        if (list[i]) combinedRaw.push(list[i]);
      }
    }

    // Deduplicate and clean text for human voice reading
    const seenTitles = new Set();
    const cleanedArticles = [];

    for (const art of combinedRaw) {
      if (!art.title || art.title.includes("[Removed]")) continue;

      const cleanTitle = art.title.replace(/\s+-\s+[^-]+$/, "").trim();
      const titleKey = cleanTitle.toLowerCase();
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      const cleanDesc = (art.description || art.content || "")
        .replace(/\[\+\d+\s+chars\]/gi, "")
        .replace(/<[^>]*>/g, "")
        .trim();

      cleanedArticles.push({
        source: { name: art.source?.name || "News Desk" },
        title: cleanTitle,
        description: cleanDesc,
        url: art.url,
        urlToImage: art.urlToImage,
        publishedAt: art.publishedAt
      });

      if (cleanedArticles.length >= 28) break;
    }

    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=1800");
    return res.status(200).json({ status: "ok", articles: cleanedArticles });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Failed to connect to news provider." });
  }
}
