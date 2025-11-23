import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  Skull, Scroll, Calendar, CheckCircle2, XCircle, HelpCircle,
  Users, Flame, BookOpen, Share2, Download, MessageSquare,
  Send, Edit3, Save, MapPin, ImageIcon
} from 'lucide-react';

const getTimestamp = () => Date.now();

// --- Utility: Generate/Get Local ID ---
const getLocalUserId = () => {
  let uid = localStorage.getItem('investigator_uid');
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem('investigator_uid', uid);
  }
  return uid;
};

const EldritchButton = ({ onClick, children, className = "", variant = "primary", disabled = false }) => {
  const baseStyle = "relative w-full md:w-auto px-6 py-3 md:py-2 font-serif font-bold uppercase tracking-widest transition-all duration-300 transform active:scale-95 md:hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group touch-manipulation";
  const variants = {
    primary: "bg-red-900 text-amber-100 border-2 border-amber-600 hover:bg-red-800 hover:shadow-[0_0_15px_rgba(220,38,38,0.5)]",
    secondary: "bg-stone-800 text-stone-300 border-2 border-stone-600 hover:bg-stone-700",
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
      <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
    </button>
  );
};

export default function InvestigatorLedger() {
  // Identity
  const [userId] = useState(() => getLocalUserId());
  const [investigatorName, setInvestigatorName] = useState(
    () => localStorage.getItem('investigator_name') || ""
  );
  const [showNameInput, setShowNameInput] = useState(() => !localStorage.getItem('investigator_name'));

  // Data
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState("");

  // UI/Form States
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newImageFile, setNewImageFile] = useState(null);

  const [noteInputs, setNoteInputs] = useState({});
  const [expandedNotes, setExpandedNotes] = useState({});
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [tempSummary, setTempSummary] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const fileInputRef = useRef(null);

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('date', { ascending: true });
    if (!error && data) setSessions(data);
  };

  const fetchSummary = async () => {
    const { data, error } = await supabase
      .from('general')
      .select('content')
      .eq('id', 'case_log')
      .single();
    if (!error && data) setSummary(data.content?.text || "");
  };

  // --- Init & realtime ---
  useEffect(() => {
    const load = async () => {
      await fetchSessions();
      await fetchSummary();
      setLoading(false);
    };
    load();

    const sessionsChannel = supabase
      .channel('sessions_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => {
        setSessions(prev => {
          if (payload.eventType === 'INSERT') {
            return [...prev, payload.new].sort((a, b) => (a.date > b.date ? 1 : -1));
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter(s => s.id !== payload.old.id);
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map(s => s.id === payload.new.id ? payload.new : s).sort((a, b) => (a.date > b.date ? 1 : -1));
          }
          return prev;
        });
      })
      .subscribe();

    const summaryChannel = supabase
      .channel('general_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'general' }, (payload) => {
        if (payload.new && payload.new.id === 'case_log') {
          setSummary(payload.new.content?.text || "");
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(summaryChannel);
    };
  }, []);

  // --- Actions ---
  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (!investigatorName.trim()) return;
    localStorage.setItem('investigator_name', investigatorName);
    setShowNameInput(false);
  };

  const handleChangeIdentity = () => {
    setInvestigatorName("");
    setShowNameInput(true);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const text = "The stars are aligning... Join the ritual.";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Investigator's Ledger", text, url });
      } catch (err) {
        console.warn('Share failed', err);
      }
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setToastMessage("Summoning spell copied to clipboard!");
      setTimeout(() => setToastMessage(""), 3000);
    }
  };

  const saveSummary = async () => {
    setSummary(tempSummary);
    const { error } = await supabase
      .from('general')
      .upsert({
        id: 'case_log',
        content: {
          text: tempSummary,
          lastEditedBy: investigatorName,
          updatedAt: new Date().toISOString()
        }
      });
    if (!error) setIsEditingSummary(false);
    else setToastMessage("Failed to save case log.");
  };

  const handleAddSession = async (e) => {
    e.preventDefault();
    if (!newDate) return;

    let imageUrlToUse = "";

    if (newImageFile) {
      const nameParts = newImageFile.name?.split('.') || [];
      const extFromName = nameParts.length > 1 ? nameParts.pop().toLowerCase() : "";
      const extFromType = newImageFile.type?.split('/').pop()?.toLowerCase() || "";
      const extension = extFromName || extFromType || "jpg";
      const filePath = `sessions/${userId}-${getTimestamp()}.${extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('session-images')
        .upload(filePath, newImageFile);

      if (uploadError) {
        console.error(uploadError);
        setToastMessage("The sigils rejected the image.");
        return;
      }

      const { data: publicData } = supabase.storage
        .from('session-images')
        .getPublicUrl(uploadData.path);

      imageUrlToUse = publicData?.publicUrl || "";
    }

    const { error } = await supabase
      .from('sessions')
      .insert({
        title: newTitle || "Unnamed Ritual",
        date: newDate,
        location: newLocation || "Undisclosed Location",
        image_url: imageUrlToUse,
        proposer: investigatorName,
        proposer_id: userId,
        votes: {},
        notes: []
      });

    if (error) {
      console.error(error);
      setToastMessage("The ink refused to dry.");
    } else {
      setNewDate("");
      setNewTitle("");
      setNewLocation("");
      setNewImageFile(null);
    }
  };

  const handleVote = async (sessionId, voteType) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const currentVotes = session.votes || {};
    const updatedVotes = {
      ...currentVotes,
      [investigatorName]: {
        name: investigatorName,
        status: voteType,
        timestamp: getTimestamp(),
        uid: userId
      }
    };

    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, votes: updatedVotes } : s));

    await supabase
      .from('sessions')
      .update({ votes: updatedVotes })
      .eq('id', sessionId);
  };

  const handleAddNote = async (sessionId) => {
    const text = noteInputs[sessionId];
    if (!text?.trim()) return;

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const currentNotes = session.notes || [];
    const newNote = {
      text: text.trim(),
      author: investigatorName,
      timestamp: getTimestamp()
    };

    const updatedNotes = [...currentNotes, newNote];
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: updatedNotes } : s));

    await supabase
      .from('sessions')
      .update({ notes: updatedNotes })
      .eq('id', sessionId);

    setNoteInputs(prev => ({ ...prev, [sessionId]: "" }));
  };

  const [deletingSessionId, setDeletingSessionId] = useState(null);

  const confirmDelete = async () => {
    if (!deletingSessionId) return;
    setSessions(prev => prev.filter(s => s.id !== deletingSessionId));
    await supabase.from('sessions').delete().eq('id', deletingSessionId);
    setDeletingSessionId(null);
  };

  const generateICS = (session) => {
    const date = new Date(session.date);
    const format = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const end = new Date(date.getTime() + (4 * 60 * 60 * 1000));

    const icsContent = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//InvestigatorLedger//RPG//EN',
      'BEGIN:VEVENT', `UID:${session.id}@investigatorledger`,
      `DTSTAMP:${format(new Date())}`, `DTSTART:${format(date)}`, `DTEND:${format(end)}`,
      `SUMMARY:${session.title}`, `LOCATION:${session.location}`,
      `DESCRIPTION:Organised via The Investigator's Ledger. Proposer: ${session.proposer}`,
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${session.title.replace(/\s+/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getVoteCounts = (votes = {}) => {
    const values = Object.values(votes || {});
    return {
      yes: values.filter(v => v.status === 'yes').length,
      no: values.filter(v => v.status === 'no').length,
      maybe: values.filter(v => v.status === 'maybe').length,
      total: values.length
    };
  };

  const isTheStarsRight = (votes = {}) => {
    const counts = getVoteCounts(votes);
    return counts.yes > 1 && counts.no === 0 && counts.maybe === 0 && counts.total > 1;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-center text-amber-100 font-serif">
        <Flame className="w-12 h-12 animate-pulse mb-4 text-red-600" />
        <p className="tracking-widest uppercase animate-pulse">Consulting the Old Ones...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1814] text-[#d4c5a9] font-serif overflow-x-hidden relative selection:bg-red-900 selection:text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none opacity-20 z-0"
        style={{ backgroundImage: `url("https://www.transparenttextures.com/patterns/aged-paper.png"), radial-gradient(circle at center, #2a2520 0%, #0c0b0a 100%)` }}>
      </div>

      {/* Burn Confirmation Modal */}
      {deletingSessionId && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#25221e] border-2 border-red-900 p-6 md:p-8 max-w-sm w-full shadow-[0_0_50px_rgba(220,38,38,0.3)] relative text-center">
            <div className="absolute -top-3 -left-3 w-6 h-6 border-t-2 border-l-2 border-red-600"></div>
            <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-2 border-r-2 border-red-600"></div>

            <Flame className="w-12 h-12 text-red-600 mx-auto mb-4 animate-pulse" />

            <h3 className="font-display text-xl text-red-500 mb-2 uppercase tracking-widest">Burn This Page?</h3>
            <p className="font-typewriter text-stone-400 text-sm mb-6">
              "Fire cleanses all... but what is lost can never be recovered."
            </p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeletingSessionId(null)}
                className="px-4 py-2 border border-stone-700 text-stone-400 font-typewriter hover:text-stone-200 hover:border-stone-500 transition-colors"
              >
                Spare It
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-900/20 border border-red-900 text-red-500 font-typewriter hover:bg-red-900/40 hover:text-red-400 transition-colors"
              >
                Burn It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[100] w-11/12 md:w-auto bg-red-900 text-amber-100 px-6 py-4 md:py-3 border-2 border-amber-600 shadow-[0_0_20px_rgba(0,0,0,0.8)] font-typewriter flex items-center gap-3 animate-bounce rounded-md">
          <Scroll className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="text-sm md:text-base">{toastMessage}</span>
        </div>
      )}

      {/* Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Special+Elite&display=swap');
        .font-display { font-family: 'Cinzel', serif; }
        .font-typewriter { font-family: 'Special Elite', cursive; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { bg: #1a1814; }
        ::-webkit-scrollbar-thumb { background: #44403c; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #78350f; }
        @media screen and (max-width: 768px) { input, textarea, select { font-size: 16px !important; } }
      `}</style>

      <div className="relative z-10 max-w-4xl mx-auto p-3 md:p-8 pb-24">
        {/* Header */}
        <header className="text-center mb-8 md:mb-12 border-b-2 border-stone-800 pb-6 md:pb-8 mt-4">
          <div className="flex items-center justify-center gap-4 mb-2">
            <Skull className="w-6 h-6 md:w-8 md:h-8 text-red-800" />
            <h1 className="text-2xl md:text-5xl font-display font-bold tracking-widest text-red-700 shadow-black drop-shadow-lg leading-tight">
              The Investigator's<br className="md:hidden" /> Ledger
            </h1>
            <Skull className="w-6 h-6 md:w-8 md:h-8 text-red-800" />
          </div>
          <p className="font-typewriter text-stone-500 text-xs md:text-base max-w-lg mx-auto px-4">
            "The oldest and strongest emotion of mankind is fear... or trying to schedule a Friday night."
          </p>
        </header>

        {/* Identity Modal */}
        {showNameInput && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
            <div className="bg-[#25221e] border border-stone-700 p-6 md:p-8 max-w-md w-full shadow-2xl relative my-8 rounded-sm">
              <div className="absolute -top-3 -left-3 w-6 h-6 border-t-2 border-l-2 border-amber-600"></div>
              <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-2 border-r-2 border-amber-600"></div>
              <h2 className="font-display text-xl md:text-2xl text-amber-100 mb-6 text-center">Identify Yourself</h2>
              <form onSubmit={handleNameSubmit} className="space-y-6">
                <div>
                  <label className="block font-typewriter text-stone-400 mb-2 text-sm">Investigator Name</label>
                  <input
                    type="text"
                    value={investigatorName}
                    onChange={(e) => setInvestigatorName(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-700 p-3 md:p-4 text-amber-100 font-typewriter focus:border-red-700 focus:outline-none transition-colors text-base rounded-sm"
                    placeholder="e.g. Detective Malone"
                    autoFocus
                  />
                </div>
                <EldritchButton onClick={handleNameSubmit} disabled={!investigatorName.trim()}>
                  Sign the Book
                </EldritchButton>
              </form>
            </div>
          </div>
        )}

        {!showNameInput && (
          <div className="space-y-6 md:space-y-8">
            {/* Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-[#25221e] p-4 border border-stone-800 shadow-lg rounded-sm">
              <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-start">
                <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center border border-stone-600 shrink-0">
                  <Users className="w-5 h-5 text-amber-600" />
                </div>
                <div className="text-center md:text-left">
                  <p className="text-[10px] md:text-xs text-stone-500 font-typewriter uppercase tracking-wider">Current Investigator</p>
                  <p className="text-amber-100 font-bold text-sm md:text-base truncate max-w-[200px]">{investigatorName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-end">
                <button
                  onClick={handleShare}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 text-amber-600 hover:text-amber-400 font-typewriter text-xs md:text-sm border border-amber-900/50 px-4 py-2 bg-amber-900/10 rounded hover:bg-amber-900/30 transition-colors whitespace-nowrap"
                >
                  <Share2 className="w-4 h-4" />
                  Summon
                </button>
                <button
                  onClick={handleChangeIdentity}
                  className="text-xs text-stone-500 hover:text-amber-600 font-typewriter underline whitespace-nowrap px-2"
                >
                  Change Identity
                </button>
              </div>
            </div>

            {/* Case Log */}
            <div className="bg-stone-200 text-stone-900 p-4 md:p-6 shadow-[0_0_20px_rgba(0,0,0,0.5)] md:transform md:-rotate-1 relative overflow-hidden rounded-sm">
              <div className="absolute inset-0 pointer-events-none opacity-30"
                style={{ backgroundImage: `url("https://www.transparenttextures.com/patterns/crumpled-paper.png")` }}></div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-3 border-b-2 border-stone-400 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-red-900 text-stone-200 px-2 py-0.5 text-[10px] md:text-xs font-bold uppercase tracking-widest">Confidential</div>
                    <h3 className="font-typewriter font-bold text-base md:text-xl uppercase tracking-wider">Case Log</h3>
                  </div>
                  {!isEditingSummary ? (
                    <button
                      onClick={() => {
                        setTempSummary(summary);
                        setIsEditingSummary(true);
                      }}
                      className="text-stone-600 hover:text-red-900 transition-colors p-1"
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditingSummary(false)} className="text-stone-500 hover:text-stone-800 p-1">
                        <XCircle className="w-5 h-5" />
                      </button>
                      <button onClick={saveSummary} className="text-green-800 hover:text-green-600 p-1">
                        <Save className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
                {isEditingSummary ? (
                  <textarea
                    value={tempSummary}
                    onChange={(e) => setTempSummary(e.target.value)}
                    className="w-full bg_white/50 border border-stone-400 p-3 font-typewriter text-base min-h-[120px] focus:border-red-800 focus:outline-none shadow-inner"
                    placeholder="Enter investigation details..."
                    autoFocus
                  />
                ) : (
                  <div className="font-typewriter text-sm md:text-base whitespace-pre-wrap min-h-[60px] text-stone-800 leading-relaxed">
                    {summary || <span className="text-stone-500 italic opacity-70">No entries found. Click the pen to document...</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Add Session */}
            <div className="bg-[#25221e] p-4 md:p-6 border-t-4 border-red-900 shadow-xl relative overflow-hidden rounded-sm">
              <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
                <BookOpen className="w-24 h-24 md:w-32 md:h-32 -mr-6 -mt-6" />
              </div>
              <h3 className="font-display text-lg md:text-xl mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-600" />
                Propose a Gathering
              </h3>
              <form onSubmit={handleAddSession} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-typewriter text-stone-500 text-xs mb-1">Scenario / Title</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g. The Haunting"
                      className="w-full bg-stone-900 border border-stone-700 p-3 text-amber-100 font-typewriter focus:border-amber-600 focus:outline-none text-base rounded-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-typewriter text-stone-500 text-xs mb-1">Date & Time</label>
                    <input
                      type="datetime-local"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 p-3 text-amber-100 font-typewriter focus:border-amber-600 focus:outline-none text-base rounded-sm appearance-none"
                    />
                  </div>
                  <div>
                    <label className="block font-typewriter text-stone-500 text-xs mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Location
                    </label>
                    <input
                      type="text"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      placeholder="e.g. John's House / Discord"
                      className="w-full bg-stone-900 border border-stone-700 p-3 text-amber-100 font-typewriter focus:border-amber-600 focus:outline-none text-base rounded-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-typewriter text-stone-500 text-xs mb-1 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" /> Evidence
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => setNewImageFile(e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-stone-800 border border-stone-700 text-amber-100 font-typewriter text-sm rounded-sm hover:bg-stone-700 hover:border-amber-600 transition-colors"
                      >
                        Choose image
                      </button>
                      <span className="text-xs text-stone-400 truncate">
                        {newImageFile ? newImageFile.name : "No file selected"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <EldritchButton onClick={handleAddSession} disabled={!newDate}>
                    Inscribe Date
                  </EldritchButton>
                </div>
              </form>
            </div>

            {/* Sessions List */}
            <div className="space-y-6">
              <h3 className="font-display text-xl md:text-2xl text-center text-stone-400 uppercase tracking-[0.2em] border-b border-stone-800 pb-2 mt-8">
                Pending Rituals
              </h3>

              {sessions.length === 0 && (
                <div className="text-center py-12 text-stone-600 font-typewriter italic border border-dashed border-stone-800 bg-stone-900/20 rounded-sm">
                  No dates have been inscribed yet. The void is silent.
                </div>
              )}

              {sessions.map((session) => {
                const userVote = session.votes?.[investigatorName]?.status;
                const starsRight = isTheStarsRight(session.votes);
                const showNotes = expandedNotes[session.id];

                return (
                  <div
                    key={session.id}
                    className={`relative bg-[#25221e] border transition-all duration-500 group rounded-sm overflow-hidden
                      ${starsRight
                        ? 'border-amber-500 shadow-[0_0_30px_rgba(217,119,6,0.15)]'
                        : 'border-stone-800 shadow-md hover:border-stone-600'
                      }`}
                  >
                    {starsRight && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10 overflow-hidden z-0">
                        <div className="w-64 h-64 border-4 border-amber-600 rounded-full animate-[spin_10s_linear_infinite]"></div>
                        <div className="absolute w-48 h-48 border-2 border-red-600 rotate-45"></div>
                      </div>
                    )}

                    <div className="p-4 md:p-6 relative z-10">
                      <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-6">
                        {session.image_url && (
                          <div
                            className="w-full md:w-1/3 relative group cursor-pointer order-last md:order-first mt-2 md:mt-0"
                            onClick={() => window.open(session.image_url, "_blank")}
                          >
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full bg-red-800 shadow z-20 border border-red-950 hidden md:block"></div>
                            <div className="relative bg-white p-2 rotate-1 md:rotate-[-2deg] hover:rotate-0 transition-transform shadow-lg">
                              <img
                                src={session.image_url}
                                alt="Evidence"
                                className="w-full h-48 md:h-40 object-cover filter sepia-[.5] contrast-125"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex-1">
                          <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
                            <h4 className={`font-display text-lg md:text-2xl font-bold ${starsRight ? 'text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : 'text-stone-200'}`}>
                              {new Date(session.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                            </h4>
                            {starsRight && (
                              <span className="bg-amber-900/50 text-amber-200 text-[10px] px-2 py-0.5 border border-amber-700 rounded font-typewriter uppercase">
                                Stars Aligned
                              </span>
                            )}
                          </div>

                          <p className="text-lg md:text-xl font-typewriter text-amber-700 mb-3 font-bold break-words leading-tight">
                            {session.title}
                          </p>

                          <div className="space-y-2 font-typewriter text-sm text-stone-400 bg-black/20 p-3 rounded-sm border border-stone-800/50">
                            <p className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-stone-600 shrink-0" />
                              <span className="text-stone-300">
                                {new Date(session.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </p>
                            <p className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-stone-600 shrink-0" />
                              <span className="text-stone-300">{session.location}</span>
                            </p>
                            <p className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-stone-600 shrink-0" />
                              <span className="text-stone-500 italic">Proposed by {session.proposer}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-row md:flex-col justify-end md:justify-start items-end gap-2 absolute top-4 right-4 md:static">
                          {starsRight && (
                            <button
                              onClick={() => generateICS(session)}
                              className="text-amber-600 hover:text-amber-400 transition-colors p-2 border border-amber-900/30 rounded hover:bg-amber-900/20 bg-[#25221e]"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            onClick={() => setDeletingSessionId(session.id)}
                            className="text-stone-600 hover:text-red-800 transition-colors p-2 bg-[#25221e]"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Voting */}
                      <div className="bg-stone-900/50 p-3 md:p-4 border border-stone-800 mb-4 rounded-sm">
                        <p className="font-display text-[10px] md:text-xs uppercase text-stone-500 mb-3 tracking-widest text-center">
                          Cast your Sign for <span className="text-amber-500 font-bold">{investigatorName}</span>
                        </p>
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleVote(session.id, 'yes')}
                            className={`flex-1 py-3 px-1 md:px-4 border transition-all flex flex-col items-center justify-center gap-1 group/btn rounded-sm touch-manipulation
                              ${userVote === 'yes'
                                ? 'bg-green-900/30 border-green-700 text-green-400'
                                : 'bg-stone-800 border-stone-700 text-stone-500 active:bg-stone-700 hover:md:bg-stone-700'
                              }`}
                          >
                            <CheckCircle2 className={`w-5 h-5 md:w-6 md:h-6 ${userVote === 'yes' ? 'animate-bounce' : ''}`} />
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-tight">Available</span>
                          </button>

                          <button
                            onClick={() => handleVote(session.id, 'maybe')}
                            className={`flex-1 py-3 px-1 md:px-4 border transition-all flex flex-col items-center justify-center gap-1 rounded-sm touch-manipulation
                              ${userVote === 'maybe'
                                ? 'bg-yellow-900/30 border-yellow-700 text-yellow-400'
                                : 'bg-stone-800 border-stone-700 text-stone-500 active:bg-stone-700 hover:md:bg-stone-700'
                              }`}
                          >
                            <HelpCircle className="w-5 h-5 md:w-6 md:h-6" />
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-tight">Uncertain</span>
                          </button>

                          <button
                            onClick={() => handleVote(session.id, 'no')}
                            className={`flex-1 py-3 px-1 md:px-4 border transition-all flex flex-col items-center justify-center gap-1 rounded-sm touch-manipulation
                              ${userVote === 'no'
                                ? 'bg-red-900/30 border-red-700 text-red-400'
                                : 'bg-stone-800 border-stone-700 text-stone-500 active:bg-stone-700 hover:md:bg-stone-700'
                              }`}
                          >
                            <Skull className="w-5 h-5 md:w-6 md:h-6" />
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-tight">Insane</span>
                          </button>
                        </div>
                      </div>

                      {/* Status & Notes */}
                      <div className="border-t border-stone-800 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 text-stone-500 text-xs font-typewriter uppercase">
                            <Users className="w-4 h-4" />
                            <span>Status</span>
                          </div>
                          <button
                            onClick={() => setExpandedNotes(prev => ({ ...prev, [session.id]: !prev[session.id] }))}
                            className="flex items-center gap-1 text-stone-500 hover:text-amber-600 active:text-amber-500 text-xs font-typewriter uppercase transition-colors px-2 py-1 -mr-2"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Notes {session.notes?.length > 0 && `(${session.notes.length})`}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                          {Object.values(session.votes || {}).map((vote, idx) => (
                            <div
                              key={idx}
                              className={`px-2 py-1 rounded-sm border text-[10px] md:text-xs font-typewriter flex items-center gap-1
                                ${vote.status === 'yes' ? 'border-green-900 bg-green-900/10 text-green-600' :
                                  vote.status === 'no' ? 'border-red-900 bg-red-900/10 text-red-700 line-through decoration-red-800' :
                                    'border-yellow-900 bg-yellow-900/10 text-yellow-600'}`}
                            >
                              {vote.status === 'yes' && <Scroll className="w-3 h-3" />}
                              {vote.name}
                            </div>
                          ))}
                          {(!session.votes || Object.keys(session.votes).length === 0) && (
                            <span className="text-stone-600 text-xs italic">The silence is deafening...</span>
                          )}
                        </div>

                        {showNotes && (
                          <div className="mt-4 bg-black/20 p-3 border border-stone-800 rounded-sm">
                            <div className="max-h-48 overflow-y-auto space-y-2 mb-3 scrollbar-thin">
                              {session.notes?.map((note, idx) => (
                                <div key={idx} className="text-xs font-typewriter bg-black/20 p-1.5 rounded border border-stone-800/30">
                                  <span className="text-amber-700 font-bold block text-[10px] uppercase opacity-75">
                                    {note.author}
                                  </span>
                                  <span className="text-stone-300 block mt-0.5">{note.text}</span>
                                </div>
                              ))}
                              {(!session.notes || session.notes.length === 0) && (
                                <p className="text-stone-600 text-xs italic">No notes inscribed yet.</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={noteInputs[session.id] || ""}
                                onChange={(e) => setNoteInputs(prev => ({ ...prev, [session.id]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddNote(session.id)}
                                placeholder="Add a field note..."
                                className="flex-grow bg-stone-900 border border-stone-700 p-2 text-base text-amber-100 font-typewriter focus:border-amber-600 focus:outline-none rounded-sm"
                              />
                              <button
                                onClick={() => handleAddNote(session.id)}
                                className="bg-stone-800 text-stone-400 hover:text-amber-500 p-2 border border-stone-700 rounded-sm"
                              >
                                <Send className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <footer className="mt-16 text-center text-stone-600 text-xs font-typewriter border-t border-stone-800 pt-8 pb-4">
          <p>Ph'nglui mglw'nafh Cthulhu R'lyeh wgah'nagl fhtagn</p>
          <p className="mt-2 opacity-50">System: React + Supabase // Sanity: Critical</p>
        </footer>
      </div>
    </div>
  );
}
