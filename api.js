const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const FormData = require("form-data");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: "*" }));
app.use(express.json());

const BASE_URL = "https://malz-official.biz.id/slf/";
const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36"
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extractURL(html) {
  const $ = cheerio.load(html);
  let url = $("#destinationUrl").val()?.trim();
  if (url && !url.includes("sfl.gl")) return url;
  const urls = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return urls.find(u => u.startsWith("http") && !u.includes("sfl.gl") && u.length > 15) || null;
}

async function bypass(shortUrl, attempt = 1) {
  try {
    const home = await axios.get(BASE_URL, { 
      headers: { "User-Agent": randomUserAgent() }, 
      timeout: 25000 
    });
    const cookies = home.headers["set-cookie"]?.map(c => c.split(";")[0]).join("; ") || "";
    
    await sleep(1500);
    
    const form = new FormData();
    form.append("url", shortUrl);
    
    const res = await axios.post(BASE_URL, form, {
      headers: { ...form.getHeaders(), "User-Agent": randomUserAgent(), Cookie: cookies },
      timeout: 25000,
      validateStatus: () => true
    });
    
    const dest = extractURL(res.data);
    if (!dest && attempt < 3) {
      await sleep(2000);
      return bypass(shortUrl, attempt + 1);
    }
    
    return { status: !!dest, originalUrl: shortUrl, destinationUrl: dest, error: !dest ? "URL not found" : null };
  } catch (e) {
    if (attempt < 3) {
      await sleep(3000);
      return bypass(shortUrl, attempt + 1);
    }
    return { status: false, originalUrl: shortUrl, error: e.message };
  }
}

app.get("/", (req, res) => res.json({ api: "SFL Bypass", status: "online" }));
app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.post("/api/bypass", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });
  if (!url.includes("sfl.gl")) return res.status(400).json({ error: "Only sfl.gl" });
  res.json(await bypass(url));
});

app.post("/api/bypass-batch", async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: "Array required" });
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    results.push(await bypass(urls[i]));
    if (i < urls.length - 1) await sleep(2000);
  }
  res.json({ results });
});

app.listen(PORT, () => console.log(`🚀 API on ${PORT}`));
