const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const app = express();
app.use(express.json());

const execPromise = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message);
      else resolve(stdout);
    });
  });

app.post("/generate-thumbnail", async (req, res) => {
  const { rawFileUrl, uploadUrl } = req.body;
  if (!rawFileUrl || !uploadUrl) {
    return res.status(400).json({ error: "Missing rawFileUrl or uploadUrl" });
  }

  const tmp = os.tmpdir();
  const id = Date.now();
  const rawPath = path.join(tmp, `raw-${id}.dng`);
  const jpgPath = path.join(tmp, `preview-${id}.jpg`);

  try {
    // Download RAW
    const rawStream = await axios.get(rawFileUrl, { responseType: "stream" });
    const rawWriter = fs.createWriteStream(rawPath);
    await new Promise((resolve, reject) => {
      rawStream.data.pipe(rawWriter);
      rawWriter.on("finish", resolve);
      rawWriter.on("error", reject);
    });

    // Convert with darktable-cli using virtual display
    await execPromise(`darktable-cli-headless "${rawPath}" "${jpgPath}" --width 1920 --height 1080 --hq true`);

    // Upload to Convex
    const jpegBuffer = fs.readFileSync(jpgPath);
    const uploadRes = await axios.post(uploadUrl, jpegBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": jpegBuffer.length,
      },
    });

    const storageId = uploadRes.data?.storageId;
    if (!storageId) throw new Error("No storageId returned");

    res.json({ success: true, storageId });
  } catch (err) {
    console.error("❌ Conversion error:", err);
    res.status(500).json({ error: err.message || "Conversion failed" });
  } finally {
    [rawPath, jpgPath].forEach((f) => {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🖼️ Image service running on port ${PORT}`));
