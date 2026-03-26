import React, { useState, useEffect } from 'react';
import { FileText, Mic, BookOpen, Trash2, Clock, History, ChevronRight, Loader2, Volume2, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// --- Skeleton Component for better UX ---
const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-slate-200 rounded-xl", className)} />
);

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
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const updateVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices());
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    const saved = localStorage.getItem('studyHistory');
    if (saved) setHistory(JSON.parse(saved));
    
    return () => { 
      window.speechSynthesis.cancel(); 
      window.speechSynthesis.onvoiceschanged = null;
    };
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

  // --- Address Manager Bug: Fix History Audio Selection ---
  const handleHistoryItemClick = (item: any) => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setStatus('');

    if (item.type === 'quiz') {
      setQuizData(item.data);
      setPodcastScript(null);
      setQuizSubmitted(true);
    } else {
      setPodcastScript(item.data.script);
      setQuizData(null);
    }
    window.scrollTo({ top: 400, behavior: 'smooth' });
  };

  // --- Address Manager Bug: Fix Re-playability & Audibility ---
  const toggleAudio = () => {
    const synth = window.speechSynthesis;

    if (synth.speaking) {
      if (synth.paused) {
        synth.resume();
        setIsPlaying(true);
      } else {
        synth.pause();
        setIsPlaying(false);
      }
    } else {
      if (!podcastScript) return;
      
      // Ensure any lingering speech tasks are killed
      synth.cancel();

      const cleanScript = podcastScript.replace(/[*#_`~]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanScript);
      
      if (language === 'Hindi') {
        utterance.lang = 'hi-IN';
        const voices = synth.getVoices();
        const hindiVoice = voices.find(v => v.lang.toLowerCase().startsWith('hi') || v.name.toLowerCase().includes('hindi'));
        if (hindiVoice) utterance.voice = hindiVoice;
      } else {
        utterance.lang = 'en-US';
      }
      
      utterance.rate = 0.9;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => { setIsPlaying(false); synth.cancel(); };
      
      synth.speak(utterance);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!file) return;
    setIsQuizLoading(true); setStatus('');
    setQuizData(null); setPodcastScript(null); 
    window.speechSynthesis.cancel(); setIsPlaying(false);
    
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileData: base64, 
          prompt: `Return ONLY a JSON quiz in ${language}: {"quiz_title": "string", "questions": [{"question_text": "string", "options": {"A": "string", "B": "string", "C": "string", "D": "string"}, "correct_answer": "A|B|C|D", "explanation": "string"}]}.` 
        })
      });
      
      if (!res.ok) throw new Error();
      const data = await res.json();
      const parsedData = JSON.parse(data.text.replace(/```json|```/g, "").trim());
      
      setQuizData(parsedData); setQuizAnswers({}); setQuizSubmitted(false); 
      saveHistory({ id: Date.now().toString(), filename: file.name, type: 'quiz', date: new Date().toLocaleString(), data: parsedData });
    } catch (e: any) { 
      // --- Address Manager Request: Generic Error Language ---
      setStatus('Unable to generate quiz. The AI service is currently busy, please try again in a moment.'); 
    } finally { setIsQuizLoading(false); }
  };

  const handleGeneratePodcast = async () => {
    if (!file) return;
    setIsPodcastLoading(true); setStatus('');
    setQuizData(null); setPodcastScript(null);
    window.speechSynthesis.cancel(); setIsPlaying(false);

    try {
      const base64 = await fileToBase64(file);
      const scriptRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: base64, prompt: `Summarize this in conversational plain text paragraphs in ${language}. No markdown.` })
      });
      
      if (!scriptRes.ok) throw new Error();
      const scriptData = await scriptRes.json();

      setPodcastScript(scriptData.text);
      saveHistory({ id: Date.now().toString(), filename: file.name, type: 'podcast', date: new Date().toLocaleString(), data: { script: scriptData.text } });
    } catch (e: any) { 
      // --- Address Manager Request: Generic Error Language ---
      setStatus('Podcast generation failed. The AI service is reaching its limit, please try again shortly.'); 
    } finally { setIsPodcastLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center py-4">
          <h1 className="text-5xl font-black text-slate-900">EduStream <span className="text-blue-600">AI</span></h1>
          <p className="text-slate-500 font-medium">Interactive AI Quizzes & Educational Podcasts</p>
        </header>

        {/* Input Section */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 md:p-8 hover:shadow-2xl transition-all">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2"><label className="text-sm font-bold flex items-center gap-2"><FileText size={18} className="text-blue-600"/> 1. Upload PDF</label><input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border-2 border-dashed border-slate-200 p-3 rounded-xl hover:border-blue-400 transition-colors" /></div>
            <div className="space-y-2"><label className="text-sm font-bold flex items-center gap-2"><Volume2 size={18} className="text-blue-600"/> 2. Language</label><select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-xl outline-none focus:border-blue-500 transition-all"><option value="English">English</option><option value="Hindi">Hindi</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="space-y-2"><label className="text-sm font-bold">Questions</label><input type="number" value={numQuestions} onChange={(e) => setNumQuestions(parseInt(e.target.value))} className="w-full border-2 border-slate-100 p-3 rounded-xl" /></div>
            <div className="space-y-2"><label className="text-sm font-bold">Podcast (Mins)</label><input type="number" value={podcastDuration} onChange={(e) => setPodcastDuration(parseInt(e.target.value))} className="w-full border-2 border-slate-100 p-3 rounded-xl" /></div>
          </div>
          <div className="flex gap-4">
            <button onClick={handleGenerateQuiz} disabled={isQuizLoading || isPodcastLoading || !file} className="flex-1 bg-slate-900 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-30">
              {isQuizLoading ? <Loader2 className="animate-spin" /> : <BookOpen size={20}/>} Generate Quiz
            </button>
            <button onClick={handleGeneratePodcast} disabled={isQuizLoading || isPodcastLoading || !file} className="flex-1 bg-blue-600 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-30">
              {isPodcastLoading ? <Loader2 className="animate-spin" /> : <Mic size={20}/>} Generate Podcast
            </button>
          </div>
          {status && (
            <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="text-red-500" size={20} />
              <p className="text-sm text-red-700 font-bold">{status}</p>
            </div>
          )}
        </div>

        {/* --- Address Manager Request: Skeleton Loading --- */}
        {(isQuizLoading || isPodcastLoading) && (
          <div className="space-y-6">
            <Skeleton className="h-10 w-1/2" />
            <div className="grid gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          </div>
        )}

        {/* QUIZ SECTION */}
        {quizData && (
          <div className="bg-white p-8 rounded-3xl border shadow-xl space-y-8 animate-in zoom-in-95 duration-500 mb-8">
            <div className="flex justify-between items-center border-b pb-4"><h2 className="text-2xl font-black text-slate-800">{quizData.quiz_title}</h2>{quizSubmitted && <div className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black">Score: {Object.keys(quizAnswers).filter(i => quizAnswers[parseInt(i)] === quizData.questions[parseInt(i)].correct_answer).length} / {quizData.questions.length}</div>}</div>
            {quizData.questions.map((q: any, i: number) => (
              <div key={i} className="space-y-4">
                <p className="font-extrabold text-slate-800">{i+1}. {q.question_text}</p>
                <div className="grid gap-2">
                  {Object.entries(q.options).map(([k, v]: any) => {
                    const isSelected = quizAnswers[i] === k;
                    const isCorrect = q.correct_answer === k;
                    return (
                      <button key={k} disabled={quizSubmitted} onClick={() => setQuizAnswers({...quizAnswers, [i]: k})} className={cn("w-full text-left p-4 border-2 rounded-xl transition-all font-bold", !quizSubmitted && isSelected ? "border-blue-600 bg-blue-50" : "border-slate-100 hover:border-slate-300", quizSubmitted && isCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "", quizSubmitted && isSelected && !isCorrect ? "border-red-500 bg-red-50 text-red-800" : "")}>{k}. {v}</button>
                    )
                  })}
                </div>
                {quizSubmitted && <div className="p-4 bg-slate-50 rounded-xl text-sm font-medium text-slate-600 border-l-4 border-blue-500">{q.explanation}</div>}
              </div>
            ))}
            {!quizSubmitted && <button onClick={() => setQuizSubmitted(true)} className="w-full py-4 mt-6 bg-blue-600 text-white font-black rounded-2xl shadow-lg hover:bg-blue-700 transition-all active:scale-95">Submit Results</button>}
          </div>
        )}

        {/* PODCAST SECTION */}
        {podcastScript && (
          <div className="bg-white p-8 rounded-3xl border shadow-xl space-y-6 animate-in zoom-in-95 duration-500 mb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black flex items-center gap-2"><Mic className="text-blue-600" /> AI Podcast Summary</h2>
              <button onClick={toggleAudio} className={cn("px-8 py-3 rounded-2xl font-black text-white transition-all shadow-lg active:scale-95", isPlaying ? "bg-amber-500 hover:bg-amber-600 shadow-amber-200" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200")}>
                {isPlaying ? "⏸ Pause Audio" : "▶️ Play Audio"}
              </button>
            </div>
            
            <div className="space-y-4">
               <div className="flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Clock size={18} className="text-blue-600" /> Study Notes</h3><button onClick={() => { setIsModalOpen(true); }} className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Add Note</button></div>
               <div className="space-y-2">
                  {notes.map(note => (
                    <div key={note.id} className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl">
                      <span className="flex-1 text-xs font-bold text-slate-600">{note.text}</span>
                      <button onClick={() => saveNotes(notes.filter(n => n.id !== note.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                    </div>
                  ))}
               </div>
            </div>
            <div className="bg-slate-900 p-6 rounded-3xl text-slate-300 leading-relaxed font-medium whitespace-pre-wrap border border-slate-800 shadow-inner">"{podcastScript}"</div>
          </div>
        )}

        {/* Dashboard (At the bottom as requested) */}
        {history.length > 0 && (
          <div className="pt-8 border-t border-slate-200">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><History size={16}/> Learning History</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {history.map((item) => (
                <button key={item.id} onClick={() => handleHistoryItemClick(item)} className="group flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-500 hover:shadow-lg transition-all text-left">
                  <div className="flex items-center gap-4"><span className="text-2xl">{item.type === 'quiz' ? '📝' : '🎙️'}</span><div><div className="text-sm font-black text-slate-800">{item.filename}</div><div className="text-[10px] font-bold text-slate-400">{item.date}</div></div></div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-transform group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-black mb-4">Add Study Note</h3>
              <input autoFocus value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && (saveNotes([...notes, { id: Date.now().toString(), text: noteText }]), setNoteText(''), setIsModalOpen(false))} placeholder="Key takeaway..." className="w-full border-2 border-slate-100 p-4 rounded-2xl mb-6 outline-none focus:border-blue-500 transition-all" />
              <div className="flex justify-end gap-3"><button onClick={() => setIsModalOpen(false)} className="text-sm font-extrabold text-slate-400">Cancel</button><button onClick={() => { saveNotes([...notes, { id: Date.now().toString(), text: noteText }]); setNoteText(''); setIsModalOpen(false); }} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-black shadow-lg hover:bg-blue-700 transition-all">Save</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
