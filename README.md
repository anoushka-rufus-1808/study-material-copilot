## 🚀 How to Run Locally

### Prerequisites
- Node.js (v18 or higher).
- Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Installation
1. **Clone this repository:**
   ```bash
   git clone [https://github.com/anoushka-rufus-1808/study-material-copilot.git](https://github.com/anoushka-rufus-1808/study-material-copilot.git)
   cd study-material-copilot
Install dependencies:

Bash
npm install
Configure environment variables:
Create a .env file in the root directory and add your key:

Code snippet
GEMINI_API_KEY=your_api_key_here
Start the development server:

Bash
npm run dev
✨ Key Features
Multilingual AI Podcast Generation: Analyzes context to create engaging study scripts in English and Hindi.

Automated Quiz Engine: Generates customized quizzes with in-depth logical explanations for every answer.

Contextual Study Insights: High-performance dashboard for managing study sessions and note-taking.

Smart Audio Controls: Native browser-level Text-to-Speech integration with play/pause functionality and Markdown-cleaning logic for clear pronunciation.

🛠 Technical Stack & Implementation
Frontend: React 18, TypeScript, and Vite.

UI/UX: Tailwind CSS for responsive design and Lucide Icons for a clean, modern interface.

Backend: Node.js & Express (Deployed on Render).

AI Core: Google Gemini 2.0 Flash (Text Analysis & Scriptwriting).

Audio Synthesis: Client-side Multilingual Speech Synthesis (Web Speech API) targeting native OS language packs for zero-latency, cost-effective playback.

Storage: Persistence via LocalStorage for study history and notes.
