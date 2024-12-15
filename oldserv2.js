const express = require("express");
const puppeteer = require("puppeteer");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors()); // Allow requests from other origins
app.use(express.static("public")); // Serve static files from the 'public' folder

app.get("/chapters", async (req, res) => {
    try {
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
  
      // Navigate to the manga's main page
      const mangaUrl = "https://www.mangahere.cc/manga/black_clover/";
      await page.goto(mangaUrl, { waitUntil: "networkidle2" });
  
      // Scrape all chapter links
      const chapters = await page.$$eval(".detail-main-list a", (links) =>
        links.map((link) => ({
          name: link.textContent.trim(),
          url: link.href.match(/black_clover\/(c\d+)/)?.[1],
        }))
      );
  
      await browser.close();
  
      if (!chapters.length) throw new Error("No chapters found");
  
      res.json({ success: true, chapters });
    } catch (error) {
      console.error("Error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  


app.get("/scrape-image", async (req, res) => {
    try {
        const { chapter, page } = req.query; // Extract chapter and page from query params
        if (!chapter || !page) {
            return res.status(400).json({ success: false, error: "Chapter and page are required" });
        }

        const browser = await puppeteer.launch({ headless: true });
        const pageObj = await browser.newPage();

        // Set user-agent and referer headers to avoid being blocked
        await pageObj.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );
        await pageObj.setExtraHTTPHeaders({ Referer: "https://www.mangahere.cc" });

        // Construct the URL dynamically
        const url = `https://www.mangahere.cc/manga/black_clover/${chapter}/${page}.html`;
        await pageObj.goto(url, { waitUntil: "networkidle2" });

        // Extract the image URL
        await pageObj.waitForSelector(".reader-main-img");
        const imageUrl = await pageObj.$eval(".reader-main-img", (img) => img.src);

        console.log(`Scraped Image URL for ${chapter}/${page}:`, imageUrl);

        // Fetch the image from the scraped URL
        const imageResponse = await fetch(imageUrl, {
            headers: {
                Referer: url,
                "User-Agent": "Mozilla/5.0",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });

        if (!imageResponse.ok) throw new Error("Failed to fetch image from source");

        // Save the image locally in the 'public' folder
        const buffer = await imageResponse.buffer();
        const fileName = `page-${chapter}-${page}-${Date.now()}.jpg`;
        const filePath = path.join(__dirname, "public", fileName);

        fs.mkdirSync(path.dirname(filePath), { recursive: true }); // Ensure 'public' folder exists
        fs.writeFileSync(filePath, buffer);

        // Send the public URL to the client
        res.json({ success: true, image: `/${fileName}` });

        await browser.close();
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.listen(3000, () => console.log("Server running on http://localhost:3000"));
