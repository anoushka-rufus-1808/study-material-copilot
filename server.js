import express from 'express';
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'dist')));

app.post('/api/ai', async (req, res) => {
  try {
    const { prompt, fileData } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    // DIAGNOSTIC: This helps us see if the key is actually reaching the server
    console.log(`API Key detected: ${apiKey ? 'YES (Starts with ' + apiKey.substring(0,4) + ')' : 'NO'}`);

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is missing in Render dashboard." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    /** * FIX: We use the explicit versioned ID 'gemini-1.5-flash-001'.
     * This bypasses the 'gemini-1.5-flash' alias which is currently 404-ing for you.
     */
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

    const contents = [
      {
        inlineData: {
          data: fileData,
          mimeType: "application/pdf"
        }
      },
      { text: prompt }
    ];

    const result = await model.generateContent(contents);
    const responseText = result.response.text();
    
    res.json({ text: responseText });
  } catch (error) {
    console.error("AI Error Details:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server successfully live on port ${PORT}`));
