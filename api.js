const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const FormData = require("form-data");
const https = require("https");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const BASE_URL = "https://malz-official.biz.id/slf/";

const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1"
];

const httpsAgent = new https.Agent({
  keepAlive: true,
  timeout: 30000,
  freeSocketTimeout: 30000
});

const httpAgent = new http.Agent({
  keepAlive: true,
  timeout: 30000,
  freeSocketTimeout: 30000
});

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomDelay(min = 1000, max = 3000) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDestinationURL(html) {
  const $ = cheerio.load(html);

  let destinationUrl = $("#destinationUrl").val()?.trim();
  if (destinationUrl && !destinationUrl.includes("sfl.gl")) {
    return destinationUrl;
  }

  destinationUrl = $(".destination-url, .final-url, .result-url").text().trim();
  if (destinationUrl && !destinationUrl.includes("sfl.gl")) {
    return destinationUrl;
  }

  let foundUrl = null;
  $("tr").each((_, el) => {
    const row = $(el).text();
    if (row.includes("Destination") || row.includes("URL")) {
      const url = $(el).find("td").eq(1).text().trim();
      if (url && url.startsWith("http") && !url.includes("sfl.gl")) {
        foundUrl = url;
      }
    }
  });
  if (foundUrl) return foundUrl;

  destinationUrl = $(".result a, [class*='result'] a, [id*='result'] a").attr("href")?.trim();
  if (destinationUrl && !destinationUrl.includes("sfl.gl")) {
    return destinationUrl;
  }

  const allUrls = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
  const validUrl = allUrls.find(u => 
    u.startsWith("http") && 
    !u.includes("sfl.gl") && 
    !u.includes("malz-official") &&
    u.length > 15
  );
  if (validUrl) return validUrl;

  const redirectMatch = html.match(/redirect["\s=]+([^"'\s<>]+)/i);
  if (redirectMatch && redirectMatch[1].startsWith("http")) {
    return redirectMatch[1];
  }

  return null;
}

async function bypassShortLink(shortUrl, attempt = 1, maxAttempts = 3) {
  try {
    if (!shortUrl) {
      throw new Error("Short URL required");
    }

    const homeRes = await axios.get(BASE_URL, {
      headers: {
        "User-Agent": randomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      },
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      timeout: 30000,
      responseType: "arraybuffer"
    });

    const cookies = homeRes.headers["set-cookie"]
      ?.map(c => c.split(";")[0])
      .join("; ") || "";

    await sleep(getRandomDelay(1500, 3000));

    const form = new FormData();
    form.append("url", shortUrl);

    const postRes = await axios.post(BASE_URL, form, {
      headers: {
        ...form.getHeaders(),
        "User-Agent": randomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Cookie": cookies,
        "Origin": BASE_URL.replace(/\/$/, ""),
        "Referer": BASE_URL
      },
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      validateStatus: () => true,
      timeout: 30000,
      responseType: "arraybuffer"
    });

    const html = Buffer.from(postRes.data).toString("utf-8");
    const destinationUrl = extractDestinationURL(html);

    if (!destinationUrl) {
      if (attempt < maxAttempts) {
        await sleep(getRandomDelay(2000, 4000));
        return bypassShortLink(shortUrl, attempt + 1, maxAttempts);
      }
      throw new Error("Destination URL not found");
    }

    return {
      status: true,
      originalUrl: shortUrl,
      destinationUrl: destinationUrl,
      message: "Bypass successful ✓"
    };

  } catch (error) {
    if (attempt < maxAttempts && (error.message.includes("timeout") || error.message.includes("ECONNRESET"))) {
      await sleep(getRandomDelay(3000, 5000));
      return bypassShortLink(shortUrl, attempt + 1, maxAttempts);
    }

    return {
      status: false,
      originalUrl: shortUrl,
      error: error.message,
      message: error.message
    };
  }
}

app.post("/api/bypass", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL required" });
  }

  if (!url.includes("sfl.gl")) {
    return res.status(400).json({ error: "Only sfl.gl links supported" });
  }

  const result = await bypassShortLink(url);
  res.json(result);
});

app.post("/api/bypass-batch", async (req, res) => {
  const { urls } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "URLs array required" });
  }

  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const result = await bypassShortLink(urls[i]);
    results.push(result);
    
    if (i < urls.length - 1) {
      await sleep(getRandomDelay(1500, 3000));
    }
  }

  res.json({ results });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});