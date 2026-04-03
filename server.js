import express from 'express';
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();
const app = express();
app.use(express.json({ limit: '100mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'dist')));

// ==========================================
// 1. LOCAL JSON DATABASE SETUP (No Cloud Needed)
// ==========================================
const dbPath = path.join(__dirname, 'local_db.json');

// Create the database file if it doesn't exist yet
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: [] }, null, 2));
  console.log("📁 Local Database created at local_db.json");
}

// Helper functions to read/write to the JSON file
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
    const newUser = { 
      id: Date.now().toString(), 
      email, 
      password: hashedPassword, 
      history: [], 
      recommendations: [] 
    };
    
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
    
    // We use the JSON user ID instead of MongoDB _id
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret123');
    res.json({ token, email: user.email, recommendations: user.recommendations });
  } catch (err) {
    res.status(500).json({ error: "Login failed." });
  }
});

// ==========================================
// 3. AI GENERATION & HISTORY ROUTE
// ==========================================
app.post('/api/ai', async (req, res) => {
  try {
    const { prompt, fileData, userId, filename } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Using 2.5-flash as it is the current active model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const contents = [
      { inlineData: { data: fileData, mimeType: "application/pdf" } },
      { text: prompt + ". Also, at the very end of your response, add a section called 'NEXT_STEPS' with 3 related topics to study next, separated by commas." }
    ];

    const result = await model.generateContent(contents);
    const fullText = result.response.text();

    // Extract recommendations
    const parts = fullText.split('NEXT_STEPS');
    const cleanText = parts[0];
    const recs = parts[1] ? parts[1].replace(/[:\n]/g, '').split(',') : [];
    const cleanRecs = recs.map(r => r.trim()).filter(r => r);

    // Save to Local JSON file if user is logged in
    if (userId) {
      const db = readDB();
      const userIndex = db.users.findIndex(u => u.id === userId);
      
      if (userIndex !== -1) {
        db.users[userIndex].history.push({
          topic: cleanRecs[0] || "General",
          filename: filename,
          date: new Date().toISOString()
        });
        db.users[userIndex].recommendations = cleanRecs;
        writeDB(db); // Save changes to the file
      }
    }

    res.json({ text: cleanText, recommendations: cleanRecs });

  } catch (error) {
    console.error("🔥 REAL BACKEND ERROR:", error);
    // Give a friendly message to the frontend, but log the real error above
    res.status(500).json({ error: "API generation failed." });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server live on port ${PORT} with Local JSON Database`));