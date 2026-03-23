## How to Run Locally

### Prerequisites
- Node.js (v18 or higher).
- Google Gemini API Key.

### Installation
1. Clone this repository:
   ```bash
   git clone [https://github.com/anoushka-rufus-1808/study-material-copilot.git](https://github.com/anoushka-rufus-1808/study-material-copilot.git)
   cd ai-study-copilot
2. Install dependencies:
   ```bash
   npm install
3. Configure environment variable:
   Create a new file named .env in the root directory and add your key:
   ```bash
   VITE_GEMINI_API_KEY=your_api_key_here
4. Start the development server:
   ```bash
   npm run dev
   
## Key Features
- **AI-Powered Podcast Generation** with an analysis of the context to create an engaging podcast.
- **Automated Quiz Engine** with customized quizzes and in-depth logical explanations.
- **Contextual Study Insights** with high-performance timestamped note-taking.
- **Smart Seek** with 5-second contextual rewind logic to ensure no information is left behind.

---

## Technical Stack & Implementation
- **Frontend** with React 18 and TypeScript.
- **UI/UX** with Tailwind CSS and Lucide Icons.
- **AI** with Google Gemini Pro (Text Analysis) and Gemini TTS (Audio Synthesis).
- **Audio** with a custom 44-byte WAV header injection system.
- **Storage** with LocalStorage persistence.
