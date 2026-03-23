import express from 'express';
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
// Increased limit for larger PDFs
app.use(express.json({ limit: '100mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'dist')));

app.post('/api/ai', async (req, res) => {
  console.log("====================================");
  console.log("1. 📥 Received request at /api/ai");
  
  try {
    const { prompt, fileData, type } = req.body;
    console.log(`2. 📦 Payload size: ${fileData ? fileData.length : 0} bytes. Type: ${type || 'Quiz'}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("❌ ERROR: API Key is missing.");
      return res.status(500).json({ error: "Server Configuration Error: API Key missing." });
    }

    console.log("3. 🧠 Initializing Gemini Model...");
    const genAI = new GoogleGenerativeAI(apiKey);
    
  
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Handle Podcast Audio Generation
    if (type === 'audio') {
      console.log("4. 🎙️ Generating Podcast Audio...");
      const result = await model.generateContent({
        contents: [{ parts: [{ text: prompt.slice(0, 10000) }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } }
        }
      });
      const audioData = result.response.candidates[0].content.parts[0].inlineData.data;
      console.log("5. ✅ Audio generated successfully!");
      return res.json({ audioData });
    }

    // Handle Quiz / Text Generation
    console.log("4. 📤 Sending PDF and Prompt to Google...");
    const contents = [
      { inlineData: { data: fileData, mimeType: "application/pdf" } },
      { text: prompt }
    ];

    const result = await model.generateContent(contents);
    console.log("5. ✅ Google responded successfully!");
    
    res.json({ text: result.response.text() });

  } catch (error) {
    console.error("❌ BACKEND CRASH DETAILS:", error);
    res.status(500).json({ error: error.message || "Unknown Server Error" });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server successfully live on port ${PORT}`));
