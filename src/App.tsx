import React, { useState, useEffect } from 'react';
import { FileText, Mic, BookOpen, Trash2, Clock, History, ChevronRight, Loader2, Volume2, AlertCircle, Plus } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-slate-200 rounded-xl", className)} />
);

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [currentFilename, setCurrentFilename] = useState<string>(''); // Tracking name for notes
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

  // Initialization
  useEffect(() => {
    const saved = localStorage.getItem('studyHistory');
    if (saved) setHistory(JSON.parse(saved));
    window.speechSynthesis.getVoices(); // Force load voices
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  // Sync notes whenever the filename changes (new upload or history click)
  useEffect(() => {
    if (currentFilename) {
      const savedNotes = localStorage.getItem(`notes_${currentFilename}`);
      setNotes(savedNotes ? JSON.parse(savedNotes) : []);
    }
  }, [currentFilename]);

  const saveHistory = (item: any) => {
    const newHistory = [item, ...history].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('studyHistory', JSON.stringify(newHistory));
  };

  const saveNote = () => {
    if (!noteText.trim() || !currentFilename) return;
    const newNotes = [...notes, { id: Date.now().toString(), text: noteText }];
    setNotes(newNotes);
    localStorage.setItem(`notes_${currentFilename}`, JSON.stringify(newNotes));
    setNoteText('');
    setIsModalOpen(false);
  };

  const deleteNote = (id: string) => {
    const newNotes = notes.filter(n => n.id !== id);
    setNotes(newNotes);
    localStorage.setItem(`notes_${currentFilename}`, JSON.stringify(newNotes));
  };

  const handleHistoryItemClick = (item: any) => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setStatus('');
    setCurrentFilename(item.filename); // This triggers the useEffect to load correct notes

    if (item.type === 'quiz') {
      setQuizData(item.data);
      setPodcastScript(null);
      setQuizSubmitted(true);
    } else {
      setPodcastScript(item.data.script);
      setQuizData(null);
    }
  };

  const toggleAudio = () => {
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      if (synth.paused) { synth.resume(); setIsPlaying(true); }
      else { synth.pause(); setIsPlaying(false); }
    } else {
      if (!podcastScript) return;
      synth.cancel();
      const cleanScript = podcastScript.replace(/[*#_`~]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanScript);
      
      const voices = synth.getVoices();
      if (language === 'Hindi') {
        utterance.lang = 'hi-IN';
        // Extreme targeting for Hindi voices
        const hindiVoice = voices.find(v => v.lang.startsWith('hi') || v.name.toLowerCase().includes('hindi') || v.name.toLowerCase().includes('google हिन्दी'));
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
    setCurrentFilename(file.name);
    setIsQuizLoading(true); setStatus(''); setQuizData(null); setPodcastScript(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: base64, prompt: `Return ONLY a JSON quiz in ${language}: {"quiz_title": "string", "questions": [{"question_text": "string", "options": {"A": "string", "B": "string", "C": "string", "D": "string"}, "correct_answer": "A|B|C|D", "explanation": "string"}]}.` })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const parsedData = JSON.parse(data.text.replace(/```json|```/g, "").trim());
        setQuizData(parsedData); setQuizAnswers({}); setQuizSubmitted(false);
        saveHistory({ id: Date.now().toString(), filename: file.name, type: 'quiz', date: new Date().toLocaleString(), data: parsedData });
      };
    } catch (e) { setStatus('Service busy. Please try again in a moment.'); } finally { setIsQuizLoading(false); }
  };

  const handleGeneratePodcast = async () => {
    if (!file) return;
    setCurrentFilename(file.name);
    setIsPodcastLoading(true); setStatus(''); setQuizData(null); setPodcastScript(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: base64, prompt: `Summarize this material in conversational plain text paragraphs in ${language}. No markdown.` })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPodcastScript(data.text);
        saveHistory({ id: Date.now().toString(), filename: file.name, type: 'podcast', date: new Date().toLocaleString(), data: { script: data.text } });
      };
    } catch (e) { setStatus('Generation limit reached. Please try again shortly.'); } finally { setIsPodcastLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900 font-sans selection:bg-blue-100">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center py-6">
          <h1 className="text-5xl font-black text-slate-900 tracking-tight">EduStream <span className="text-blue-600">AI</span></h1>
          <p className="text-slate-500 font-bold mt-2">Personalized Quizzes & AI Podcasts</p>
        </header>

        <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200 border border-slate-100 p-8 transition-all">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-3">
              <label className="text-sm font-black text-slate-700 uppercase tracking-wider">Step 1: Upload Study PDF</label>
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border-2 border-dashed border-slate-200 p-4 rounded-2xl hover:border-blue-400 transition-colors bg-slate-50 cursor-pointer" />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-black text-slate-700 uppercase tracking-wider">Step 2: Voice Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border-2 border-slate-100 p-4 rounded-2xl font-bold bg-white focus:border-blue-500 outline-none appearance-none cursor-pointer">
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={handleGenerateQuiz} disabled={isQuizLoading || isPodcastLoading || !file} className="flex-1 bg-slate-900 text-white p-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-20 shadow-xl shadow-slate-900/20">
              {isQuizLoading ? <Loader2 className="animate-spin" /> : <BookOpen size={24}/>} GENERATE QUIZ
            </button>
            <button onClick={handleGeneratePodcast} disabled={isQuizLoading || isPodcastLoading || !file} className="flex-1 bg-blue-600 text-white p-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-20 shadow-xl shadow-blue-600/20">
              {isPodcastLoading ? <Loader2 className="animate-spin" /> : <Mic size={24}/>} START PODCAST
            </button>
          </div>
          {status && <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800 font-bold"><AlertCircle size={20}/> {status}</div>}
        </div>

        {/* LOADING SKELETONS */}
        {(isQuizLoading || isPodcastLoading) && (
          <div className="space-y-6">
            <Skeleton className="h-12 w-3/4" />
            <div className="grid gap-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="space-y-8">
          {quizData && (
            <div className="bg-white p-8 rounded-[2rem] border shadow-2xl animate-in zoom-in-95 duration-500">
              <div className="flex justify-between items-center mb-8"><h2 className="text-3xl font-black text-slate-900">{quizData.quiz_title}</h2>{quizSubmitted && <div className="bg-blue-600 text-white px-6 py-2 rounded-full font-black">Score: {Object.keys(quizAnswers).length} Total</div>}</div>
              <div className="space-y-8">
                {quizData.questions.map((q: any, i: number) => (
                  <div key={i} className="bg-slate-50 p-6 rounded-3xl space-y-4">
                    <p className="font-black text-lg text-slate-800">{i+1}. {q.question_text}</p>
                    <div className="grid gap-3">
                      {Object.entries(q.options).map(([k, v]: any) => (
                        <button key={k} disabled={quizSubmitted} onClick={() => setQuizAnswers({...quizAnswers, [i]: k})} className={cn("text-left p-4 rounded-xl font-bold border-2 transition-all", !quizSubmitted && quizAnswers[i] === k ? "border-blue-600 bg-blue-50 text-blue-700" : "border-white bg-white hover:border-slate-200", quizSubmitted && q.correct_answer === k ? "bg-emerald-500 text-white border-emerald-500" : quizSubmitted && quizAnswers[i] === k ? "bg-red-500 text-white border-red-500" : "")}>{k}. {v}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!quizSubmitted && <button onClick={() => setQuizSubmitted(true)} className="w-full py-5 mt-10 bg-blue-600 text-white font-black text-xl rounded-2xl shadow-xl hover:bg-blue-700 transition-all">SUBMIT QUIZ</button>}
            </div>
          )}

          {podcastScript && (
            <div className="bg-white p-8 rounded-[2rem] border shadow-2xl space-y-8 animate-in zoom-in-95 duration-500">
              <div className="flex items-center justify-between"><h2 className="text-2xl font-black flex items-center gap-3"><Mic className="text-blue-600" size={30}/> AI Learning Podcast</h2><button onClick={toggleAudio} className={cn("px-10 py-4 rounded-2xl font-black text-white transition-all shadow-xl", isPlaying ? "bg-amber-500" : "bg-emerald-600")}>{isPlaying ? "PAUSE" : "PLAY AUDIO"}</button></div>
              <div className="space-y-4 bg-slate-900 p-8 rounded-3xl text-slate-300 font-medium italic text-lg shadow-inner">"{podcastScript}"</div>
              <div className="pt-6 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4"><h3 className="font-black text-slate-700 uppercase text-xs tracking-widest flex items-center gap-2"><Clock size={16} className="text-blue-500"/> Personal Notes</h3><button onClick={() => setIsModalOpen(true)} className="bg-blue-50 text-blue-600 p-2 rounded-full hover:bg-blue-100 transition-colors"><Plus size={20}/></button></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {notes.map(n => (
                    <div key={n.id} className="bg-slate-50 p-4 rounded-xl flex justify-between items-start group border border-slate-100 hover:border-blue-200 transition-all">
                      <p className="text-sm font-bold text-slate-600 leading-relaxed">{n.text}</p>
                      <button onClick={() => deleteNote(n.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER DASHBOARD */}
        {history.length > 0 && (
          <div className="pt-10 border-t border-slate-200">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2"><History size={16}/> Learning History</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map((item) => (
                <button key={item.id} onClick={() => handleHistoryItemClick(item)} className="bg-white p-5 rounded-2xl border border-slate-100 hover:border-blue-500 hover:shadow-lg transition-all text-left flex items-center justify-between group">
                  <div className="flex items-center gap-4"><div className="text-2xl group-hover:scale-125 transition-transform">{item.type === 'quiz' ? '📝' : '🎙️'}</div><div><div className="text-sm font-black text-slate-800 truncate max-w-[120px]">{item.filename}</div><div className="text-[10px] font-bold text-slate-400">{item.date}</div></div></div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95">
              <h3 className="text-xl font-black mb-6 text-slate-800">Add Quick Note</h3>
              <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="What was the key takeaway?" className="w-full border-2 border-slate-100 p-4 rounded-2xl mb-6 outline-none focus:border-blue-500 h-32 resize-none font-bold" />
              <div className="flex justify-end gap-3"><button onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-sm font-black text-slate-400">CANCEL</button><button onClick={saveNote} className="bg-blue-600 text-white px-8 py-2 rounded-xl font-black shadow-lg hover:bg-blue-700 transition-all">SAVE</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
