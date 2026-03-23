/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Mic, BookOpen, Plus, Trash2, Play, Pause, 
  Clock, CheckCircle2, XCircle, History, ChevronRight, Loader2, Volume2
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface QuizQuestion {
  question_text: string;
  options: { [key: string]: string };
  correct_answer: string;
  explanation: string;
}

interface QuizData {
  quiz_title: string;
  questions: QuizQuestion[];
}

interface StudyNote {
  id: string;
  timestamp: number;
  text: string;
}

interface HistoryItem {
  id: string;
  filename: string;
  type: 'quiz' | 'podcast';
  date: string;
  data: any;
}

// --- Constants (LATEST STABLE MODELS) ---
const TEXT_ENGINE = "gemini-1.5-flash-latest";
const AUDIO_ENGINE = "gemini-1.5-flash-latest";

export default function App() {
  // --- State ---
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('English');
  const [numQuestions, setNumQuestions] = useState(5);
  const [podcastDuration, setPodcastDuration] = useState(3);
  
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [isPodcastLoading, setIsPodcastLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [step, setStep] = useState(0); 

  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const [podcastScript, setPodcastScript] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingNoteTime, setPendingNoteTime] = useState(0);
  const [noteText, setNoteText] = useState('');

  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('studyHistory');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  useEffect(() => {
    if (file) {
      const savedNotes = localStorage.getItem(`notes_${file.name}`);
      setNotes(savedNotes ? JSON.parse(savedNotes) : []);
    }
  }, [file]);

  // --- Helpers ---
  const saveHistory = (item: HistoryItem) => {
    const newHistory = [item, ...history].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('studyHistory', JSON.stringify(newHistory));
  };

  const saveNotes = (newNotes: StudyNote[]) => {
    if (file) {
      setNotes(newNotes);
      localStorage.setItem(`notes_${file.name}`, JSON.stringify(newNotes));
    }
  };

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
      reader.onerror = error => reject(error);
    });
  };

  const createPlayableAudioUrl = (base64Data: string) => {
    const byteString = atob(base64Data);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
    const sampleRate = 24000; 
    const buffer = new ArrayBuffer(44 + byteArray.length);
    const view = new DataView(buffer);
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + byteArray.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); 
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true); 
    writeString(36, 'data');
    view.setUint32(40, byteArray.length, true);
    new Uint8Array(buffer, 44).set(byteArray);
    return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
  };

  // --- Actions ---
  const handleGenerateQuiz = async () => {
    if (!file) return;
    setIsQuizLoading(true);
    setStatus('Generating quiz...');
    setStep(1);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      // DIAGNOSTIC CHECK:
      if (!apiKey || apiKey === "") {
        throw new Error("VITE_GEMINI_API_KEY is missing or empty on Render. Please check your Environment Variables tab and redeploy.");
      }

      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: TEXT_ENGINE });
      const base64 = await fileToBase64(file);
      
      setStep(2);
      const result = await model.generateContent({
        contents: [
          { inlineData: { data: base64, mimeType: "application/pdf" } },
          { text: `Return ONLY a JSON quiz for this PDF in ${language}: {"quiz_title": "string", "questions": [{"question_text": "string", "options": {"A": "string", "B": "string", "C": "string", "D": "string"}, "correct_answer": "A|B|C|D", "explanation": "string"}]}. Generate exactly ${numQuestions} questions.` }
        ],
        generationConfig: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(result.response.text());
      setQuizData(data);
      saveHistory({ id: Date.now().toString(), filename: file.name, type: 'quiz', date: new Date().toLocaleString(), data });
      setStatus('✅ Quiz Ready');
    } catch (error: any) {
      console.error(error);
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setIsQuizLoading(false);
      setStep(0);
    }
  };

  const handleGeneratePodcast = async () => {
    if (!file) return;
    setIsPodcastLoading(true);
    setStatus('Reading document...');
    setStep(1);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is missing. Check Render environment.");

      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: TEXT_ENGINE });
      const base64 = await fileToBase64(file);
      
      setStep(2);
      const scriptResult = await model.generateContent([
        { inlineData: { data: base64, mimeType: "application/pdf" } },
        { text: `Summarize this PDF as a conversational script in ${language}. Target: ${podcastDuration * 120} words. ONLY return spoken text.` }
      ]);
      const script = scriptResult.response.text().trim();
      setPodcastScript(script);

      setStep(3);
      const ttsModel = genAI.getGenerativeModel({ model: AUDIO_ENGINE });
      const ttsResult = await ttsModel.generateContent({
        contents: [{ parts: [{ text: script.slice(0, 10000) }] }],
        generationConfig: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: language === 'Hindi' ? 'Kore' : 'Zephyr' } } }
        }
      });

      const audioData = ttsResult.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        const url = createPlayableAudioUrl(audioData);
        setAudioUrl(url);
        saveHistory({ id: Date.now().toString(), filename: file.name, type: 'podcast', date: new Date().toLocaleString(), data: { script, audioUrl: url } });
        setStatus('✅ Podcast Ready');
      }
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setIsPodcastLoading(false);
      setStep(0);
    }
  };

  const handleAddNote = () => {
    if (!audioRef.current) return;
    setPendingNoteTime(audioRef.current.currentTime);
    audioRef.current.pause();
    setNoteText('');
    setIsModalOpen(true);
  };

  const confirmAddNote = () => {
    if (noteText.trim()) {
      const newNote: StudyNote = { id: Date.now().toString(), timestamp: pendingNoteTime, text: noteText.trim() };
      saveNotes([...notes, newNote].sort((a, b) => a.timestamp - b.timestamp));
    }
    setIsModalOpen(false);
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, time - 5);
      audioRef.current.play();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">EduStream AI</h1>
          <p className="text-slate-500">Interactive AI Quizzes & Educational Podcasts</p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4" /> 1. Upload Document (PDF)
              </label>
              <input 
                type="file" accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Volume2 className="w-4 h-4" /> 2. Language
              </label>
              <select 
                value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Questions</label>
              <input 
                type="number" min="1" max="20" 
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value) || 5)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Podcast (Mins)</label>
              <input 
                type="number" min="2" max="10" 
                value={podcastDuration}
                onChange={(e) => setPodcastDuration(parseInt(e.target.value) || 3)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <button 
              onClick={handleGenerateQuiz} disabled={isQuizLoading || isPodcastLoading || !file}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all disabled:bg-slate-300"
            >
              {isQuizLoading ? <Loader2 className="animate-spin" /> : <BookOpen className="w-5 h-5" />} Generate Quiz
            </button>
            <button 
              onClick={handleGeneratePodcast} disabled={isQuizLoading || isPodcastLoading || !file}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all disabled:bg-slate-300"
            >
              {isPodcastLoading ? <Loader2 className="animate-spin" /> : <Mic className="w-5 h-5" />} Generate Podcast
            </button>
          </div>
          {status && <div className="mt-4 text-center font-medium text-blue-600">{status}</div>}
        </div>

        {/* Dashboard */}
        {history.length > 0 && (
          <div className="mb-8">
             <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <History className="w-4 h-4" /> Study Dashboard
              </h3>
              <div className="space-y-2">
                {history.map((item) => (
                  <button 
                    key={item.id} onClick={() => {
                      if (item.type === 'quiz') { setQuizData(item.data); setPodcastScript(null); }
                      else { setPodcastScript(item.data.script); setAudioUrl(item.data.audioUrl); setQuizData(null); }
                    }}
                    className="w-full flex items-center justify-between p-3 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span>{item.type === 'quiz' ? '📝' : '🎙️'}</span>
                      <div className="text-left"><div className="text-sm font-semibold">{item.filename}</div><div className="text-xs text-slate-400">{item.date}</div></div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                ))}
              </div>
          </div>
        )}

        {/* Quiz & Podcast Results */}
        {quizData && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold p-6 bg-white rounded-2xl border border-slate-200">{quizData.quiz_title}</h2>
            {quizData.questions.map((q, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
                <p className="font-semibold">{i + 1}. {q.question_text}</p>
                <div className="grid gap-2">
                  {Object.entries(q.options).map(([key, val]) => (
                    <button 
                      key={key} disabled={quizSubmitted}
                      onClick={() => setQuizAnswers({...quizAnswers, [i]: key})}
                      className={cn(
                        "text-left p-4 border rounded-xl transition-all",
                        quizAnswers[i] === key ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:bg-slate-50",
                        quizSubmitted && q.correct_answer === key ? "border-emerald-500 bg-emerald-50" : "",
                        quizSubmitted && quizAnswers[i] === key && q.correct_answer !== key ? "border-red-500 bg-red-50" : ""
                      )}
                    >
                      {key}. {val}
                    </button>
                  ))}
                </div>
                {quizSubmitted && <div className="p-4 bg-slate-50 rounded-xl text-sm italic">Explanation: {q.explanation}</div>}
              </div>
            ))}
            {!quizSubmitted && <button onClick={() => setQuizSubmitted(true)} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl">Submit Quiz</button>}
          </div>
        )}

        {podcastScript && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Mic className="text-emerald-500" /> AI Podcast Summary</h2>
              {audioUrl && <audio ref={audioRef} src={audioUrl} controls className="w-full mb-8" />}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold flex items-center gap-2"><Clock className="text-blue-500" /> Study Insights</h3>
                  <button onClick={handleAddNote} className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">Add Note</button>
                </div>
                <div className="space-y-2">
                  {notes.map(note => (
                    <div key={note.id} className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl">
                      <button onClick={() => handleSeek(note.timestamp)} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-md">{formatTime(note.timestamp)}</button>
                      <span className="flex-1 text-sm">{note.text}</span>
                      <button onClick={() => saveNotes(notes.filter(n => n.id !== note.id))} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-sm leading-relaxed whitespace-pre-wrap">{podcastScript}</div>
            </div>
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-xl font-bold mb-2">Add Study Note</h3>
              <p className="text-sm text-slate-500 mb-4">Time: {formatTime(pendingNoteTime)}</p>
              <input 
                autoFocus value={noteText} onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmAddNote()}
                placeholder="Important point about..."
                className="w-full px-4 py-3 border rounded-xl mb-6 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 font-semibold">Cancel</button>
                <button onClick={confirmAddNote} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
