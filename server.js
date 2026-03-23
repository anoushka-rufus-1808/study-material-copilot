import express from 'express';
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '100mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'dist')));

app.post('/api/ai', async (req, res) => {
  try {
    const { prompt, fileData, type } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: "API Key missing." });

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Original Vision: Audio uses 2.0, Text uses 1.5
    if (type === 'audio') {
      const audioModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }, { apiVersion: "v1alpha" });
      const result = await audioModel.generateContent({
        contents: [{ parts: [{ text: prompt.slice(0, 10000) }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
        }
      });
      return res.json({ audioData: result.response.candidates[0].content.parts[0].inlineData.data });
    }

    const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const contents = [
      { inlineData: { data: fileData, mimeType: "application/pdf" } },
      { text: prompt }
    ];
    
    const result = await textModel.generateContent(contents);
    res.json({ text: result.response.text() });

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));
