import React, { useState, useEffect } from 'react';
import { FileText, Mic, BookOpen, Trash2, Clock, History, ChevronRight, Loader2, Volume2, AlertCircle, Plus, Sparkles } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// --- PREMIUM ANIMATED SKELETON LOADER ---
const PremiumLoader = ({ type }: { type: 'quiz' | 'podcast' }) => (
  <div className="bg-white p-10 rounded-[2rem] border border-blue-100 shadow-2xl shadow-blue-100/50 flex flex-col items-center justify-center space-y-6 animate-in zoom-in-95 duration-500">
    <div className="relative flex items-center justify-center">
      <div className="absolute inset-0 bg-blue-200 rounded-full animate-ping opacity-50"></div>
      <div className="relative bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-5 rounded-full shadow-lg shadow-blue-500/50">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    </div>
    <div className="text-center space-y-2">
      <h3 className="text-2xl font-black text-slate-800 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 animate-pulse">
        {type === 'quiz' ? 'Generating Smart Quiz...' : 'Synthesizing AI Podcast...'}
      </h3>
      <p className="text-slate-500 font-bold flex items-center justify-center gap-2">
        <Sparkles size={16} className="text-amber-500 animate-bounce" /> 
        Analyzing document context and structuring data
      </p>
    </div>
    <div className="w-full max-w-md space-y-3 pt-4 opacity-60">
      <div className="h-3 w-full bg-slate-200 rounded-full animate-pulse delay-75"></div>
      <div className="h-3 w-5/6 bg-slate-200 rounded-full animate-pulse delay-150"></div>
      <div className="h-3 w-4/6 bg-slate-200 rounded-full animate-pulse delay-300"></div>
    </div>
  </div>
);

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [currentFilename, setCurrentFilename] = useState<string>(''); 
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
    window.speechSynthesis.getVoices(); 
    return () => { window.speechSynthesis.cancel(); };
  }, []);

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
    setCurrentFilename(item.filename); 

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
          body: JSON.stringify({ 
            fileData: base64, 
            prompt: `Return ONLY a JSON quiz in ${language}: {"quiz_title": "string", "questions": [{"question_text": "string", "options": {"A": "string", "B": "string", "C": "string", "D": "string"}, "correct_answer": "A|B|C|D", "explanation": "string"}]}. Generate exactly ${numQuestions} questions.` 
          })
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
          body: JSON.stringify({ 
            fileData: base64, 
            prompt: `Summarize this material in conversational plain text paragraphs in ${language}. Target length: ${podcastDuration * 120} words. No markdown.` 
          })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPodcastScript(data.text);
        saveHistory({ id: Date.now().toString(), filename: file.name, type: 'podcast', date: new Date().toLocaleString(), data: { script: data.text } });
      };
    } catch (e) { setStatus('Generation limit reached. Please try again shortly.'); } finally { setIsPodcastLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900 font-sans selection:bg-indigo-200">
      <div className="max-w-4xl mx-auto space-y-10">
        
        {/* ENHANCED HEADER */}
        <header className="text-center py-6 animate-in fade-in slide-in-from-top-4 duration-700">
          <h1 className="text-6xl font-black tracking-tight mb-2">
            EduStream <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">AI</span>
          </h1>
          <p className="text-slate-500 font-bold text-lg flex items-center justify-center gap-2">
            <Sparkles size={20} className="text-amber-400" />
            Personalized Quizzes & Interactive Podcasts
          </p>
        </header>

        {/* INTERACTIVE CONTROLS CARD */}
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 md:p-10 transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 hover:border-blue-100">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-3 group">
              <label className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                <FileText size={18}/> 1. Upload Study PDF
              </label>
              <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-300">
                <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full p-4 font-bold text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-black file:bg-blue-600 file:text-white hover:file:bg-blue-700 hover:file:cursor-pointer cursor-pointer outline-none" />
              </div>
            </div>
            
            <div className="space-y-3 group">
              <label className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2 group-hover:text-indigo-600 transition-colors">
                <Volume2 size={18}/> 2. Voice Language
              </label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border-2 border-slate-100 p-4 rounded-2xl font-bold bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none appearance-none cursor-pointer transition-all hover:border-indigo-200">
                <option value="English">English (Global)</option>
                <option value="Hindi">Hindi (हिन्दी)</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-8 mb-10">
            <div className="space-y-3 group">
              <label className="text-sm font-black text-slate-700 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Questions</label>
              <input type="number" value={numQuestions} onChange={(e) => setNumQuestions(parseInt(e.target.value))} className="w-full border-2 border-slate-100 p-4 rounded-2xl font-bold bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all hover:border-blue-200 text-lg" min="1" max="20" />
            </div>
            <div className="space-y-3 group">
              <label className="text-sm font-black text-slate-700 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Podcast (Mins)</label>
              <input type="number" value={podcastDuration} onChange={(e) => setPodcastDuration(parseInt(e.target.value))} className="w-full border-2 border-slate-100 p-4 rounded-2xl font-bold bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all hover:border-indigo-200 text-lg" min="1" max="15" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-5">
            <button onClick={handleGenerateQuiz} disabled={isQuizLoading || isPodcastLoading || !file} className="flex-1 relative overflow-hidden group bg-slate-900 text-white p-6 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-800 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-slate-900/20">
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              {isQuizLoading ? <Loader2 className="animate-spin w-6 h-6" /> : <BookOpen className="w-6 h-6 group-hover:rotate-12 transition-transform" />} 
              <span className="text-lg tracking-wide">GENERATE QUIZ</span>
            </button>
            <button onClick={handleGeneratePodcast} disabled={isQuizLoading || isPodcastLoading || !file} className="flex-1 relative overflow-hidden group bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-2xl font-black flex items-center justify-center gap-3 hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-indigo-600/30">
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              {isPodcastLoading ? <Loader2 className="animate-spin w-6 h-6" /> : <Mic className="w-6 h-6 group-hover:scale-110 transition-transform" />} 
              <span className="text-lg tracking-wide">START PODCAST</span>
            </button>
          </div>
          
          {status && (
            <div className="mt-8 p-5 bg-amber-50 border-2 border-amber-200 rounded-2xl flex items-center gap-4 text-amber-800 font-bold animate-in zoom-in-95 duration-300 shadow-lg shadow-amber-100/50">
              <AlertCircle className="w-6 h-6 animate-pulse" /> 
              <p className="text-base">{status}</p>
            </div>
          )}
        </div>

        {/* HIGH VISIBILITY SKELETON */}
        {(isQuizLoading || isPodcastLoading) && (
          <PremiumLoader type={isQuizLoading ? 'quiz' : 'podcast'} />
        )}

        {/* CONTENT AREA */}
        <div className="space-y-10">
          {quizData && (
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 animate-in slide-in-from-bottom-8 duration-700">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-6 mb-10 pb-8 border-b-2 border-slate-50">
                <h2 className="text-3xl font-black text-slate-900 leading-tight">{quizData.quiz_title}</h2>
                {quizSubmitted && (
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-full font-black text-lg shadow-xl shadow-indigo-200 whitespace-nowrap animate-in zoom-in-50">
                    Score: {Object.keys(quizAnswers).filter(i => quizAnswers[parseInt(i)] === quizData.questions[parseInt(i)].correct_answer).length} / {quizData.questions.length}
                  </div>
                )}
              </div>
              
              <div className="space-y-10">
                {quizData.questions.map((q: any, i: number) => (
                  <div key={i} className="bg-slate-50/50 p-8 rounded-[2rem] space-y-6 border border-slate-100 transition-all hover:bg-slate-50 hover:shadow-lg">
                    <p className="font-black text-xl text-slate-800 leading-relaxed"><span className="text-blue-600 mr-2">{i+1}.</span>{q.question_text}</p>
                    <div className="grid gap-4">
                      {Object.entries(q.options).map(([k, v]: any) => (
                        <button key={k} disabled={quizSubmitted} onClick={() => setQuizAnswers({...quizAnswers, [i]: k})} className={cn("text-left p-5 rounded-2xl font-bold border-2 transition-all duration-300 text-lg", !quizSubmitted && quizAnswers[i] === k ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md shadow-blue-100" : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-md", quizSubmitted && q.correct_answer === k ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-200" : quizSubmitted && quizAnswers[i] === k ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-200" : "")}>
                          <span className="mr-3 opacity-70">{k}.</span>{v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!quizSubmitted && (
                <button onClick={() => setQuizSubmitted(true)} className="w-full py-6 mt-12 bg-slate-900 text-white font-black text-2xl tracking-wide rounded-[2rem] shadow-2xl shadow-slate-900/30 hover:bg-slate-800 hover:-translate-y-1 transition-all duration-300 active:scale-[0.98]">
                  SUBMIT RESULTS
                </button>
              )}
            </div>
          )}

          {podcastScript && (
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 space-y-10 animate-in slide-in-from-bottom-8 duration-700">
              
              {/* HEADER WITH PLAY BUTTON */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                <h2 className="text-2xl font-black flex items-center gap-3 text-slate-800">
                  <div className="bg-blue-100 p-3 rounded-xl text-blue-600"><Mic size={28}/></div>
                  AI Podcast
                </h2>
                <button onClick={toggleAudio} className={cn("w-full sm:w-auto px-10 py-5 rounded-2xl font-black text-white transition-all duration-300 shadow-xl active:scale-[0.98] flex items-center justify-center gap-3 text-lg hover:-translate-y-1", isPlaying ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/40" : "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/40")}>
                  {isPlaying ? "⏸ PAUSE AUDIO" : "▶️ PLAY AUDIO"}
                </button>
              </div>

              {/* RELOCATED NOTES SECTION */}
              <div className="pb-8 border-b-2 border-slate-50">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clock size={18}/> Session Notes</h3>
                  <button onClick={() => setIsModalOpen(true)} className="group bg-blue-50 text-blue-700 px-5 py-3 rounded-xl font-black hover:bg-blue-600 hover:text-white transition-all duration-300 flex items-center gap-2 shadow-sm">
                    <Plus size={18} className="group-hover:rotate-90 transition-transform"/> ADD NOTE
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {notes.map(n => (
                    <div key={n.id} className="bg-white p-5 rounded-2xl flex justify-between items-start group border-2 border-slate-100 hover:border-blue-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                      <p className="text-base font-bold text-slate-700 leading-relaxed">{n.text}</p>
                      <button onClick={() => deleteNote(n.id)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={18}/></button>
                    </div>
                  ))}
                  {notes.length === 0 && <div className="col-span-full text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold bg-slate-50/50">Click "Add Note" to record key takeaways while you listen.</div>}
                </div>
              </div>
              
              {/* SCRIPT AREA */}
              <div className="space-y-6">
                <h3 className="font-black text-slate-400 uppercase tracking-widest px-2">Generated Script</h3>
                <div className="bg-slate-900 p-8 md:p-10 rounded-[2rem] text-slate-300 font-medium text-lg lg:text-xl shadow-2xl shadow-slate-900/20 leading-loose border border-slate-800">
                  {podcastScript}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER DASHBOARD */}
        {history.length > 0 && (
          <div className="pt-12 border-t-2 border-slate-100 pb-12">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-3 justify-center text-center">
              <History size={20}/> Learning History
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {history.map((item) => (
                <button key={item.id} onClick={() => handleHistoryItemClick(item)} className="bg-white p-6 rounded-[1.5rem] border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left flex items-center justify-between group">
                  <div className="flex items-center gap-5">
                    <div className="text-3xl bg-slate-50 w-14 h-14 rounded-2xl flex items-center justify-center group-hover:bg-blue-50 group-hover:scale-110 transition-all duration-300 shadow-sm">
                      {item.type === 'quiz' ? '📝' : '🎙️'}
                    </div>
                    <div>
                      <div className="text-base font-black text-slate-800 truncate max-w-[150px] md:max-w-[200px]">{item.filename}</div>
                      <div className="text-xs font-bold text-slate-400 mt-1">{item.date}</div>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-full group-hover:bg-blue-600 group-hover:text-white text-slate-400 transition-colors duration-300">
                    <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[2.5rem] p-8 md:p-10 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-300 border border-slate-100">
              <h3 className="text-2xl font-black mb-6 text-slate-800">Add Quick Note</h3>
              <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="What was the key takeaway?" className="w-full border-2 border-slate-200 p-5 rounded-2xl mb-8 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50 h-40 resize-none font-bold text-slate-700 transition-all text-lg" />
              <div className="flex justify-end gap-4">
                <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-sm font-black text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">CANCEL</button>
                <button onClick={saveNote} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-indigo-200 hover:shadow-xl hover:-translate-y-0.5 transition-all">SAVE NOTE</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
