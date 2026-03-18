/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Mic, 
  BookOpen, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  Clock, 
  CheckCircle2, 
  XCircle,
  History,
  ChevronRight,
  Loader2,
  Volume2
} from 'lucide-react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
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

// --- Constants ---
const GEMINI_MODEL = "gemini-3-flash-preview";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

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

  // Custom Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingNoteTime, setPendingNoteTime] = useState(0);
  const [noteText, setNoteText] = useState('');

  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('studyHistory');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Load notes for current file
  useEffect(() => {
    if (file) {
      const savedNotes = localStorage.getItem(`notes_${file.name}`);
      if (savedNotes) {
        setNotes(JSON.parse(savedNotes));
      } else {
        setNotes([]);
      }
    }
  }, [file]);

  // --- Helpers ---
  const saveHistory = (item: HistoryItem) => {
    const newHistory = [item, ...history].slice(0, 10);
    setHistory(newHistory);
    try {
      localStorage.setItem('studyHistory', JSON.stringify(newHistory));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        const prunedHistory = newHistory.map((h, idx) => {
          if (idx === 0) return h; 
          if (h.type === 'podcast' && h.data.audioUrl) {
            return { ...h, data: { ...h.data, audioUrl: null } };
          }
          return h;
        });
        try {
          localStorage.setItem('studyHistory', JSON.stringify(prunedHistory));
        } catch (innerE) {
          try {
            localStorage.setItem('studyHistory', JSON.stringify(newHistory.slice(0, 3)));
          } catch (finalE) {
            console.warn('Failed to save history to localStorage:', finalE);
          }
        }
      }
    }
  };

  const saveNotes = (newNotes: StudyNote[]) => {
    if (file) {
      setNotes(newNotes);
      try {
        localStorage.setItem(`notes_${file.name}`, JSON.stringify(newNotes));
      } catch (e) {
        console.warn('Failed to save notes to localStorage:', e);
      }
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
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  // BULLETPROOF AUDIO PARSER
  const createPlayableAudioUrl = (base64Data: string) => {
    const byteString = atob(base64Data);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteArray[i] = byteString.charCodeAt(i);
    }

    // Inspect the actual bytes to see if it's already properly formatted
    const isWav = byteArray[0] === 82 && byteArray[1] === 73 && byteArray[2] === 70 && byteArray[3] === 70; // 'RIFF'
    const isMp3 = (byteArray[0] === 73 && byteArray[1] === 68 && byteArray[2] === 51) || 
                  (byteArray[0] === 255 && (byteArray[1] & 224) === 224); // 'ID3' or MPEG sync

    if (isWav) {
      return URL.createObjectURL(new Blob([byteArray], { type: 'audio/wav' }));
    }
    if (isMp3) {
      return URL.createObjectURL(new Blob([byteArray], { type: 'audio/mpeg' }));
    }

    // If it lacks a standard header, it's raw PCM data. We MUST build a WAV header for it.
    const sampleRate = 24000; 
    const buffer = new ArrayBuffer(44 + byteArray.length);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + byteArray.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // 1 channel
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // 16 bits per sample
    writeString(36, 'data');
    view.setUint32(40, byteArray.length, true);

    const pcmData = new Uint8Array(buffer, 44);
    pcmData.set(byteArray);

    return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
  };

  // --- Actions ---
  const handleGenerateQuiz = async () => {
    if (!file) return;
    setIsQuizLoading(true);
    setStatus('Generating quiz...');
    setStep(1);
    setQuizData(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setPodcastScript(null);
    setAudioUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: "AIzaSyBJYSFKEwzviPu_GuVuQBAmMz1FBPIekqA" });
      const base64 = await fileToBase64(file);
      
      console.log("Starting Quiz Generation...");
      setStatus('🧠 Analyzing PDF and writing questions...');
      setStep(2);
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            inlineData: { data: base64, mimeType: "application/pdf" }
          },
          {
            text: `Create a multiple-choice quiz in ${language} from this PDF. 
            Return ONLY a JSON object with the following schema:
            {
              "quiz_title": "String",
              "questions": [
                {
                  "question_text": "String",
                  "options": {"A": "String", "B": "String", "C": "String", "D": "String"},
                  "correct_answer": "A|B|C|D",
                  "explanation": "String"
                }
              ]
            }
            Generate exactly ${numQuestions} questions.`
          }
        ],
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.text || '{}');
      setQuizData(data);
      saveHistory({
        id: Date.now().toString(),
        filename: file.name,
        type: 'quiz',
        date: new Date().toLocaleString(),
        data: data
      });
      setStatus('✅ Quiz Ready');
    } catch (error) {
      console.error(error);
      setStatus('❌ Error generating quiz');
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
    setQuizData(null);
    setPodcastScript(null);
    setAudioUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: "AIzaSyBJYSFKEwzviPu_GuVuQBAmMz1FBPIekqA" });
      const base64 = await fileToBase64(file);
      
      console.log("Starting Podcast Generation...");
      setStatus('🧠 Analyzing PDF and writing script...');
      setStep(2);
      
      const scriptResponse = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { inlineData: { data: base64, mimeType: "application/pdf" } },
          { text: `You are an expert podcast host. Summarize this PDF into a conversational, engaging script in ${language}. Target length: ${podcastDuration * 120} words. IMPORTANT: Return ONLY the spoken text.` }
        ]
      });

      const script = scriptResponse.text?.trim() || '';
      if (!script) throw new Error("Could not generate a script from the document.");
      
      setPodcastScript(script);

      setStatus('🎙️ Converting script to audio (this may take a moment)...');
      setStep(3);
      
      const safeScript = script.slice(0, 10000); 

      const ttsResponse = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: safeScript }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: language === 'Hindi' ? 'Kore' : 'Zephyr' }
            }
          }
        }
      });

      const inlineData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData && inlineData.data) {
        
        const playableUrl = createPlayableAudioUrl(inlineData.data);
        
        setAudioUrl(playableUrl);
        saveHistory({
          id: Date.now().toString(),
          filename: file.name,
          type: 'podcast',
          date: new Date().toLocaleString(),
          data: { script, audioUrl: playableUrl }
        });
        setStatus('✅ Podcast Ready');
      } else {
        throw new Error("The AI generated the script but failed to convert it to audio.");
      }
    } catch (error: any) {
      console.error("Podcast Generation Error:", error);
      setStatus(`❌ Error: ${error.message || 'Something went wrong'}`);
    } finally {
      setIsPodcastLoading(false);
      setStep(0);
    }
  };

  const handleAddNote = () => {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    audioRef.current.pause(); // Pause the podcast while typing the note!
    setPendingNoteTime(time);
    setNoteText('');
    setIsModalOpen(true);
  };

  const confirmAddNote = () => {
    if (noteText.trim()) {
      const newNote: StudyNote = {
        id: Date.now().toString(),
        timestamp: pendingNoteTime,
        text: noteText.trim()
      };
      saveNotes([...notes, newNote].sort((a, b) => a.timestamp - b.timestamp));
    }
    setIsModalOpen(false);
  };

  const handleDeleteNote = (id: string) => {
    saveNotes(notes.filter(n => n.id !== id));
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      // UX Upgrade: Rewind 5 seconds for context, ensuring it never drops below 0:00
      const contextualTime = Math.max(0, time - 5); 
      audioRef.current.currentTime = contextualTime;
      audioRef.current.play();
    }
  };

  const handleHistoryClick = (item: HistoryItem) => {
    if (item.type === 'quiz') {
      setQuizData(item.data);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setPodcastScript(null);
      setAudioUrl(null);
    } else {
      setPodcastScript(item.data.script);
      setAudioUrl(item.data.audioUrl);
      setQuizData(null);
    }
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">Study Material Copilot</h1>
          <p className="text-slate-500">Interactive AI Quizzes & Educational Podcasts</p>
        </header>

        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4" /> 1. Upload Document (PDF)
              </label>
              <input 
                type="file" 
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Volume2 className="w-4 h-4" /> 2. Select Language
              </label>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
                type="number" 
                min="1" max="20" 
                value={isNaN(numQuestions) ? '' : numQuestions}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setNumQuestions(isNaN(val) ? NaN : val);
                }}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Podcast (Mins)</label>
              <input 
                type="number" 
                min="2" max="10" 
                value={isNaN(podcastDuration) ? '' : podcastDuration}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setPodcastDuration(isNaN(val) ? NaN : val);
                }}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <button 
              onClick={handleGenerateQuiz}
              disabled={isQuizLoading || isPodcastLoading || !file}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isQuizLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <BookOpen className="w-5 h-5" />}
              Generate Quiz
            </button>
            <button 
              onClick={handleGeneratePodcast}
              disabled={isQuizLoading || isPodcastLoading || !file}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isPodcastLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
              Generate Podcast
            </button>
          </div>

          {/* Status & Progress */}
          {(status || isQuizLoading || isPodcastLoading) && (
            <div className="mt-6 space-y-4">
              <div className="text-center font-medium text-blue-600">{status}</div>
              {(isQuizLoading || isPodcastLoading) && (
                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <div className={cn("flex items-center gap-3 text-sm transition-colors", step >= 1 ? "text-emerald-600 font-semibold" : "text-slate-400")}>
                    <div className={cn("w-3 h-3 rounded-full", step === 1 ? "bg-blue-500 animate-pulse" : step > 1 ? "bg-emerald-500" : "bg-slate-300")} />
                    📄 Reading PDF...
                  </div>
                  <div className={cn("flex items-center gap-3 text-sm transition-colors", step >= 2 ? "text-emerald-600 font-semibold" : "text-slate-400")}>
                    <div className={cn("w-3 h-3 rounded-full", step === 2 ? "bg-blue-500 animate-pulse" : step > 2 ? "bg-emerald-500" : "bg-slate-300")} />
                    🧠 AI Processing...
                  </div>
                  <div className={cn("flex items-center gap-3 text-sm transition-colors", step >= 3 ? "text-emerald-600 font-semibold" : "text-slate-400")}>
                    <div className={cn("w-3 h-3 rounded-full", step === 3 ? "bg-blue-500 animate-pulse" : step > 3 ? "bg-emerald-500" : "bg-slate-300")} />
                    🎙️ Generating Media...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History / Dashboard */}
          {history.length > 0 && (
            <div className="mt-8 pt-8 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <History className="w-4 h-4" /> Study Dashboard
              </h3>
              <div className="space-y-2">
                {history.map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => handleHistoryClick(item)}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{item.type === 'quiz' ? '📝' : '🎙️'}</span>
                      <div className="text-left">
                        <div className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{item.filename}</div>
                        <div className="text-xs text-slate-400">{item.date}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quiz Output */}
        {quizData && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800">{quizData.quiz_title}</h2>
              {!quizSubmitted && (
                <button 
                  onClick={() => setQuizSubmitted(true)}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-lg font-semibold transition-all"
                >
                  Submit Quiz
                </button>
              )}
            </div>

            {quizData.questions.map((q, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <p className="font-semibold text-slate-800">{i + 1}. {q.question_text}</p>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(q.options).map(([key, val]) => {
                    const isSelected = quizAnswers[i] === key;
                    const isCorrect = q.correct_answer === key;
                    const showResult = quizSubmitted;
                    
                    return (
                      <label 
                        key={key}
                        className={cn(
                          "flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all",
                          !showResult && isSelected ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:bg-slate-50",
                          showResult && isCorrect ? "border-emerald-500 bg-emerald-50" : "",
                          showResult && isSelected && !isCorrect ? "border-red-500 bg-red-50" : ""
                        )}
                      >
                        <input 
                          type="radio" 
                          name={`q${i}`} 
                          value={key}
                          disabled={quizSubmitted}
                          onChange={() => setQuizAnswers(prev => ({ ...prev, [i]: key }))}
                          className="hidden"
                        />
                        <span className={cn(
                          "w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold",
                          isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300 text-slate-400"
                        )}>
                          {key}
                        </span>
                        <span className="text-slate-700">{val}</span>
                        {showResult && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto" />}
                        {showResult && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-500 ml-auto" />}
                      </label>
                    );
                  })}
                </div>
                {quizSubmitted && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl border-l-4 border-slate-300 text-sm text-slate-600">
                    <strong className="text-slate-800 block mb-1">Explanation:</strong>
                    {q.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Podcast Output */}
        {podcastScript && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Mic className="w-5 h-5 text-emerald-500" /> AI Podcast Summary
              </h2>
              
              {audioUrl ? (
                <div className="mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <audio 
                    ref={audioRef}
                    src={audioUrl} 
                    controls 
                    className="w-full"
                  />
                </div>
              ) : isPodcastLoading ? (
                <div className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-200 text-blue-700 text-sm flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating audio player (this may take a minute)...
                </div>
              ) : (
                <div className="mb-8 p-6 bg-amber-50 rounded-2xl border border-amber-200 text-amber-700 text-sm flex items-center gap-3">
                  <Volume2 className="w-5 h-5" />
                  Audio data was pruned to save storage. Please re-generate the podcast to hear it again.
                </div>
              )}

              {/* Timestamped Notes Section */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" /> Study Insights
                  </h3>
                  <button 
                    onClick={handleAddNote}
                    className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Note
                  </button>
                </div>

                <div className="space-y-2" id="notesList">
                  {notes.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">
                      No notes yet. Add one while listening!
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:shadow-sm transition-all group">
                        <button 
                          onClick={() => handleSeek(note.timestamp)}
                          className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-md hover:bg-blue-200 transition-colors flex items-center gap-1"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          {formatTime(note.timestamp)}
                        </button>
                        <span className="flex-1 text-sm text-slate-700">{note.text}</span>
                        <button 
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Podcast Script</h4>
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap text-sm md:text-base">
                  {podcastScript}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* NEW: Custom Note Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <h3 className="text-xl font-bold text-slate-800 mb-1">Add Study Note</h3>
                <p className="text-sm text-slate-500 mb-5">
                  Capturing note at {formatTime(pendingNoteTime)}
                </p>
                <input
                  type="text"
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddNote()}
                  placeholder="e.g., The school has 28 teachers..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all mb-6"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmAddNote}
                    className="px-5 py-2.5 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}