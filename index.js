const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const app = express();
app.use(express.json());

app.post("/generate-thumbnail", async (req, res) => {
  const { rawFileUrl, uploadUrl } = req.body;
  if (!rawFileUrl || !uploadUrl) return res.status(400).json({ error: "Missing parameters" });

  const tmpDir = os.tmpdir();
  const rawPath = path.join(tmpDir, `raw-${Date.now()}.dng`);
  const thumbPath = path.join(tmpDir, `thumb-${Date.now()}.jpg`);

  try {
    // 1. Download RAW file from Convex
    const response = await axios.get(rawFileUrl, { responseType: "stream" });
    const writer = fs.createWriteStream(rawPath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => writer.on("finish", resolve).on("error", reject));

    // 2. Extract JPEG thumbnail with ExifTool
    await new Promise((resolve, reject) => {
      exec(`exiftool -b -PreviewImage ${rawPath} > ${thumbPath}`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // 3. Upload to Convex using the given signed URL
    const fileBuffer = fs.readFileSync(thumbPath);
    const fs = require("fs");

const thumbnailBuffer = fs.readFileSync(thumbPath);

await axios.put(uploadUrl, thumbnailBuffer, {
  headers: {
    "Content-Type": "image/jpeg",
    "Content-Length": thumbnailBuffer.length,
  },
});

    // 4. Respond to caller
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Error generating preview:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    try {
      fs.unlinkSync(rawPath);
      fs.unlinkSync(thumbPath);
    } catch {}
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

