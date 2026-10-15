export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  // Pull from Vercel Environment Variables first, fallback to your key
  const API_KEY = process.env.NEWS_API_KEY || "d3faacc7d17546cf8ddce6b3d7264343";
  const { category = "india", q = "" } = req.query;

  const validCategories = new Set([
    "business",
    "entertainment",
    "general",
    "health",
    "science",
    "sports",
    "technology"
  ]);

  let url = "";
  const cleanQuery = q.trim();

  if (cleanQuery) {
    // 1. Custom User Search
    url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(cleanQuery)}&sortBy=publishedAt&language=en&pageSize=35&apiKey=${API_KEY}`;
  } else if (category === "india") {
    // 2. Dedicated India Feed (Fixes NewsAPI's broken country=in & invalid category=india)
    const indiaQuery = 'India AND (economy OR government OR cricket OR technology OR markets OR ISRO OR Delhi OR Mumbai OR Bengaluru OR Hyderabad)';
    url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(indiaQuery)}&sortBy=publishedAt&language=en&pageSize=35&apiKey=${API_KEY}`;
  } else if (validCategories.has(category)) {
    // 3. Valid Standard Categories (Tech, Business, Sports, etc.)
    url = `https://newsapi.org/v2/top-headlines?category=${encodeURIComponent(category)}&language=en&pageSize=35&apiKey=${API_KEY}`;
  } else {
    // 4. "All World News" Fallback
    url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=35&apiKey=${API_KEY}`;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WorldNewsAudioAnchor/2.0"
      }
    });

    const data = await response.json();

    if (!response.ok || data.status !== "ok") {
      return res.status(response.status || 500).json({
        status: "error",
        message: data.message || "Upstream NewsAPI error."
      });
    }

    // Filter out [Removed] articles, missing descriptions, and duplicate headlines
    const seenTitles = new Set();
    const cleanedArticles = [];

    for (const art of data.articles || []) {
      if (!art.title || art.title.includes("[Removed]")) continue;

      // Normalize title to strip trailing " - Source Name" for better deduplication
      const cleanTitle = art.title.replace(/\s+-\s+[^-]+$/, "").trim();
      const titleKey = cleanTitle.toLowerCase();

      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      // Clean description for smoother SpeechSynthesis reading
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

    // Cache on Vercel's Edge CDN for 15 mins (900s), serve stale in background up to 30 mins
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=1800"
    );

    return res.status(200).json({
      status: "ok",
      totalResults: cleanedArticles.length,
      articles: cleanedArticles
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Failed to connect to news provider."
    });
  }
}
