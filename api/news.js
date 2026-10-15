export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const API_KEY = process.env.NEWS_API_KEY || "d3faacc7d17546cf8ddce6b3d7264343";
  const { category = "india", q = "" } = req.query;

  const validCategories = new Set([
    "business", "entertainment", "general", "health", "science", "sports", "technology"
  ]);

  let url = "";
  const cleanQuery = q.trim();

  if (cleanQuery) {
    url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(cleanQuery)}&sortBy=publishedAt&language=en&pageSize=35&apiKey=${API_KEY}`;
  } else if (category === "india") {
    const indiaQuery = 'India AND (economy OR government OR cricket OR technology OR markets OR ISRO OR Delhi OR Mumbai OR Bengaluru OR Hyderabad)';
    url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(indiaQuery)}&sortBy=publishedAt&language=en&pageSize=35&apiKey=${API_KEY}`;
  } else if (validCategories.has(category)) {
    url = `https://newsapi.org/v2/top-headlines?category=${encodeURIComponent(category)}&language=en&pageSize=35&apiKey=${API_KEY}`;
  } else {
    url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=35&apiKey=${API_KEY}`;
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "WorldNewsAudioAnchor/2.0" }
    });
    const data = await response.json();

    if (!response.ok || data.status !== "ok") {
      return res.status(response.status || 500).json({
        status: "error",
        message: data.message || "Upstream NewsAPI error."
      });
    }

    const seenTitles = new Set();
    const cleanedArticles = [];

    for (const art of data.articles || []) {
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
        source: { name: art.source?.name || "Global Wire" },
        title: cleanTitle,
        description: cleanDesc,
        url: art.url,
        urlToImage: art.urlToImage,
        publishedAt: art.publishedAt
      });

      if (cleanedArticles.length >= 24) break;
    }

    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=1800");
    return res.status(200).json({ status: "ok", articles: cleanedArticles });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Failed to connect to news provider." });
  }
}
