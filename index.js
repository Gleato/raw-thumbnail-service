const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const app = express();
app.use(express.json());

// Helper function to execute shell commands with promise
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

// Helper function to check if a file exists and has content
const isValidFile = (filePath) => {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
};

app.post("/generate-thumbnail", async (req, res) => {
  const { rawFileUrl, uploadUrl } = req.body;
  if (!rawFileUrl || !uploadUrl) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const rawPath = path.join(tmpDir, `raw-${timestamp}.dng`);
  const thumbPath = path.join(tmpDir, `thumb-${timestamp}.jpg`);
  const dcrawPath = path.join(tmpDir, `dcraw-${timestamp}.ppm`);

  try {
    console.log("🔄 Starting RAW thumbnail generation...");

    // 1. Download RAW file from Convex
    console.log("📥 Downloading RAW file...");
    const response = await axios.get(rawFileUrl, { responseType: "stream" });
    const writer = fs.createWriteStream(rawPath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log(`✅ RAW file downloaded: ${fs.statSync(rawPath).size} bytes`);

    let thumbnailBuffer = null;
    let extractionMethod = "";

    // Method 1: Try ExifTool with PreviewImage
    try {
      console.log("🔧 Trying ExifTool PreviewImage extraction...");
      await execPromise(`exiftool -b -PreviewImage "${rawPath}" > "${thumbPath}"`);
      
      if (isValidFile(thumbPath)) {
        thumbnailBuffer = fs.readFileSync(thumbPath);
        extractionMethod = "ExifTool PreviewImage";
        console.log(`✅ ${extractionMethod} successful: ${thumbnailBuffer.length} bytes`);
      }
    } catch (err) {
      console.log("⚠️ ExifTool PreviewImage failed:", err.stderr || err.error?.message);
    }

    // Method 2: Try ExifTool with ThumbnailImage if PreviewImage failed
    if (!thumbnailBuffer) {
      try {
        console.log("🔧 Trying ExifTool ThumbnailImage extraction...");
        await execPromise(`exiftool -b -ThumbnailImage "${rawPath}" > "${thumbPath}"`);
        
        if (isValidFile(thumbPath)) {
          thumbnailBuffer = fs.readFileSync(thumbPath);
          extractionMethod = "ExifTool ThumbnailImage";
          console.log(`✅ ${extractionMethod} successful: ${thumbnailBuffer.length} bytes`);
        }
      } catch (err) {
        console.log("⚠️ ExifTool ThumbnailImage failed:", err.stderr || err.error?.message);
      }
    }

    // Method 3: Try dcraw if ExifTool methods failed
    if (!thumbnailBuffer) {
      try {
        console.log("🔧 Trying dcraw extraction...");
        
        // Use dcraw to extract a small preview
        await execPromise(`dcraw -e -c "${rawPath}" > "${dcrawPath}"`);
        
        if (isValidFile(dcrawPath)) {
          // Convert the dcraw output to JPEG using ImageMagick or similar
          try {
            await execPromise(`convert "${dcrawPath}" -resize 800x600 -quality 85 "${thumbPath}"`);
            
            if (isValidFile(thumbPath)) {
              thumbnailBuffer = fs.readFileSync(thumbPath);
              extractionMethod = "dcraw + convert";
              console.log(`✅ ${extractionMethod} successful: ${thumbnailBuffer.length} bytes`);
            }
          } catch (convertErr) {
            console.log("⚠️ Convert failed:", convertErr.stderr || convertErr.error?.message);
          }
        }
      } catch (err) {
        console.log("⚠️ dcraw failed:", err.stderr || err.error?.message);
      }
    }

    // Method 4: Try dcraw with different flags as last resort
    if (!thumbnailBuffer) {
      try {
        console.log("🔧 Trying dcraw with thumb extraction...");
        
        // Try to extract embedded thumbnail with dcraw
        await execPromise(`dcraw -e "${rawPath}"`);
        
        // dcraw creates a .thumb.jpg file
        const dcrawThumbPath = rawPath.replace(/\.[^.]+$/, '.thumb.jpg');
        
        if (isValidFile(dcrawThumbPath)) {
          thumbnailBuffer = fs.readFileSync(dcrawThumbPath);
          extractionMethod = "dcraw thumbnail";
          console.log(`✅ ${extractionMethod} successful: ${thumbnailBuffer.length} bytes`);
          
          // Clean up the dcraw thumbnail file
          try { fs.unlinkSync(dcrawThumbPath); } catch {}
        }
      } catch (err) {
        console.log("⚠️ dcraw thumbnail extraction failed:", err.stderr || err.error?.message);
      }
    }

    // If all methods failed, return an error
    if (!thumbnailBuffer || thumbnailBuffer.length === 0) {
      throw new Error("Unable to extract thumbnail from RAW file using any available method (ExifTool PreviewImage/ThumbnailImage, dcraw). The file may not contain embedded preview images.");
    }

    console.log(`🎯 Using ${extractionMethod} for thumbnail generation`);

    // 3. Upload to Convex
    console.log("📤 Uploading thumbnail to Convex...");
    const uploadResponse = await axios.post(uploadUrl, thumbnailBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": thumbnailBuffer.length,
      },
    });

    console.log("✅ Thumbnail uploaded successfully");

    // 4. Get storage ID from response
    const storageId = uploadResponse.data?.storageId;
    if (!storageId) {
      throw new Error("No storageId returned from Convex upload");
    }

    // 5. Respond to caller
    return res.json({ 
      success: true, 
      storageId,
      extractionMethod,
      thumbnailSize: thumbnailBuffer.length 
    });

  } catch (err) {
    console.error("❌ Error generating preview:", err);
    return res.status(500).json({ 
      error: err.message,
      details: "RAW thumbnail generation failed. The file may not contain extractable preview images."
    });
  } finally {
    // Clean up temporary files
    const filesToClean = [rawPath, thumbPath, dcrawPath];
    filesToClean.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (cleanupErr) {
        console.log(`⚠️ Failed to clean up ${file}:`, cleanupErr.message);
      }
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 RAW thumbnail service running on port ${PORT}`);
  console.log("📋 Available tools check:");
  
  // Check if required tools are available
  exec("exiftool -ver", (err, stdout) => {
    if (err) {
      console.log("❌ ExifTool not found - some RAW files may not work");
    } else {
      console.log(`✅ ExifTool version: ${stdout.trim()}`);
    }
  });
  
  exec("dcraw", (err, stdout, stderr) => {
    if (err && !stderr.includes("dcraw")) {
      console.log("❌ dcraw not found - fallback extraction unavailable");
    } else {
      console.log("✅ dcraw available");
    }
  });
  
  exec("convert -version", (err, stdout) => {
    if (err) {
      console.log("❌ ImageMagick convert not found - some conversions may fail");
    } else {
      console.log("✅ ImageMagick convert available");
    }
  });
});
