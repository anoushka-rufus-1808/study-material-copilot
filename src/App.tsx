import React, { useState, useEffect, useRef } from 'react';
import { FileText, Mic, BookOpen, Trash2, Clock, History, ChevronRight, Loader2, Volume2 } from 'lucide-react';
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
  const [isPlaying, setIsPlaying] = useState(false); 
  const [notes, setNotes] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('studyHistory');
    if (saved) setHistory(JSON.parse(saved));
    return () => { window.speechSynthesis.cancel(); };
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  };

  // --- UPDATED AUDIO CONTROLS (Pause/Play & Clean Text) ---
  const toggleAudio = () => {
    if (window.speechSynthesis.speaking) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPlaying(true);
      } else {
        window.speechSynthesis.pause();
        setIsPlaying(false);
      }
    } else {
      if (!podcastScript) return;
      // Strip markdown asterisks and hashtags so the bot doesn't read them
      const cleanScript = podcastScript.replace(/[*#_]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanScript);
      utterance.rate = 0.95; 
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!file) return;
    setIsQuizLoading(true); setStatus('Analyzing PDF & Writing Quiz...');
    setQuizData(null); setPodcastScript(null); 
    window.speechSynthesis.cancel(); setIsPlaying(false);
    
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileData: base64, 
          prompt: `Return ONLY a JSON quiz in ${language}: {"quiz_title": "string", "questions": [{"question_text": "string", "options": {"A": "string", "B": "string", "C": "string", "D": "string"}, "correct_answer": "A|B|C|D", "explanation": "string"}]}. Generate exactly ${numQuestions} questions.` 
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server issue.");

      const cleanedText = data.text.replace(/```json|```/g, "").trim();
      const parsedData = JSON.parse(cleanedText);
      
      setQuizData(parsedData); setQuizAnswers({}); setQuizSubmitted(false); 
      saveHistory({ id: Date.now().toString(), filename: file.name, type: 'quiz', date: new Date().toLocaleString(), data: parsedData });
      setStatus('✅ Quiz Ready');
    } catch (e: any) { setStatus(`❌ Error: ${e.message}`); } finally { setIsQuizLoading(false); }
  };

  const handleGeneratePodcast = async () => {
    if (!file) return;
    setIsPodcastLoading(true); setStatus('Generating podcast script...');
    setQuizData(null); setPodcastScript(null);
    window.speechSynthesis.cancel(); setIsPlaying(false);

    try {
      const base64 = await fileToBase64(file);
      const scriptRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: base64, prompt: `Summarize this as an engaging podcast script in ${language}. Target length: ${podcastDuration * 120} words.` })
      });
      
      const scriptData = await scriptRes.json();
      if (!scriptRes.ok) throw new Error(scriptData.error || "Failed to generate script");

      setPodcastScript(scriptData.text);
      saveHistory({ id: Date.now().toString(), filename: file.name, type: 'podcast', date: new Date().toLocaleString(), data: { script: scriptData.text } });
      setStatus('✅ Podcast Ready! Click Play to listen.');
      
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
            <div className="space-y-2"><label className="text-sm font-bold flex items-center gap-2"><FileText size={16}/> 1. Upload PDF</label><input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded-lg" /></div>
            <div className="space-y-2"><label className="text-sm font-bold flex items-center gap-2"><Volume2 size={16}/> 2. Language</label><select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border p-2 rounded-lg outline-none"><option value="English">English</option><option value="Hindi">Hindi</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="space-y-2"><label className="text-sm font-bold">Questions</label><input type="number" value={numQuestions} onChange={(e) => setNumQuestions(parseInt(e.target.value))} className="w-full border p-2 rounded-lg" /></div>
            <div className="space-y-2"><label className="text-sm font-bold">Podcast (Mins)</label><input type="number" value={podcastDuration} onChange={(e) => setPodcastDuration(parseInt(e.target.value))} className="w-full border p-2 rounded-lg" /></div>
          </div>
          <div className="flex gap-4">
            <button onClick={handleGenerateQuiz} disabled={isQuizLoading || isPodcastLoading || !file} className="flex-1 bg-blue-600 text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50">{isQuizLoading ? <Loader2 className="animate-spin" /> : <BookOpen size={20}/>} Generate Quiz</button>
            <button onClick={handleGeneratePodcast} disabled={isQuizLoading || isPodcastLoading || !file} className="flex-1 bg-emerald-600 text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50">{isPodcastLoading ? <Loader2 className="animate-spin" /> : <Mic size={20}/>} Generate Podcast</button>
          </div>
          {status && <div className="mt-4 text-center text-blue-600 font-bold">{status}</div>}
        </div>

        {/* Dashboard */}
        {history.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><History size={14}/> Dashboard</h3>
            <div className="space-y-2">
              {history.map((item) => (
                <button key={item.id} onClick={() => { if (item.type === 'quiz') { setQuizData(item.data); setPodcastScript(null); setQuizSubmitted(true); } else { setPodcastScript(item.data.script); setQuizData(null); }}} className="w-full flex items-center justify-between p-3 bg-white border rounded-lg hover:border-blue-500 transition-all">
                  <div className="flex items-center gap-3"><span>{item.type === 'quiz' ? '📝' : '🎙️'}</span><div className="text-left"><div className="text-sm font-bold text-slate-700">{item.filename}</div><div className="text-[10px] text-slate-400">{item.date}</div></div></div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* QUIZ SECTION */}
        {quizData && (
          <div className="bg-white p-8 rounded-2xl border shadow-sm space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center border-b pb-4"><h2 className="text-2xl font-bold text-slate-800">{quizData.quiz_title}</h2>{quizSubmitted && <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-bold">Score: {Object.keys(quizAnswers).filter(i => quizAnswers[parseInt(i)] === quizData.questions[parseInt(i)].correct_answer).length} / {quizData.questions.length}</div>}</div>
            {quizData.questions.map((q: any, i: number) => (
              <div key={i} className="space-y-4">
                <p className="font-bold text-slate-800">{i+1}. {q.question_text}</p>
                <div className="grid gap-2">
                  {Object.entries(q.options).map(([k, v]: any) => {
                    const isSelected = quizAnswers[i] === k;
                    const isCorrect = q.correct_answer === k;
                    return (
                      <button key={k} disabled={quizSubmitted} onClick={() => setQuizAnswers({...quizAnswers, [i]: k})} className={cn("w-full text-left p-4 border rounded-xl transition-all font-medium", !quizSubmitted && isSelected ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 hover:bg-slate-50", quizSubmitted && isCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "", quizSubmitted && isSelected && !isCorrect ? "border-red-500 bg-red-50 text-red-800" : "")}><span className="font-bold mr-2">{k}.</span> {v}</button>
                    )
                  })}
                </div>
                {quizSubmitted && <div className="p-4 bg-slate-50 rounded-xl text-sm text-slate-600 border border-slate-100"><strong className="text-slate-800 block mb-1">Explanation:</strong>{q.explanation}</div>}
              </div>
            ))}
            {!quizSubmitted && <button onClick={() => setQuizSubmitted(true)} className="w-full py-4 mt-6 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 transition-all active:scale-95">Submit Quiz</button>}
          </div>
        )}

        {/* PODCAST SECTION */}
        {podcastScript && (
          <div className="bg-white p-8 rounded-2xl border shadow-sm space-y-6 animate-in fade-in duration-500">
            <h2 className="text-xl font-bold flex items-center gap-2"><Mic className="text-emerald-500" /> AI Podcast Summary</h2>
            
            <div className="bg-slate-100 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between border border-slate-200 gap-4">
              <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Volume2 size={18} className="text-blue-500" /> Web Speech AI
              </div>
              <button onClick={toggleAudio} className={cn("px-8 py-3 rounded-xl font-bold text-white transition-all w-full sm:w-auto", isPlaying ? "bg-amber-500 hover:bg-amber-600 shadow-inner" : "bg-emerald-500 hover:bg-emerald-600 shadow-md")}>
                {isPlaying ? "⏸ Pause Audio" : "▶️ Play Audio"}
              </button>
            </div>
            
            <div className="space-y-4">
               <div className="flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Clock size={18} className="text-blue-500" /> Study Notes</h3><button onClick={() => { setIsModalOpen(true); }} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Add Note</button></div>
               <div className="space-y-2">
                  {notes.map(note => (
                    <div key={note.id} className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl">
                      <span className="flex-1 text-xs text-slate-600">{note.text}</span>
                      <button onClick={() => saveNotes(notes.filter(n => n.id !== note.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                    </div>
                  ))}
               </div>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl text-sm leading-relaxed text-slate-600 whitespace-pre-wrap border border-slate-100">{podcastScript}</div>
          </div>
        )}

        {/* Note Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-lg font-bold mb-4">Add Study Note</h3>
              <input autoFocus value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && (saveNotes([...notes, { id: Date.now().toString(), text: noteText }]), setNoteText(''), setIsModalOpen(false))} placeholder="Key takeaway..." className="w-full border p-3 rounded-xl mb-6 outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex justify-end gap-3"><button onClick={() => setIsModalOpen(false)} className="text-sm font-bold text-slate-400">Cancel</button><button onClick={() => { saveNotes([...notes, { id: Date.now().toString(), text: noteText }]); setNoteText(''); setIsModalOpen(false); }} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 transition-all">Save</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
