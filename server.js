import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pdf from 'pdf-parse-fork'; // We use this to read the PDF for Groq

dotenv.config();
const app = express();
app.use(express.json({ limit: '100mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'dist')));

// ==========================================
// 1. LOCAL DATABASE (No MongoDB Required)
// ==========================================
const dbPath = path.join(__dirname, 'local_db.json');

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: [] }, null, 2));
  console.log("📁 Local Database created at local_db.json");
}

const readDB = () => JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const writeDB = (data) => fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

// ==========================================
// 2. AUTHENTICATION ROUTES
// ==========================================
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = readDB();
    
    if (db.users.find(u => u.email === email)) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now().toString(), email, password: hashedPassword, history: [], recommendations: [] };
    
    db.users.push(newUser);
    writeDB(db);
    res.json({ message: "User created!" });
  } catch (err) { 
    res.status(500).json({ error: "Signup failed." }); 
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.email === email);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret123');
    res.json({ token, email: user.email, recommendations: user.recommendations });
  } catch (err) {
    res.status(500).json({ error: "Login failed." });
  }
});

// ==========================================
// 3. GROQ AI GENERATION ROUTE
// ==========================================
app.post('/api/ai', async (req, res) => {
  try {
    const { prompt, fileData, userId, filename } = req.body;
    
    // 1. Extract text from the Base64 PDF
    const buffer = Buffer.from(fileData, 'base64');
    const pdfData = await pdf(buffer);
    
    // 2. Shrink the text so it fits safely inside Groq's memory limit
    const truncatedText = pdfData.text.split(/\s+/).slice(0, 3000).join(" ");

    // 3. Build the strict prompt for Groq
    const groqPrompt = `You are an AI study assistant. Use the following document text to answer the prompt.
    DOCUMENT TEXT: ${truncatedText}
    
    USER PROMPT: ${prompt}
    
    CRITICAL RULE: At the very end of your response, you MUST add the exact word NEXT_STEPS followed by 3 related sub-topics to study next, separated by commas.`;

    // 4. Call the Groq API (Using Llama 3)
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-8b-8192", // Lightning fast, free model
        messages: [{ role: "user", content: groqPrompt }],
        temperature: 0.2
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Groq API Error");

    const fullText = data.choices[0].message.content;

    // 5. Separate the output and the recommendations
    const parts = fullText.split('NEXT_STEPS');
    const cleanText = parts[0].trim();
    const recs = parts[1] ? parts[1].replace(/[:\n]/g, '').split(',') : [];
    const cleanRecs = recs.map(r => r.trim()).filter(r => r);

    // 6. Save activity to Local JSON Database
    if (userId) {
      const db = readDB();
      const userIndex = db.users.findIndex(u => u.id === userId);
      if (userIndex !== -1) {
        db.users[userIndex].history.push({
          topic: cleanRecs[0] || "General",
          filename: filename,
          date: new Date().toLocaleDateString()
        });
        db.users[userIndex].recommendations = cleanRecs;
        writeDB(db); 
      }
    }

    res.json({ text: cleanText, recommendations: cleanRecs });

  } catch (error) {
    console.error("🔥 REAL BACKEND ERROR:", error);
    res.status(500).json({ error: "Service busy. Please try again in a moment." });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server live on port ${PORT} with Local DB & Groq AI`));
