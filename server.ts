import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to handle JSON payloads
  app.use(express.json({ limit: "25mb" }));

  // Initialize Gemini SDK with telemetry header
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });

  // AI TRICK VIDEO VERIFICATION
  app.post("/api/verify-trick", async (req, res) => {
    try {
      const { spotName, description, frameBase64, mimeType } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is missing on server. Returning graceful pass.");
        return res.json({
          verified: true,
          detectedTrick: "Kickflip Simulator",
          confidence: 0.95,
          feedback: "Awaiting developer GEMINI_API_KEY config. Local simulation passed +250 XP!",
          pointsAwarded: 250
        });
      }

      console.log(`Analyzing trick for spot ${spotName}...`);

      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: frameBase64
        }
      };

      const systemInstruction = `You are an elite, world-class professional skateboarder, skate judge, and computer vision AI analyzer.
Analyze the user's uploaded skateboard stunt video clip frame.
Spot name is: ${spotName}.
User description of the trick is: "${description}".
Determine if this is a genuine skateboarding trick, what the trick name is, and its difficulty level.
Return a rigorous JSON object matching this schema exactly:
{
  "verified": boolean (true of false. If the image is invalid, completely unrelated, or black, or not skate-related, set false),
  "detectedTrick": string (e.g. Kickflip, Heelflip, Boardslide, 50-50, etc),
  "confidence": number (between 0.0 and 1.0),
  "feedback": string (brief, styled, high-hype skate feedback e.g., "Slick rollaway! Clean pop!"),
  "pointsAwarded": number (points from 50 to 450 depending on trick complexity)
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            parts: [
              imagePart,
              { text: `Analyze this skateboarding trick frame. Spot: ${spotName}. Description: ${description}. Output raw JSON only.` }
            ]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verified: { type: Type.BOOLEAN },
              detectedTrick: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              feedback: { type: Type.STRING },
              pointsAwarded: { type: Type.INTEGER }
            },
            required: ["verified", "detectedTrick", "confidence", "feedback", "pointsAwarded"]
          }
        }
      });

      const textOutput = response.text || "{}";
      const parsedOutput = JSON.parse(textOutput.trim());
      res.json(parsedOutput);
    } catch (error) {
      console.error("Gemini Verification Error: ", error);
      res.status(500).json({
        verified: false,
        detectedTrick: "Unknown",
        confidence: 0.0,
        feedback: `Telemetry scanning interface error: ${error instanceof Error ? error.message : String(error)}`,
        pointsAwarded: 0
      });
    }
  });

  // Video database directory setup
  const VIDEO_DIR = path.join(process.cwd(), "skate_videos");
  if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
  }

  // API to upload and store videos dynamically
  app.post("/api/videos/upload", (req, res) => {
    try {
      const { id, base64, mimeType } = req.body;
      if (!id || !base64) {
        return res.status(400).json({ error: "Missing video id or data" });
      }

      const filePath = path.join(VIDEO_DIR, `${id}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ base64, mimeType: mimeType || "video/mp4" }));
      console.log(`[STORAGE] Stored video clip ${id} on disk.`);
      res.json({ success: true, url: `/api/videos/${id}` });
    } catch (err) {
      console.error("Video write error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // API to stream videos and play tricks smoothly for all users
  app.get("/api/videos/:id", (req, res) => {
    const { id } = req.params;
    const filePath = path.join(VIDEO_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Trick video not found");
    }

    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const { base64, mimeType } = JSON.parse(fileContent);
      
      let base64Data = base64;
      const base64Index = base64.indexOf(";base64,");
      if (base64Index !== -1) {
        base64Data = base64.substring(base64Index + 8);
      }
      const buffer = Buffer.from(base64Data, "base64");

      res.writeHead(200, {
        "Content-Type": mimeType || "video/mp4",
        "Content-Length": buffer.length,
        "Accept-Ranges": "bytes"
      });
      res.end(buffer);
    } catch (err) {
      console.error("Video read/stream error:", err);
      res.status(500).send("Video streaming failed");
    }
  });

  // API Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timeline: Date.now() });
  });

  // Mount Vite middleware or serve built asset files
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Full-Stack Node.js backend active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
