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

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const TEXT_ENGINE = "gemini-1.5-flash-latest";
const AUDIO_ENGINE = "gemini-1.5-flash-latest";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('English');
  const [numQuestions, setNumQuestions] = useState(5);
  const [podcastDuration, setPodcastDuration] = useState(3);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [isPodcastLoading, setIsPodcastLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [step, setStep] = useState(0); 

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

  useEffect(() => {
    if (file) {
      const savedNotes = localStorage.getItem(`notes_${file.name}`);
      setNotes(savedNotes ? JSON.parse(savedNotes) : []);
    }
  }, [file]);

  const saveHistory = (item: any) => {
    const newHistory = [item, ...history].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('studyHistory', JSON.stringify(newHistory));
  };

  const saveNotes = (newNotes: any[]) => {
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
      reader.onerror = reject;
    });
  };

  // WAV Header injection for raw PCM data compatibility
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

  const handleGenerateQuiz = async () => {
    if (!file) return;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setStatus("❌ Error: API Key missing from build environment.");
      return;
    }

    setIsQuizLoading(true);
    setStatus('Generating quiz...');
    try {
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: TEXT_ENGINE });
      const base64 = await fileToBase64(file);
      const result = await model.generateContent({
        contents: [
          { inlineData: { data: base64, mimeType: "application/pdf" } },
          { text: `Return a JSON quiz in ${language}: {"quiz_title": "string", "questions": [{"question_text": "string", "options": {"A": "string", "B": "string", "C": "string", "D": "string"}, "correct_answer": "A|B|C|D", "explanation": "string"}]}. Generate ${numQuestions} questions.` }
        ],
        generationConfig: { responseMimeType: "application/json" }
      });
      setQuizData(JSON.parse(result.response.text()));
      setQuizSubmitted(false);
      saveHistory({ id: Date.now().toString(), filename: file.name, type: 'quiz', date: new Date().toLocaleString(), data: JSON.parse(result.response.text()) });
      setStatus('✅ Quiz Ready');
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message}`);
    } finally {
      setIsQuizLoading(false);
    }
  };

  const handleGeneratePodcast = async () => {
    if (!file) return;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return;
    setIsPodcastLoading(true);
    setStatus('Generating podcast...');
    try {
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: TEXT_ENGINE });
      const base64 = await fileToBase64(file);
      const scriptRes = await model.generateContent([{ inlineData: { data: base64, mimeType: "application/pdf" } }, { text: `Summarize as a podcast script in ${language}.` }]);
      const script = scriptRes.response.text().trim();
      setPodcastScript(script);
      const ttsModel = genAI.getGenerativeModel({ model: AUDIO_ENGINE });
      const ttsRes = await ttsModel.generateContent({
        contents: [{ parts: [{ text: script.slice(0, 10000) }] }],
        generationConfig: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: language === 'Hindi' ? 'Kore' : 'Zephyr' } } } }
      });
      const audioData = ttsRes.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        const url = createPlayableAudioUrl(audioData);
        setAudioUrl(url);
        saveHistory({ id: Date.now().toString(), filename: file.name, type: 'podcast', date: new Date().toLocaleString(), data: { script, audioUrl: url } });
      }
      setStatus('✅ Podcast Ready');
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message}`);
    } finally {
      setIsPodcastLoading(false);
    }
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
          <h1 className="text-4xl font-bold text-slate-900 mb-2">EduStream AI</h1>
          <p className="text-slate-500 text-sm">Interactive AI Quizzes & Educational Podcasts</p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-2"><FileText size={16}/> 1. Upload PDF</label>
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded-lg" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-2"><Volume2 size={16}/> 2. Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border p-2 rounded-lg">
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="space-y-2">
              <label className="text-sm font-bold">Questions</label>
              <input type="number" value={numQuestions} onChange={(e) => setNumQuestions(parseInt(e.target.value))} className="w-full border p-2 rounded-lg" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold">Podcast (Mins)</label>
              <input type="number" value={podcastDuration} onChange={(e) => setPodcastDuration(parseInt(e.target.value))} className="w-full border p-2 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={handleGenerateQuiz} disabled={isQuizLoading || !file} className="flex-1 bg-blue-600 text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:bg-slate-300 transition-all">
              {isQuizLoading ? <Loader2 className="animate-spin" /> : <BookOpen size={20}/>} Generate Quiz
            </button>
            <button onClick={handleGeneratePodcast} disabled={isPodcastLoading || !file} className="flex-1 bg-emerald-600 text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:bg-slate-300 transition-all">
              {isPodcastLoading ? <Loader2 className="animate-spin" /> : <Mic size={20}/>} Generate Podcast
            </button>
          </div>
          {status && <div className="mt-4 text-center text-blue-600 font-bold">{status}</div>}
        </div>

        {/* Study Dashboard */}
        {history.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><History size={14}/> Dashboard</h3>
            <div className="space-y-2">
              {history.map((item) => (
                <button key={item.id} onClick={() => { if (item.type === 'quiz') setQuizData(item.data); else { setPodcastScript(item.data.script); setAudioUrl(item.data.audioUrl); }}} className="w-full flex items-center justify-between p-3 bg-white border rounded-lg hover:border-blue-500 transition-all">
                  <div className="flex items-center gap-3">
                    <span>{item.type === 'quiz' ? '📝' : '🎙️'}</span>
                    <div className="text-left"><div className="text-sm font-bold">{item.filename}</div><div className="text-[10px] text-slate-400">{item.date}</div></div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {quizData && (
          <div className="bg-white p-8 rounded-2xl border shadow-sm space-y-8 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-slate-800">{quizData.quiz_title}</h2>
            {quizData.questions.map((q: any, i: number) => (
              <div key={i} className="space-y-4">
                <p className="font-bold">{i+1}. {q.question_text}</p>
                <div className="grid gap-2">
                  {Object.entries(q.options).map(([k, v]: any) => (
                    <button key={k} className="w-full text-left p-4 border rounded-xl hover:bg-slate-50 transition-all">{k}. {v}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {podcastScript && (
          <div className="bg-white p-8 rounded-2xl border shadow-sm space-y-6 animate-in fade-in duration-500">
            <h2 className="text-xl font-bold flex items-center gap-2"><Mic className="text-emerald-500" /> AI Podcast Summary</h2>
            {audioUrl && <audio ref={audioRef} src={audioUrl} controls className="w-full" />}
            
            <div className="space-y-4">
               <div className="flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Clock size={18} className="text-blue-500" /> Study Insights</h3><button onClick={() => { setPendingNoteTime(audioRef.current?.currentTime || 0); setIsModalOpen(true); }} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Add Note</button></div>
               <div className="space-y-2">
                  {notes.map(note => (
                    <div key={note.id} className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl">
                      <button onClick={() => handleSeek(note.timestamp)} className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-md">{formatTime(note.timestamp)}</button>
                      <span className="flex-1 text-xs text-slate-600">{note.text}</span>
                      <button onClick={() => saveNotes(notes.filter(n => n.id !== note.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                    </div>
                  ))}
               </div>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl text-sm leading-relaxed text-slate-600 italic whitespace-pre-wrap border border-slate-100">"{podcastScript}"</div>
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-lg font-bold mb-1">Add Study Note</h3>
              <p className="text-xs text-slate-400 mb-4">Capturing insight at {formatTime(pendingNoteTime)}</p>
              <input autoFocus value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && (saveNotes([...notes, { id: Date.now().toString(), timestamp: pendingNoteTime, text: noteText }]), setIsModalOpen(false))} placeholder="Key takeaway..." className="w-full border p-3 rounded-xl mb-6 outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex justify-end gap-3"><button onClick={() => setIsModalOpen(false)} className="text-sm font-bold text-slate-400">Cancel</button><button onClick={() => { saveNotes([...notes, { id: Date.now().toString(), timestamp: pendingNoteTime, text: noteText }]); setIsModalOpen(false); }} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 transition-all">Save</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
