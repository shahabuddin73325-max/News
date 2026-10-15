export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const API_KEY = process.env.NEWS_API_KEY || "d3faacc7d17546cf8ddce6b3d7264343";
  const { category = "india", q = "", channel = "" } = req.query;

  // Channel dictionary mapping domains & search names to exact publisher queries
  const channelDirectory = {
    "indianexpress.com": { name: "The Indian Express", site: "indianexpress.com" },
    "indian express": { name: "The Indian Express", site: "indianexpress.com" },
    "the indian express": { name: "The Indian Express", site: "indianexpress.com" },
    "thehindu.com": { name: "The Hindu", site: "thehindu.com" },
    "the hindu": { name: "The Hindu", site: "thehindu.com" },
    "hindu": { name: "The Hindu", site: "thehindu.com" },
    "ndtv.com": { name: "NDTV", site: "ndtv.com" },
    "ndtv": { name: "NDTV", site: "ndtv.com" },
    "timesofindia.indiatimes.com": { name: "Times of India", site: "indiatimes.com" },
    "times of india": { name: "Times of India", site: "indiatimes.com" },
    "toi": { name: "Times of India", site: "indiatimes.com" },
    "hindustantimes.com": { name: "Hindustan Times", site: "hindustantimes.com" },
    "hindustan times": { name: "Hindustan Times", site: "hindustantimes.com" },
    "livemint.com": { name: "LiveMint", site: "livemint.com" },
    "livemint": { name: "LiveMint", site: "livemint.com" },
    "moneycontrol.com": { name: "Moneycontrol", site: "moneycontrol.com" },
    "moneycontrol": { name: "Moneycontrol", site: "moneycontrol.com" },
    "indiatoday.in": { name: "India Today", site: "indiatoday.in" },
    "india today": { name: "India Today", site: "indiatoday.in" },
    "bbc.co.uk,bbc.com": { name: "BBC News", site: "bbc.com" },
    "bbc": { name: "BBC News", site: "bbc.com" },
    "bbc news": { name: "BBC News", site: "bbc.com" },
    "reuters.com": { name: "Reuters", site: "reuters.com" },
    "reuters": { name: "Reuters", site: "reuters.com" },
    "aljazeera.com": { name: "Al Jazeera", site: "aljazeera.com" },
    "al jazeera": { name: "Al Jazeera", site: "aljazeera.com" },
    "cnn.com": { name: "CNN", site: "cnn.com" },
    "cnn": { name: "CNN", site: "cnn.com" },
    "apnews.com": { name: "Associated Press", site: "apnews.com" },
    "theguardian.com": { name: "The Guardian", site: "theguardian.com" },
    "techcrunch.com": { name: "TechCrunch", site: "techcrunch.com" }
  };

  // Helper to decode HTML entities from RSS/XML feeds
  function decodeEntities(str = "") {
    return str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Live Google News RSS fetcher (Guarantees Indian Express & any channel always works)
  async function fetchLivePublisherFeed(searchQuery, fallbackSource = "Live News") {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
      const resp = await fetch(rssUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; WorldNewsAnchor/2.0)" }
      });
      if (!resp.ok) return [];
      const xml = await resp.text();

      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xml)) !== null && items.length < 25) {
        const block = match[1];
        const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
        const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
        const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
        const rawDesc = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
        const rawSource = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || fallbackSource;

        const cleanTitle = decodeEntities(rawTitle).replace(/\s+-\s+[^-]+$/, "").trim();
        let cleanDesc = decodeEntities(rawDesc).replace(/\s+-\s+[^-]+$/, "").trim();

        // If description simply repeats the title, provide a clean anchor summary prompt
        if (!cleanDesc || cleanDesc.toLowerCase().startsWith(cleanTitle.toLowerCase().slice(0, 30))) {
          cleanDesc = `Latest breaking coverage reported by ${decodeEntities(rawSource)}.`;
        }

        if (cleanTitle) {
          items.push({
            source: { name: decodeEntities(rawSource) || fallbackSource },
            title: cleanTitle,
            description: cleanDesc,
            url: link.trim(),
            urlToImage: null,
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
          });
        }
      }
      return items;
    } catch (_) {
      return [];
    }
  }

  // Standard NewsAPI fetcher
  async function fetchNewsApi(url) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "WorldNewsAudioAnchor/2.0" } });
      const data = await r.json();
      if (data && data.status === "ok" && Array.isArray(data.articles)) {
        return data.articles;
      }
    } catch (_) {}
    return [];
  }

  const cleanQuery = q.trim();
  const lowerQuery = cleanQuery.toLowerCase();
  const selectedChannelKey = channel.trim() || (channelDirectory[lowerQuery] ? lowerQuery : "");
  const channelObj = channelDirectory[selectedChannelKey];

  const validCategories = new Set([
    "business", "entertainment", "general", "health", "science", "sports", "technology"
  ]);

  try {
    let streams = [];

    if (channelObj) {
      // 1. Specific Channel Selected (e.g., The Indian Express, NDTV, BBC)
      const extraTopic = (cleanQuery && !channelDirectory[lowerQuery])
        ? ` ${cleanQuery}`
        : (validCategories.has(category) ? ` ${category}` : "");

      const rssQuery = `site:${channelObj.site}${extraTopic} when:3d`;
      const newsApiUrl = `https://newsapi.org/v2/everything?domains=${encodeURIComponent(channelObj.site)}${extraTopic ? `&q=${encodeURIComponent(extraTopic.trim())}` : ""}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${API_KEY}`;

      streams = await Promise.all([
        fetchLivePublisherFeed(rssQuery, channelObj.name),
        fetchNewsApi(newsApiUrl)
      ]);
    } else if (cleanQuery) {
      // 2. Custom Search (Searches Indian publishers, Global NewsAPI, and Live RSS simultaneously)
      streams = await Promise.all([
        fetchLivePublisherFeed(`${cleanQuery} (site:indianexpress.com OR site:thehindu.com OR site:ndtv.com OR site:reuters.com OR site:bbc.com)`, "Live Wire"),
        fetchNewsApi(`https://newsapi.org/v2/everything?q=${encodeURIComponent(cleanQuery)}&sortBy=publishedAt&language=en&pageSize=25&apiKey=${API_KEY}`)
      ]);
    } else if (category === "india") {
      // 3. Default India + World Mix (Guarantees Indian Express, The Hindu, NDTV + International News)
      streams = await Promise.all([
        fetchLivePublisherFeed("site:indianexpress.com OR site:thehindu.com OR site:ndtv.com OR site:hindustantimes.com when:1d", "Indian National Desk"),
        fetchNewsApi(`https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${API_KEY}`),
        fetchNewsApi(`https://newsapi.org/v2/everything?domains=indianexpress.com,thehindu.com,ndtv.com,livemint.com&sortBy=publishedAt&language=en&pageSize=15&apiKey=${API_KEY}`)
      ]);
    } else if (validCategories.has(category)) {
      // 4. Category Tabs (Blends Indian Express/National category stories with Global category stories)
      streams = await Promise.all([
        fetchLivePublisherFeed(`${category} (site:indianexpress.com OR site:thehindu.com OR site:ndtv.com OR site:livemint.com) when:2d`, "India Desk"),
        fetchNewsApi(`https://newsapi.org/v2/top-headlines?category=${encodeURIComponent(category)}&language=en&pageSize=20&apiKey=${API_KEY}`)
      ]);
    } else {
      // 5. All World News Tab
      streams = await Promise.all([
        fetchNewsApi(`https://newsapi.org/v2/top-headlines?language=en&pageSize=25&apiKey=${API_KEY}`),
        fetchLivePublisherFeed("site:bbc.com OR site:reuters.com OR site:aljazeera.com OR site:indianexpress.com when:1d", "World Desk")
      ]);
    }

    // Interleave articles from all streams evenly
    const combinedRaw = [];
    const maxLen = Math.max(0, ...streams.map(s => s.length));
    for (let i = 0; i < maxLen; i++) {
      for (const stream of streams) {
        if (stream[i]) combinedRaw.push(stream[i]);
      }
    }

    const seenTitles = new Set();
    const cleanedArticles = [];

    for (const art of combinedRaw) {
      if (!art.title || art.title.includes("[Removed]")) continue;

      const cleanTitle = art.title.replace(/\s+-\s+[^-]+$/, "").trim();
      const titleKey = cleanTitle.toLowerCase().slice(0, 60);
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      const cleanDesc = (art.description || art.content || "")
        .replace(/\[\+\d+\s+chars\]/gi, "")
        .replace(/<[^>]*>/g, "")
        .trim();

      cleanedArticles.push({
        source: { name: art.source?.name || (channelObj ? channelObj.name : "News Desk") },
        title: cleanTitle,
        description: cleanDesc || `Breaking coverage from ${art.source?.name || "News Desk"}.`,
        url: art.url,
        urlToImage: art.urlToImage || null,
        publishedAt: art.publishedAt
      });

      if (cleanedArticles.length >= 28) break;
    }

    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
    return res.status(200).json({ status: "ok", articles: cleanedArticles });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Failed to load news feed." });
  }
}
