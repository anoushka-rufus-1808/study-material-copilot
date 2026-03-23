import express from 'express';
import { GoogleGenAI } from "@google/genai";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
// Allow large payloads for PDFs
app.use(express.json({ limit: '50mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'dist')));

app.post('/api/ai', async (req, res) => {
  try {
    const { prompt, fileData } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Server Configuration Error: API Key missing in Render dashboard." });
    }

    const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Prepare contents for PDF + Text
    const contents = [
      {
        inlineData: {
          data: fileData, // This is the base64 string from the frontend
          mimeType: "application/pdf"
        }
      },
      { text: prompt }
    ];

    const result = await model.generateContent(contents);
    const responseText = result.response.text();
    
    // Send back a clean JSON object
    res.json({ text: responseText });
  } catch (error) {
    console.error("AI Server Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all route for React routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
