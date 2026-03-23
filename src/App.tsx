import React, { useState, useRef, useEffect } from 'react';
import { FileText, Mic, BookOpen, Plus, Trash2, Play, Clock, CheckCircle2, XCircle, History, ChevronRight, Loader2, Volume2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('English');
  const [numQuestions, setNumQuestions] = useState(5);
  const [podcastDuration, setPodcastDuration] = useState(3);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [isPodcastLoading, setIsPodcastLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [quizData, setQuizData] = useState<any>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [podcastScript, setPodcastScript] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingNoteTime, setPendingNoteTime] = useState(0);
  const [noteText, setNoteText] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('studyHistory');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  };

  const createPlayableAudioUrl = (base64Data: string) => {
    const byteString = atob(base64Data);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
    const buffer = new ArrayBuffer(44 + byteArray.length);
    const view = new DataView(buffer);
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF'); view.setUint32(4, 36 + byteArray.length, true);
    writeString(8, 'WAVE'); writeString(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeString(36, 'data'); view.setUint32(40, byteArray.length, true);
    new Uint8Array(buffer, 44).set(byteArray);
    return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
  };

  const handleGenerateQuiz = async () => {
    if (!file) return;
    setIsQuizLoading(true);
    setStatus('Analyzing PDF and writing quiz...');
    
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileData: base64, 
          prompt: `Return ONLY a JSON quiz for this PDF in ${language}: {"quiz_title": "string", "questions": [{"question_text": "string", "options": {"A": "string", "B": "string", "C": "string", "D": "string"}, "correct_answer": "A|B|C|D", "explanation": "string"}]}. Generate exactly ${numQuestions} questions.` 
        })
      });

      const data = await res.json();

      // SAFETY CHECK: If the server returned an error, don't try to parse it as a quiz
      if (!res.ok) {
        throw new Error(data.error || "The AI server encountered an issue.");
      }

      if (!data.text) {
        throw new Error("The AI returned an empty response. Please try again.");
      }

      // Try to parse the AI's response text into a JSON object
      try {
        const cleanedText = data.text.replace(/```json|```/g, "").trim();
        const parsedData = JSON.parse(cleanedText);
        setQuizData(parsedData);
        setQuizSubmitted(false);
        setStatus('✅ Quiz Ready');
      } catch (parseError) {
        console.error("Format Error:", data.text);
        throw new Error("AI returned data in a weird format. Click 'Generate Quiz' again.");
      }

    } catch (e: any) {
      console.error(e);
      setStatus(`❌ ${e.message}`);
    } finally {
      setIsQuizLoading(false);
    }
  };

  const handleGeneratePodcast = async () => {
    if (!file) return;
    setIsPodcastLoading(true); setStatus('Generating podcast...');
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: base64, prompt: `Summarize this as a podcast script in ${language}.` })
      });
      const data = await res.json(); setPodcastScript(data.text);
      const audioRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'audio', prompt: data.text })
      });
      const audioData = await audioRes.json();
      setAudioUrl(createPlayableAudioUrl(audioData.audioData)); setStatus('✅ Podcast Ready');
    } catch (e: any) { setStatus(`❌ Error: ${e.message}`); } finally { setIsPodcastLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-2">EduStream AI</h1>
          <p className="text-slate-500">Interactive AI Quizzes & Educational Podcasts</p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-2"><FileText size={16}/> 1. Upload PDF</label>
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded-lg" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-2"><Volume2 size={16}/> 2. Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border p-2 rounded-lg outline-none">
                <option value="English">English</option><option value="Hindi">Hindi</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="space-y-2"><label className="text-sm font-bold">Questions</label><input type="number" value={numQuestions} onChange={(e) => setNumQuestions(parseInt(e.target.value))} className="w-full border p-2 rounded-lg" /></div>
            <div className="space-y-2"><label className="text-sm font-bold">Podcast (Mins)</label><input type="number" value={podcastDuration} onChange={(e) => setNumQuestions(parseInt(e.target.value))} className="w-full border p-2 rounded-lg" /></div>
          </div>
          <div className="flex gap-4">
            <button onClick={handleGenerateQuiz} disabled={isQuizLoading || !file} className="flex-1 bg-blue-600 text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95">
              {isQuizLoading ? <Loader2 className="animate-spin" /> : <BookOpen size={20}/>} Generate Quiz
            </button>
            <button onClick={handleGeneratePodcast} disabled={isPodcastLoading || !file} className="flex-1 bg-emerald-600 text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95">
              {isPodcastLoading ? <Loader2 className="animate-spin" /> : <Mic size={20}/>} Generate Podcast
            </button>
          </div>
          {status && <div className="mt-4 text-center text-blue-600 font-bold">{status}</div>}
        </div>

        {quizData && (
          <div className="bg-white p-8 rounded-2xl border shadow-sm space-y-8 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold">{quizData.quiz_title}</h2>
            {quizData.questions.map((q: any, i: number) => (
              <div key={i} className="space-y-4">
                <p className="font-bold">{i+1}. {q.question_text}</p>
                <div className="grid gap-2">
                  {Object.entries(q.options).map(([k, v]: any) => (
                    <button key={k} className="text-left p-4 border rounded-xl hover:bg-slate-50 transition-all">{k}. {v}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
