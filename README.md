# 🚀 EduStream AI: Smart Study Copilot

## How to Run Locally

### Prerequisites
* **Node.js** (v18 or higher).
* **Groq API Key** from [Groq Console](https://console.groq.com/).

### Installation

1. **Clone this repository:**
   ```bash
   git clone [https://github.com/anoushka-rufus-1808/study-material-copilot.git](https://github.com/anoushka-rufus-1808/study-material-copilot.git)
   cd study-material-copilot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory and add your secure keys:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   JWT_SECRET=your_custom_secret_phrase
   ```

4. **Build and Start the server:**
   ```bash
   npm run build
   npm start
   ```

---

## ✨ Key Features
* **Secure User Authentication:** Full login/signup system protecting user data with JWT and bcrypt password hashing.
* **Multilingual AI Podcast Generation:** Analyzes document context to create engaging, conversational study scripts in English and Hindi.
* **Automated Quiz Engine:** Generates customized JSON-structured quizzes with in-depth logical explanations for every answer.
* **Contextual Study Insights & History:** Persistent database tracks learning history and generates personalized "Next Steps" recommendations based on past sessions.
* **Smart Audio Controls:** Native browser-level Text-to-Speech integration with play/pause functionality, speed adjustments, and Markdown-cleaning logic for clear pronunciation.
* **Study Notes Export:** Integrated note-taking system allowing users to jot down thoughts during podcasts and export them instantly to `.txt` files.

---

## 🛠 Technical Stack & Implementation
* **Frontend:** React 18, TypeScript, and Vite.
* **UI/UX:** Tailwind CSS for responsive design and Lucide Icons for a clean, modern interface.
* **Backend:** Node.js & Express (Deployed on Render).
* **Database:** Custom File-System Database (`local_db.json`) for zero-latency, persistent user data storage.
* **AI Core:** Groq API (Llama 3 Model) for lightning-fast text analysis and generation, parsed natively via `pdf-parse-fork`.
* **Audio Synthesis:** Client-side Multilingual Speech Synthesis (Web Speech API) targeting native OS language packs for zero-latency, cost-effective playback.

---

## 📈 Future Prototype Improvements (Phase 2 Roadmap)
* **Cloud Database Migration:** Transition the local `local_db.json` file to a fully managed cloud database (like MongoDB Atlas or PostgreSQL) to support high-volume, concurrent user traffic securely.
* **Intelligent PDF Caching:** Implement a caching layer (like Redis). If a user uploads a previously analyzed PDF, the backend will instantly pull the parsed text from the cache instead of running the expensive parsing operation again, saving compute resources and API quota.
* **Quality Assurance Feedback Loop:** Add a simple "Thumbs Up / Thumbs Down" mechanism on the generated quizzes and podcasts. Gathering this user telemetry is critical for tweaking the AI prompts and ensuring the model doesn't hallucinate.
* **Performance Telemetry in UI:** Display the API turnaround time to the user (e.g., *⚡ Generated in 1.8 seconds*). Surfacing this metric highlights the architectural decision to use high-speed inference models like Groq over slower alternatives.
```
