const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const FormData = require("form-data");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const BASE_URL = "https://malz-official.biz.id/slf/";

function randomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extractURL(html) {
  const $ = cheerio.load(html);
  const url = $("#destinationUrl").val();
  if (url && !url.includes("sfl.gl")) return url;
  const urls = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return urls.find(u => u.startsWith("http") && !u.includes("sfl.gl")) || null;
}

async function bypass(shortUrl) {
  try {
    const home = await axios.get(BASE_URL, {
      headers: { "User-Agent": randomUserAgent() },
      timeout: 20000
    });
    const cookies = home.headers["set-cookie"]?.map(c => c.split(";")[0]).join("; ") || "";
    
    await sleep(1500);
    
    const form = new FormData();
    form.append("url", shortUrl);
    
    const res = await axios.post(BASE_URL, form, {
      headers: { ...form.getHeaders(), "User-Agent": randomUserAgent(), Cookie: cookies },
      timeout: 20000,
      validateStatus: () => true
    });
    
    const dest = extractURL(res.data);
    return { status: !!dest, originalUrl: shortUrl, destinationUrl: dest };
  } catch (e) {
    return { status: false, originalUrl: shortUrl, error: e.message };
  }
}

app.get("/", (req, res) => res.json({ api: "SFL Bypass", status: "ok" }));
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.post("/api/bypass", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });
  res.json(await bypass(url));
});

app.listen(PORT, () => console.log(`API on ${PORT}`));
