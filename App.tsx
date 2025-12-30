import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Note } from './types';
import { db } from './services/supabase';
import { supabase } from './services/supabaseClient';
import { encryptData, decryptData, encryptFile, decryptFile } from './services/crypto';

// --- INITIAL CONFIGURATION ---
const INITIAL_CATEGORIES = [
  { id: 'all', label: 'All Notes', icon: '📝' },
  { id: 'To Do', label: 'To Do', icon: '✅' },
  { id: 'Urgent', label: 'Urgent', icon: '⚠️' },
  { id: 'Ideas', label: 'Ideas', icon: '💡' },
  { id: 'Work', label: 'Work', icon: '💼' },
  { id: 'Personal', label: 'Personal', icon: '👤' },
  { id: 'Web Catching', label: 'Web Catching', icon: '🌐' },
];

type SortField = 'date' | 'title' | 'category' | 'security' | 'attachments';
type SortOrder = 'asc' | 'desc';

interface SortOption {
  label: string;
  field: SortField;
  order: SortOrder;
  icon: string;
}

const SORT_OPTIONS: SortOption[] = [
  { label: 'Newest First', field: 'date', order: 'desc', icon: '🕒' },
  { label: 'Oldest First', field: 'date', order: 'asc', icon: '⏳' },
  { label: 'Title (A-Z)', field: 'title', order: 'asc', icon: '🔤' },
  { label: 'Title (Z-A)', field: 'title', order: 'desc', icon: '🔤' },
  { label: 'Secure First', field: 'security', order: 'desc', icon: '🔒' },
  { label: 'Standard First', field: 'security', order: 'asc', icon: '📄' },
  { label: 'With Attachments', field: 'attachments', order: 'desc', icon: '📎' },
  { label: 'Category', field: 'category', order: 'asc', icon: '📁' },
];

const COMMON_ICONS = ['📁', '📝', '✅', '⚠️', '💡', '💼', '👤', '🌐', '🏠', '🔑', '🔒', '🛡️', '🏷️', '📌', '📎', '📅', '📊', '⚙️', '🛠️', '🎨', '📚', '🎬', '🎵', '📷', '✈️', '🏆', '🔥', '✨', '💎', '🌈', '🍕', '⚽', '🎮', '🚗', '🏔️', '💰', '✉️', '📱', '🔔'];

// --- FANCY APPLE-STYLE DATE PICKER ---
const FancyDatePicker = ({ value, onChange }: { value: string, onChange: (isoString: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const dateObj = value ? new Date(value) : new Date();
  const [viewDate, setViewDate] = useState(dateObj); 

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  
  const handleDateClick = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day, dateObj.getHours(), dateObj.getMinutes());
    const offset = newDate.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(newDate.getTime() - offset)).toISOString().slice(0, 16);
    onChange(localISOTime);
  };

  const handleTimeChange = (type: 'hours' | 'minutes', val: string) => {
    let num = parseInt(val);
    if (isNaN(num)) return;
    const newDate = new Date(dateObj);
    if (type === 'hours') newDate.setHours(Math.min(23, Math.max(0, num)));
    if (type === 'minutes') newDate.setMinutes(Math.min(59, Math.max(0, num)));
    
    const offset = newDate.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(newDate.getTime() - offset)).toISOString().slice(0, 16);
    onChange(localISOTime);
  };

  const displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const displayTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className={`flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl transition-all text-xs font-medium hover:bg-white/10 hover:border-white/20 ${isOpen ? 'border-amber-500/50 ring-1 ring-amber-500/20' : ''}`}
        title="Change Date & Time"
      >
        <span className="text-zinc-400">📅</span>
        <span className="text-zinc-200">{displayDate}</span>
        <span className="w-px h-3 bg-white/10 mx-1"></span>
        <span className="text-zinc-400 font-mono">{displayTime}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 z-[60] bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl p-4 w-64 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/5">
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))} className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white">◀</button>
            <span className="font-bold text-sm text-white">
              {viewDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))} className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white">▶</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-4 text-center">
            {['S','M','T','W','T','F','S'].map(d => <span key={d} className="text-[10px] font-bold text-zinc-500 mb-1">{d}</span>)}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const isSelected = d === dateObj.getDate() && viewDate.getMonth() === dateObj.getMonth() && viewDate.getFullYear() === dateObj.getFullYear();
              const isToday = d === new Date().getDate() && viewDate.getMonth() === new Date().getMonth() && viewDate.getFullYear() === new Date().getFullYear();
              return (
                <button 
                  key={d} 
                  onClick={() => handleDateClick(d)}
                  className={`w-7 h-7 rounded-full text-xs flex items-center justify-center transition-all ${isSelected ? 'bg-amber-500 text-black font-bold' : isToday ? 'text-amber-500 font-bold' : 'text-zinc-300 hover:bg-white/10'}`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded-lg border border-white/5">
                 <input type="number" min="0" max="23" className="w-6 bg-transparent text-center text-xs text-white outline-none" value={dateObj.getHours().toString().padStart(2, '0')} onChange={e => handleTimeChange('hours', e.target.value)} />
                 <span className="text-zinc-500 text-xs">:</span>
                 <input type="number" min="0" max="59" className="w-6 bg-transparent text-center text-xs text-white outline-none" value={dateObj.getMinutes().toString().padStart(2, '0')} onChange={e => handleTimeChange('minutes', e.target.value)} />
            </div>
            <button onClick={() => {
                const now = new Date(); 
                const off = now.getTimezoneOffset() * 60000;
                onChange(new Date(now.getTime() - off).toISOString().slice(0, 16));
            }} className="text-[10px] font-bold uppercase text-amber-500 hover:text-amber-400">Now</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- IMAGE EDITOR COMPONENT ---
interface ImageEditorProps {
  imageUrl: string;
  fileName: string;
  onSave: (file: File) => void;
  onCancel: () => void;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ imageUrl, fileName, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [activeTool, setActiveTool] = useState<'none' | 'crop' | 'adjust' | 'filter' | 'draw'>('none');
  
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#ffb340');
  const [brushSize, setBrushSize] = useState(5);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      if (canvas && ctx) {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        saveState();
      }
    };
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(imageData);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
    }
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const step = historyStep - 1;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.putImageData(history[step], 0, 0);
        setHistoryStep(step);
      }
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const step = historyStep + 1;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.putImageData(history[step], 0, 0);
        setHistoryStep(step);
      }
    }
  };

  const applyAdjustments = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    tempCtx.putImageData(history[historyStep], 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.filter = 'none'; 
    
    saveState();
    setBrightness(100); setContrast(100); setSaturation(100);
  };

  const handleRotate = (deg: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const image = new Image();
    image.src = canvas.toDataURL();
    image.onload = () => {
      if (deg === 90 || deg === -90) {
        canvas.width = image.height;
        canvas.height = image.width;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      saveState();
    };
  };

  const startDrawing = (e: React.MouseEvent) => {
    if (activeTool !== 'draw') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing || activeTool !== 'draw') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  };

  const handleSave = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], fileName, { type: 'image/png' });
        onSave(file);
      }
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] z-[200] flex flex-col animate-in fade-in duration-300">
      {/* 1. TOP TOOLBAR (Zoom & History) */}
      <div className="h-16 border-b border-white/10 bg-[#121212] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setScale(s => Math.min(s + 0.1, 3))} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white" title="Zoom In"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg></button>
          <button onClick={() => setScale(s => Math.max(s - 0.1, 0.1))} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white" title="Zoom Out"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"/></svg></button>
          <div className="h-6 w-px bg-white/10 mx-2"></div>
          <span className="text-xs font-mono text-zinc-500 w-12 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(1)} className="text-xs font-bold uppercase text-zinc-500 hover:text-white px-2">Reset</button>
          <div className="h-6 w-px bg-white/10 mx-2"></div>
          <button onClick={handleUndo} disabled={historyStep <= 0} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg></button>
          <button onClick={handleRedo} disabled={historyStep >= history.length - 1} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"/></svg></button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-xs font-bold uppercase text-zinc-400 hover:bg-white/10 transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-amber-500 text-black rounded-lg text-xs font-black uppercase tracking-wider hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20">Save Copy</button>
        </div>
      </div>

      {/* 2. CANVAS WORKSPACE */}
      <div className="flex-1 overflow-hidden relative flex items-center justify-center bg-[#050505] p-8">
        <canvas 
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          style={{ transform: `scale(${scale})`, cursor: activeTool === 'draw' ? 'crosshair' : 'default' }}
          className="max-w-full max-h-full border border-white/5 shadow-2xl transition-transform duration-100 ease-out"
        />
        
        {/* Tool Controls Overlay */}
        {activeTool === 'adjust' && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/10 p-4 rounded-2xl flex gap-6 shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="flex flex-col gap-1 items-center">
              <span className="text-[9px] uppercase font-bold text-zinc-500">Brightness</span>
              <input type="range" min="0" max="200" value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-24 accent-amber-500 h-1" />
            </div>
            <div className="flex flex-col gap-1 items-center">
              <span className="text-[9px] uppercase font-bold text-zinc-500">Contrast</span>
              <input type="range" min="0" max="200" value={contrast} onChange={e => setContrast(Number(e.target.value))} className="w-24 accent-amber-500 h-1" />
            </div>
            <div className="flex flex-col gap-1 items-center">
              <span className="text-[9px] uppercase font-bold text-zinc-500">Saturation</span>
              <input type="range" min="0" max="200" value={saturation} onChange={e => setSaturation(Number(e.target.value))} className="w-24 accent-amber-500 h-1" />
            </div>
            <button onClick={applyAdjustments} className="text-[9px] font-black uppercase bg-white/10 hover:bg-white/20 px-3 rounded text-amber-500">Apply</button>
          </div>
        )}

        {activeTool === 'draw' && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/10 p-2 rounded-2xl flex gap-2 shadow-2xl animate-in slide-in-from-bottom-4 items-center">
             <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-none" />
             <input type="range" min="1" max="20" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-24 accent-amber-500" />
             <span className="text-[10px] text-zinc-500 font-bold w-4">{brushSize}</span>
          </div>
        )}
      </div>

      {/* 3. BOTTOM MAIN MENU */}
      <div className="h-20 bg-[#121212] border-t border-white/10 flex items-center justify-center gap-2 md:gap-8 shrink-0 pb-4 md:pb-0">
        <button onClick={() => handleRotate(90)} className="flex flex-col items-center gap-1 p-3 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all w-20">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          <span className="text-[9px] font-bold uppercase tracking-wide">Rotate</span>
        </button>

        <div className="w-px h-10 bg-white/10"></div>

        <button onClick={() => setActiveTool(activeTool === 'adjust' ? 'none' : 'adjust')} className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all w-20 ${activeTool === 'adjust' ? 'bg-amber-500/20 text-amber-500' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          <span className="text-[9px] font-bold uppercase tracking-wide">Adjust</span>
        </button>

        <button onClick={() => {
           const canvas = canvasRef.current;
           const ctx = canvas?.getContext('2d');
           if(canvas && ctx) {
             ctx.filter = 'grayscale(100%)';
             ctx.globalCompositeOperation = 'copy';
             ctx.drawImage(canvas, 0, 0);
             ctx.globalCompositeOperation = 'source-over';
             ctx.filter = 'none';
             saveState();
           }
        }} className="flex flex-col items-center gap-1 p-3 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all w-20">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
          <span className="text-[9px] font-bold uppercase tracking-wide">B&W</span>
        </button>

        <button onClick={() => setActiveTool(activeTool === 'draw' ? 'none' : 'draw')} className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all w-20 ${activeTool === 'draw' ? 'bg-amber-500/20 text-amber-500' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          <span className="text-[9px] font-bold uppercase tracking-wide">Draw</span>
        </button>
      </div>
    </div>
  );
};

// --- HELPER COMPONENTS ---
const LinkifyText: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline break-all" onClick={(e) => e.stopPropagation()}>{part}</a>
        ) : (part)
      )}
    </>
  );
};

const formatRelativeTime = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getFileNameFromPath = (path: string) => path.split('/').pop()?.replace(/^\^\d+_/, '') || 'Unknown File';

const isTextFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['txt', 'md', 'json', 'js', 'ts', 'log', 'html', 'css', 'csv'].includes(ext || '');
};

const isImageFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '');
};

const isPdfFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'pdf';
};

const stripHtml = (html: string) => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
};

// Rich Text Helper
const execCommand = (command: string, value: string = '') => {
  document.execCommand(command, false, value);
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mobile UI Navigation State
  const [mobileView, setMobileView] = useState<'categories' | 'list' | 'note'>('list');

  // Sorting State
  const [sortConfig, setSortConfig] = useState<SortOption>(SORT_OPTIONS[0]);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Selection State
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Vault Security & Indexing
  const [unlockPassword, setUnlockPassword] = useState('');
  const [decryptedCache, setDecryptedCache] = useState<Record<string, { title: string, content: string }>>({});
  const [attachmentTextCache, setAttachmentTextCache] = useState<Record<string, string>>({});
  const [attachmentImageCache, setAttachmentImageCache] = useState<Record<string, string>>({});
  const lockTimerRef = useRef<any>(null);

  // Preview & Editor State
  const [previewData, setPreviewData] = useState<{ url: string; name: string; type: string; text?: string } | null>(null);
  const [isEditingImage, setIsEditingImage] = useState(false);

  // Form States
  const [showPassword, setShowPassword] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', content: '', category: 'Personal', is_encrypted: false, password: '', confirmPassword: '', date: '' });
  const [newNote, setNewNote] = useState({ title: '', content: '', encrypt: false, password: '', confirmPassword: '', category: 'Personal', date: new Date().toISOString().slice(0, 16) });
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  
  // TRACK EXISTING ATTACHMENTS FOR DELETION
  const [existingAttachments, setExistingAttachments] = useState<string[]>([]);
  
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Category Management State
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [catModal, setCatModal] = useState({ isOpen: false, parentId: null as string | null, name: '', icon: '📁' });
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Auth
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [email, setEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  // Initialize editor safely
  useEffect(() => {
    if (isEditing) {
      setTimeout(() => {
        const editor = document.getElementById('edit-note-editor');
        if (editor) {
          editor.innerHTML = editForm.content;
        }
      }, 0);
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, []);

  const fetchNotes = useCallback(async () => {
    if (!session) return;
    try {
      const { data } = await db.getNotes();
      setNotes(data || []);
    } catch (err) {}
  }, [session]);

  const fetchCategories = useCallback(async () => {
    if (!session) return;
    try {
      let data = await db.getCategories();
      if (data && data.length === 0) {
        for (let i = 0; i < INITIAL_CATEGORIES.length; i++) {
          try { await db.insertCategory({ ...INITIAL_CATEGORIES[i], sort_order: i }); } catch (e) {}
        }
        data = await db.getCategories();
      }
      setCategories(data || INITIAL_CATEGORIES);
    } catch (err) {}
  }, [session]);

  useEffect(() => { if (session) { fetchNotes(); fetchCategories(); } }, [session, fetchNotes, fetchCategories]);

  const selectedNote = useMemo(() => notes.find(n => n.id === selectedNoteId) || null, [notes, selectedNoteId]);

  const hierarchicalCategories = useMemo(() => {
    const build = (parentId: string | null = null, depth = 0): any[] => {
      return categories
        .filter(c => c.parent_id === parentId)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .reduce((acc, cat) => {
          const hasChildren = categories.some(c => c.parent_id === cat.id);
          const isExpanded = !!expandedIds[cat.id] || isManagingCategories;
          const items = [{ ...cat, depth, hasChildren, isExpanded }];
          if (isExpanded) {
            items.push(...build(cat.id, depth + 1));
          }
          return [...acc, ...items];
        }, [] as any[]);
    };
    const rootItems = build(null, 0);
    const allIdx = rootItems.findIndex(c => c.id === 'all');
    if (allIdx > 0) {
      const [all] = rootItems.splice(allIdx, 1);
      rootItems.unshift(all);
    }
    return rootItems;
  }, [categories, expandedIds, isManagingCategories]);

  const indexAttachments = useCallback(async (note: Note, password?: string) => {
    if (!note.attachments || note.attachments.length === 0) return;
    
    for (const path of note.attachments) {
      const filename = getFileNameFromPath(path);
      const ext = filename.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 
        'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
        'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown'
      };
      const mimeType = mimeMap[ext || ''] || 'application/octet-stream';
      
      if (isTextFile(filename) && !attachmentTextCache[path]) {
        try {
          const blob = await db.downloadFile(path);
          let finalBlob = blob;
          if (note.is_encrypted && password) {
            finalBlob = await decryptFile(blob, password, mimeType);
          }
          const text = await finalBlob.text();
          setAttachmentTextCache(prev => ({ ...prev, [path]: text }));
        } catch (e) { console.warn(e); }
      } 
      else if (isImageFile(filename) && !attachmentImageCache[path]) {
        try {
          const blob = await db.downloadFile(path);
          let finalBlob = blob;
          if (note.is_encrypted && password) {
            finalBlob = await decryptFile(blob, password, mimeType);
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            setAttachmentImageCache(prev => ({ ...prev, [path]: reader.result as string }));
          };
          reader.readAsDataURL(finalBlob);
        } catch (e) { console.warn(e); }
      }
    }
  }, [attachmentTextCache, attachmentImageCache]);

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      const catMatch = selectedCategory === 'all' || n.category === selectedCategory;
      const query = searchQuery.toLowerCase();
      if (!query) return catMatch;

      const cached = decryptedCache[n.id];
      const title = (cached?.title || n.title || '').toLowerCase();
      const content = (cached?.content || (n.is_encrypted ? '' : n.content) || '').toLowerCase();
      const inTitleOrContent = title.includes(query) || content.includes(query);
      const inFilenames = n.attachments?.some(path => getFileNameFromPath(path).toLowerCase().includes(query));
      const inAttachmentContent = n.attachments?.some(path => attachmentTextCache[path]?.toLowerCase().includes(query));

      return catMatch && (inTitleOrContent || inFilenames || inAttachmentContent);
    }).sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.field) {
        // --- CRITICAL FIX FOR SORTING ---
        case 'date': 
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          // Handle invalid dates nicely so notes don't vanish
          const safeDateA = isNaN(dateA) ? 0 : dateA;
          const safeDateB = isNaN(dateB) ? 0 : dateB;
          comparison = safeDateA - safeDateB; 
          break;
        case 'title':
          const titleA = (decryptedCache[a.id]?.title || a.title || '').toLowerCase();
          const titleB = (decryptedCache[b.id]?.title || b.title || '').toLowerCase();
          comparison = titleA.localeCompare(titleB);
          break;
        case 'category': comparison = (a.category || '').localeCompare(b.category || ''); break;
        case 'security': comparison = (a.is_encrypted === b.is_encrypted) ? 0 : a.is_encrypted ? 1 : -1; break;
        case 'attachments': comparison = (a.attachments?.length || 0) - (b.attachments?.length || 0); break;
      }
      return sortConfig.order === 'desc' ? -comparison : comparison;
    });
  }, [notes, selectedCategory, searchQuery, decryptedCache, attachmentTextCache, sortConfig]);

  const handleSelectNote = (id: string) => {
    setDecryptedCache({});
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    
    setSelectedNoteId(id);
    setIsCreating(false);
    setIsEditing(false);
    setUnlockPassword('');
    setShowPassword(false);
    setStagedFiles([]);
    setMobileView('note'); 
    
    const note = notes.find(n => n.id === id);
    if (note && !note.is_encrypted) {
      indexAttachments(note);
    }
  };

  const handleUnlock = async () => {
    if (!selectedNote) return;
    try {
      const decContent = await decryptData(selectedNote.content, selectedNote.iv!, selectedNote.salt!, unlockPassword);
      setDecryptedCache(prev => ({ ...prev, [selectedNote.id]: { title: selectedNote.title, content: decContent } }));
      indexAttachments(selectedNote, unlockPassword);
      
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        setDecryptedCache({});
        setUnlockPassword('');
        setIsEditing(false);
      }, 60000);
    } catch (err) { alert("Invalid key."); }
  };

  const processFileUploads = async (files: File[], isEncrypted: boolean, password?: string) => {
    const uploadedPaths: string[] = [];
    for (const file of files) {
      let fileToUpload: File | Blob = file;
      if (isEncrypted && password) {
        fileToUpload = await encryptFile(file, password);
      }
      const path = await db.uploadFile(fileToUpload, file.name);
      uploadedPaths.push(path);
    }
    return uploadedPaths;
  };

  const handleSaveNewNote = async () => {
    if (!newNote.title.trim()) return alert("Title required");
    if (newNote.encrypt) {
        if (!newNote.password) return alert("Password required for encryption");
        if (newNote.password !== newNote.confirmPassword) return alert("Passwords do not match!");
    }
    
    setIsUploading(true);
    try {
      const attachmentPaths = await processFileUploads(stagedFiles, newNote.encrypt, newNote.password);
      let payload: any;
      const createdAt = new Date(newNote.date).toISOString();
      if (newNote.encrypt) {
        const contentEnc = await encryptData(newNote.content, newNote.password);
        payload = { 
          title: newNote.title, 
          content: contentEnc.ciphertext, 
          is_encrypted: true, 
          category: newNote.category, 
          iv: contentEnc.iv, 
          salt: contentEnc.salt,
          attachments: attachmentPaths,
          created_at: createdAt
        };
      } else {
        payload = { title: newNote.title, content: newNote.content, category: newNote.category, is_encrypted: false, attachments: attachmentPaths, created_at: createdAt };
      }
      await db.insertNote(payload);
      setNewNote({ title: '', content: '', encrypt: false, password: '', confirmPassword: '', category: 'Personal', date: new Date().toISOString().slice(0, 16) });
      setStagedFiles([]);
      setIsCreating(false);
      
      // Force refresh and clear filters to show new note
      setSelectedCategory('all');
      setSearchQuery('');
      fetchNotes();
      setMobileView('list');
    } catch (err: any) { alert("Error saving: " + err.message); } finally { setIsUploading(false); }
  };

  const handleUpdateNote = async () => {
    if (!selectedNote) return;
    const pwd = editForm.password || unlockPassword;
    if (editForm.is_encrypted && !pwd) return alert("Password required to save encrypted note");

    setIsUploading(true);
    try {
      const newAttachmentPaths = await processFileUploads(stagedFiles, editForm.is_encrypted, pwd);
      // Combine EXISTING (filtered) attachments with NEW attachments
      const combinedAttachments = [...existingAttachments, ...newAttachmentPaths];
      
      const createdAt = new Date(editForm.date).toISOString();
      let payload: any = { title: editForm.title, category: editForm.category, is_encrypted: editForm.is_encrypted, attachments: combinedAttachments, created_at: createdAt };
      if (editForm.is_encrypted) {
        const contentEnc = await encryptData(editForm.content, pwd);
        payload.content = contentEnc.ciphertext; payload.iv = contentEnc.iv; payload.salt = contentEnc.salt;
      } else {
        payload.content = editForm.content; payload.iv = null; payload.salt = null;
      }
      await db.updateNote(selectedNote.id, payload);
      setStagedFiles([]); setIsEditing(false); 
      
      // Force refresh
      fetchNotes();
    } catch (err: any) { alert("Error updating: " + err.message); } finally { setIsUploading(false); }
  };

  const handleDownloadAttachment = async (path: string) => {
    try {
      const blob = await db.downloadFile(path);
      const fileName = getFileNameFromPath(path);
      let finalBlob = blob;
      if (selectedNote?.is_encrypted) {
        if (!unlockPassword) return alert("Vault key required to decrypt file.");
        finalBlob = await decryptFile(blob, unlockPassword);
      }
      const url = window.URL.createObjectURL(finalBlob);
      const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err: any) { alert("Failed to download: " + err.message); }
  };

  const handleOpenPreview = async (path: string) => {
    try {
      const blob = await db.downloadFile(path);
      const fileName = getFileNameFromPath(path);
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 
        'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
        'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown'
      };
      const mimeType = mimeMap[ext || ''] || 'application/octet-stream';

      let finalBlob = blob;
      if (selectedNote?.is_encrypted) {
        if (!unlockPassword) return alert("Vault key required to decrypt preview.");
        finalBlob = await decryptFile(blob, unlockPassword, mimeType);
      } else {
        finalBlob = new Blob([blob], { type: mimeType });
      }

      const type = finalBlob.type;
      const url = window.URL.createObjectURL(finalBlob);
      let textContent = '';
      if (isTextFile(fileName)) {
        textContent = await finalBlob.text();
      }
      setPreviewData({ url, name: fileName, type, text: textContent || undefined });
    } catch (err: any) { alert("Preview failed: " + err.message); }
  };
  
  const handlePreviewStagedFile = (file: File) => {
    if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewData({ url, name: file.name, type: file.type });
    }
  };

  const closePreview = () => {
    if (previewData?.url) window.URL.revokeObjectURL(previewData.url);
    setPreviewData(null);
    setIsEditingImage(false); // Reset edit mode
  };

  // --- Image Editor Save Handler ---
  const handleImageSave = (editedFile: File) => {
    setStagedFiles(prev => [...prev, editedFile]);
    closePreview();
    alert("Edited image staged for upload. Click 'Update Note' to save changes.");
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthLoading(true);
    try {
      if (isSignUpMode) { await db.signUp(email, loginPassword); alert("Check email!"); }
      else { await db.signInWithPassword(email, loginPassword); }
    } catch (err: any) { alert(err.message); } finally { setAuthLoading(false); }
  };

  // --- CHECKBOX TOGGLE HANDLER ---
  const toggleCheckboxState = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
        const input = target as HTMLInputElement;
        if (input.hasAttribute('checked')) {
            input.removeAttribute('checked');
            input.checked = false;
        } else {
            input.setAttribute('checked', 'true');
            input.checked = true;
        }
        const content = e.currentTarget.innerHTML;
        if (isCreating) {
            setNewNote(prev => ({ ...prev, content }));
        } else if (isEditing) {
            setEditForm(prev => ({ ...prev, content }));
        }
    }
  };

  const moveCategory = async (catId: string, direction: 'up' | 'down' | 'top' | 'bottom' | 'left' | 'right') => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    
    if (direction === 'left') {
      const parent = categories.find(c => c.id === cat.parent_id);
      const newParentId = parent ? parent.parent_id : null;
      try {
        await db.updateCategory(cat.id, { parent_id: newParentId, sort_order: 999 });
        fetchCategories();
      } catch (e) { console.error(e); }
      return;
    }

    if (direction === 'right') {
      const siblings = categories.filter(c => c.parent_id === cat.parent_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const sIdx = siblings.findIndex(s => s.id === catId);
      if (sIdx > 0) {
        const newParentId = siblings[sIdx - 1].id;
        try {
          await db.updateCategory(cat.id, { parent_id: newParentId, sort_order: 999 });
          fetchCategories();
        } catch (e) { console.error(e); }
      }
      return;
    }

    const siblings = categories.filter(c => c.parent_id === cat.parent_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const sIdx = siblings.findIndex(s => s.id === catId);
    let newSiblings = [...siblings];
    const [removed] = newSiblings.splice(sIdx, 1);

    if (direction === 'up') newSiblings.splice(Math.max(0, sIdx - 1), 0, removed);
    else if (direction === 'down') newSiblings.splice(Math.min(siblings.length - 1, sIdx + 1), 0, removed);
    else if (direction === 'top') newSiblings.splice(0, 0, removed);
    else if (direction === 'bottom') newSiblings.splice(newSiblings.length, 0, removed);

    const updatedSiblings = newSiblings.map((s, idx) => ({ ...s, sort_order: idx }));

    setCategories(prev => {
      const others = prev.filter(c => c.parent_id !== cat.parent_id);
      return [...others, ...updatedSiblings];
    });

    try {
      await Promise.all(updatedSiblings.map(s => db.updateCategory(s.id, { sort_order: s.sort_order })));
    } catch (err) {
      console.error("Failed to reorder:", err);
      fetchCategories(); 
    }
  };

  const handleCategoryDrop = async (targetId: string) => {
    if (!draggedCatId || draggedCatId === targetId) return;
    
    const sourceCat = categories.find(c => c.id === draggedCatId);
    if (!sourceCat) return;
    const newParentId = targetId === 'all' ? null : targetId;
    
    try {
      await db.updateCategory(draggedCatId, { parent_id: newParentId, sort_order: 999 });
      fetchCategories();
    } catch (err) {
      console.error("Failed to drop:", err);
      fetchCategories();
    }
    setDraggedCatId(null);
  };

  const handleAddCategory = (parentId: string | null = null) => {
    setCatModal({ isOpen: true, parentId, name: '', icon: '📁' });
  };

  const submitNewCategory = async () => {
    const { name, icon, parentId } = catModal;
    if (!name.trim()) return alert("Please enter a category name.");
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
    try {
      const siblings = categories.filter(c => c.parent_id === parentId);
      await db.insertCategory({ id, label: name, icon, sort_order: siblings.length, parent_id: parentId });
      setCatModal({ ...catModal, isOpen: false });
      fetchCategories();
    } catch (err: any) { alert(err.message); }
  };

  const handleUpdateCategory = async (id: string, label: string, icon: string) => {
    try {
      await db.updateCategory(id, { label, icon });
      fetchCategories();
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteCategory = async (id: string) => {
    if (id === 'all') return alert("Cannot delete 'All Notes'");
    if (!confirm("Are you sure? Notes in this category will not be deleted, but they will lose this tag.")) return;
    try {
      await db.deleteCategory(id);
      if (selectedCategory === id) setSelectedCategory('all');
      fetchCategories();
    } catch (err: any) { alert(err.message); }
  };

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCategoryClick = (id: string) => {
    setSelectedCategory(id);
    setMobileView('list');
    if (categories.some(c => c.parent_id === id)) {
      setExpandedIds(prev => ({ ...prev, [id]: true }));
    }
  };

  const FormattingToolbar = () => (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-[#edf2fa] border-b border-[#c7c7c7] sticky top-0 z-50 w-full rounded-t-xl text-[#444746] shadow-sm">
      <div className="flex items-center gap-0.5 pr-2 mr-2 border-r border-[#c7c7c7]">
        <button onMouseDown={e => { e.preventDefault(); execCommand('undo'); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Undo">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.17 8 12.5 8z"/></svg>
        </button>
        <button onMouseDown={e => { e.preventDefault(); execCommand('redo'); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Redo">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.67 0-8.58 3.03-9.96 7.22l2.37.78c1.05-3.19 4.05-5.5 7.59-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
        </button>
        <button onMouseDown={e => { e.preventDefault(); window.print(); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Print">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 8h-1V3H6v5H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zM8 5h8v3H8V5zm8 12v2H8v-4h8v2zm2-2v-2H6v2H4v-4c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v4h-2z"/><circle cx="18" cy="11.5" r="1"/></svg>
        </button>
      </div>

      <div className="flex items-center pr-2 mr-2 border-r border-[#c7c7c7] h-6">
        <select onChange={(e) => execCommand('formatBlock', e.target.value)} className="bg-transparent text-xs font-medium outline-none cursor-pointer hover:bg-[#1f1f1f]/5 rounded px-2 h-full text-[#444746]" defaultValue="p">
          <option value="p">Normal text</option>
          <option value="h1">Title</option>
          <option value="h2">Heading 1</option>
          <option value="h3">Heading 2</option>
          <option value="pre">Code Block</option>
        </select>
      </div>

      <div className="flex items-center pr-2 mr-2 border-r border-[#c7c7c7] h-6">
        <select onChange={(e) => execCommand('fontName', e.target.value)} className="bg-transparent text-xs font-medium outline-none cursor-pointer hover:bg-[#1f1f1f]/5 rounded px-2 h-full w-24 truncate text-[#444746]" defaultValue="Arial">
          <option value="Inter">Inter</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Courier</option>
          <option value="Times New Roman">Times New Roman</option>
        </select>
      </div>

      <div className="flex items-center gap-0.5 pr-2 mr-2 border-r border-[#c7c7c7]">
        <button onMouseDown={e => { e.preventDefault(); execCommand('bold'); }} className="w-7 h-7 flex items-center justify-center hover:bg-[#1f1f1f]/5 rounded font-bold text-sm" title="Bold">B</button>
        <button onMouseDown={e => { e.preventDefault(); execCommand('italic'); }} className="w-7 h-7 flex items-center justify-center hover:bg-[#1f1f1f]/5 rounded italic text-sm font-serif" title="Italic">I</button>
        <button onMouseDown={e => { e.preventDefault(); execCommand('underline'); }} className="w-7 h-7 flex items-center justify-center hover:bg-[#1f1f1f]/5 rounded underline text-sm" title="Underline">U</button>
        
        <div className="relative group flex items-center justify-center w-7 h-7 hover:bg-[#1f1f1f]/5 rounded cursor-pointer" title="Text Color">
          <span className="font-bold text-sm border-b-4 border-black pb-0.5 leading-none">A</span>
          <input type="color" onChange={e => execCommand('foreColor', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </div>
        
        <div className="relative group flex items-center justify-center w-7 h-7 hover:bg-[#1f1f1f]/5 rounded cursor-pointer ml-1" title="Highlight Color">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M15.245 13.966l2.755 2.754-6 6L3.29 14.01c-.78-.78-.78-2.05 0-2.83l2.755-2.754 9.2 5.54zm-1.41-10.636l2.12-2.12c.78-.78 2.05-.78 2.83 0l2.83 2.828c.78.78.78 2.05 0 2.828l-2.122 2.122-5.658-5.657zM3.6 19.3l1.1.9c-2.3 1.1-2.9-.5-2.9-.5l1.8-.4z"/></svg>
           <input type="color" onChange={e => execCommand('hiliteColor', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <button onMouseDown={e => { e.preventDefault(); const url = prompt('Enter URL:'); if (url) execCommand('createLink', url); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Insert Link">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
        </button>
        
        <button onMouseDown={e => { e.preventDefault(); execCommand('justifyLeft'); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Align Left">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>
        </button>
        
        <button onMouseDown={e => { e.preventDefault(); execCommand('justifyCenter'); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Align Center">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>
        </button>

        <button onMouseDown={e => { e.preventDefault(); execCommand('justifyRight'); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Align Right">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>
        </button>

        <button onMouseDown={e => { e.preventDefault(); execCommand('insertHTML', '<input type="checkbox" style="margin-right: 8px; transform: scale(1.2);" />&nbsp;'); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Insert Checkbox">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </button>

        <button onMouseDown={e => { e.preventDefault(); execCommand('insertUnorderedList'); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors" title="Bullet List">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
        </button>

        <button onMouseDown={e => { e.preventDefault(); execCommand('removeFormat'); }} className="p-1.5 hover:bg-[#1f1f1f]/5 rounded transition-colors ml-1 text-red-500/70 hover:text-red-600" title="Clear Formatting">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21l1.27-1.27-12.28-12.28 1.95-1.95 2.5 2.5h-5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z"/></svg>
        </button>
      </div>
    </div>
  );

  if (isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin" /></div>;

  if (!session) {
    return (
      <div className="min-h-screen flex bg-[#0a0414] text-white relative overflow-hidden font-sans selection:bg-amber-500/30">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-500/5 blur-[120px] rounded-full" />
        <div className="absolute top-10 left-10 flex items-center gap-3 z-20">
          <div className="w-10 h-10 bg-[#ffb143] rounded-xl flex items-center justify-center text-black font-black text-xl shadow-[0_0_20px_rgba(255,177,67,0.2)]">V</div>
          <span className="font-black text-2xl tracking-tighter">Vault</span>
        </div>
        <div className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 z-10 px-8 relative h-screen">
          <div className="hidden lg:flex flex-col justify-center">
            <h1 className="text-[120px] font-black leading-[0.85] tracking-tighter mb-16 text-white drop-shadow-2xl">
              Secure.<br />Private.<br />Yours.
            </h1>
            <div className="space-y-12">
              <div className="flex items-center gap-5">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">🛡️</div>
                <div>
                  <h3 className="font-bold text-lg">Zero-Knowledge</h3>
                  <p className="text-white/40 text-sm">Military-grade AES-256 encryption happens locally. We never see your data.</p>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">☁️</div>
                <div>
                  <h3 className="font-bold text-lg">Instant SaaS Sync</h3>
                  <p className="text-white/40 text-sm">Access your notes across all devices with real-time encrypted cloud backup.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-[480px] bg-white/[0.04] backdrop-blur-3xl border border-white/[0.08] rounded-[48px] p-12 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
              <div className="mb-12">
                <h2 className="text-4xl font-black tracking-tight mb-2">{isSignUpMode ? 'Get Started' : 'Welcome Back'}</h2>
                <p className="text-white/40 font-medium text-sm">Please enter your details to continue.</p>
              </div>
              <form onSubmit={handleAuthSubmit} className="space-y-8" autoComplete="off">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 ml-1">Identify</label>
                  <input type="email" placeholder="Enter your email" autoComplete="off" className="w-full bg-[#ebf2ff]/90 border-none rounded-2xl py-5 px-6 text-[#0a0414] font-medium outline-none placeholder:text-zinc-400 transition-all focus:ring-2 focus:ring-amber-500/20" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 ml-1">Secret Key</label>
                  <input type="text" placeholder="Enter password" autoComplete="off" spellCheck={false} className="secure-input-field w-full bg-[#ebf2ff]/90 border-none rounded-2xl py-5 px-6 text-[#0a0414] font-medium outline-none placeholder:text-zinc-400 transition-all focus:ring-2 focus:ring-amber-500/20" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
                </div>
                <button disabled={authLoading} className="w-full bg-[#ffb143] hover:bg-[#ffba5a] text-black font-black py-5 rounded-2xl transition-all disabled:opacity-50 shadow-[0_12px_30px_rgba(255,177,67,0.2)] flex items-center justify-center gap-2 group">
                  {authLoading ? 'Verifying...' : (isSignUpMode ? 'Join Vault →' : 'Enter Vault →')}
                </button>
              </form>
              <div className="mt-12 text-center">
                <p className="text-zinc-500 text-[11px] font-bold uppercase mb-2">Don't have access yet?</p>
                <button onClick={() => setIsSignUpMode(!isSignUpMode)} className="text-white hover:text-amber-500 font-black text-sm uppercase tracking-widest transition-colors">
                  {isSignUpMode ? 'Log In Instead' : 'Request Access'}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 lg:left-10 lg:translate-x-0 flex flex-wrap justify-center lg:justify-start items-center gap-4 lg:gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-white/20 w-full lg:w-auto px-6 lg:px-0 z-20">
          <span>Privacy Focused</span>
          <span>Zero Knowledge</span>
          <span>AES-256</span>
          <span className="text-amber-500/40">© {new Date().getFullYear()} TM Loum</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#050505] text-[#e0e0e0] font-sans overflow-hidden">
      {/* Sidebar - Categories */}
      <aside className={`${mobileView === 'categories' ? 'flex' : 'hidden'} md:flex w-full md:w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl flex-col shrink-0 z-30`}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-black font-black">V</div>
            <span className="font-black text-xl tracking-tight">Vault</span>
          </div>
          <button onClick={() => setIsManagingCategories(!isManagingCategories)} className={`text-[10px] font-black uppercase px-2 py-1 rounded-md transition-all ${isManagingCategories ? 'bg-amber-500 text-black' : 'text-zinc-600 hover:text-white'}`}>
            {isManagingCategories ? 'Done' : 'Edit'}
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
          {hierarchicalCategories.map((cat, idx) => (
            <div key={cat.id} className="group relative">
              {isManagingCategories ? (
                <div 
                  className={`flex items-center gap-1.5 p-2 bg-white/5 rounded-xl border mb-1 animate-in slide-in-from-left-2 relative cursor-move ${draggedCatId === cat.id ? 'opacity-20' : 'opacity-100 border-white/5 hover:border-amber-500/30'}`}
                  style={{ marginLeft: `${cat.depth * 12}px` }}
                  draggable={true}
                  onDragStart={() => setDraggedCatId(cat.id)}
                  onDragEnd={() => setDraggedCatId(null)}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-amber-500'); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('border-amber-500'); }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-amber-500'); handleCategoryDrop(cat.id); }}
                >
                  {cat.depth > 0 && <div className="absolute left-[-6px] top-0 bottom-0 w-px bg-white/10" />}
                  <input type="text" defaultValue={cat.icon} autoComplete="off" className="w-8 bg-black/40 border-none text-center rounded-lg text-sm p-1 outline-none" onBlur={(e) => handleUpdateCategory(cat.id, cat.label, e.target.value)} />
                  <input type="text" defaultValue={cat.label} autoComplete="off" className="flex-1 min-w-0 bg-transparent border-none text-[10px] font-bold outline-none" onBlur={(e) => handleUpdateCategory(cat.id, e.target.value, cat.icon)} />
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button onClick={() => moveCategory(cat.id, 'top')} className="text-[8px] opacity-20 hover:opacity-100" title="To Top">⤒</button>
                    <div className="flex gap-1">
                       <button onClick={() => moveCategory(cat.id, 'left')} className="text-[8px] opacity-30 hover:opacity-100" title="Outdent (Move to Root)">⇠</button>
                       <button onClick={() => moveCategory(cat.id, 'up')} className="text-[8px] opacity-30 hover:opacity-100">▲</button>
                       <button onClick={() => moveCategory(cat.id, 'down')} className="text-[8px] opacity-30 hover:opacity-100">▼</button>
                       <button onClick={() => moveCategory(cat.id, 'right')} className="text-[8px] opacity-30 hover:opacity-100" title="Indent (Subcategory)">⇢</button>
                    </div>
                    <button onClick={() => moveCategory(cat.id, 'bottom')} className="text-[8px] opacity-20 hover:opacity-100" title="To Bottom">⤓</button>
                  </div>
                  <button onClick={() => handleAddCategory(cat.id)} className="text-[8px] font-black uppercase bg-white/5 px-1 rounded hover:bg-amber-500 hover:text-black transition-colors" title="Add Subcategory">+Sub</button>
                  {cat.id !== 'all' && (
                    <button onClick={() => handleDeleteCategory(cat.id)} className="text-[10px] text-red-500/50 hover:text-red-500 transition-colors ml-1 shrink-0">✕</button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {cat.hasChildren && (
                    <button onClick={(e) => toggleExpand(e, cat.id)} className={`text-[8px] transition-transform duration-200 opacity-40 hover:opacity-100 ${cat.isExpanded ? 'rotate-90' : ''}`}>▶</button>
                  )}
                  {!cat.hasChildren && cat.depth > 0 && <div className="w-[10px]" />}
                  <button onClick={() => handleCategoryClick(cat.id)} className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm font-medium ${selectedCategory === cat.id ? 'bg-white/10 text-[#ffb340]' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}`} style={{ paddingLeft: `${cat.depth * 12 + 16}px` }}>
                    <span className="text-base">{cat.icon}</span> {cat.label}
                  </button>
                </div>
              )}
            </div>
          ))}
          {isManagingCategories && (
            <button onClick={() => handleAddCategory(null)} className="w-full py-2.5 border-2 border-dashed border-white/5 rounded-xl text-[10px] font-black uppercase text-zinc-700 hover:text-zinc-500 hover:border-white/10 transition-all mt-2">+ New Root Category</button>
          )}
        </nav>
        <div className="md:hidden p-4">
           <button onClick={() => setMobileView('list')} className="w-full py-2.5 bg-white/5 rounded-xl text-xs font-black uppercase text-zinc-400">Close Menu</button>
        </div>
        <div className="p-4 border-t border-white/5"><button onClick={() => db.signOut()} className="w-full py-2.5 text-xs font-black uppercase text-zinc-600 hover:text-zinc-400">Sign Out</button></div>
      </aside>

      {/* Note List */}
      <section className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-[350px] border-r border-white/5 bg-[#0a0a0a] flex-col shrink-0 z-20`}>
        <div className="p-6 pb-4">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
               <button onClick={() => setMobileView('categories')} className="md:hidden text-zinc-400 hover:text-white">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
               </button>
               <h2 className="text-2xl font-black tracking-tight">{categories.find(c => c.id === selectedCategory)?.label || 'Notes'}</h2>
            </div>
            <button onClick={() => { setIsCreating(true); setSelectedNoteId(null); setStagedFiles([]); setExistingAttachments([]); setMobileView('note'); setShowPassword(false); setNewNote(prev => ({...prev, confirmPassword: ''})); }} className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 active:scale-95 group">
              <svg className="w-4 h-4 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              <span>New Note</span>
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              <input type="text" placeholder="Deep search..." autoComplete="off" className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm focus:border-amber-500/50 outline-none transition-all placeholder-zinc-700" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <span className="absolute left-3 top-2.5 text-zinc-600 text-xs">🔍</span>
            </div>
            <div className="relative" ref={sortDropdownRef}>
              <button onClick={() => setIsSortOpen(!isSortOpen)} className={`p-2.5 rounded-xl border transition-all ${isSortOpen ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`} title="Sort Notes">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
              </button>
              {isSortOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-[#121212]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-600">Sort Workspace By</div>
                  <div className="mt-1 space-y-0.5">
                    {SORT_OPTIONS.map((opt, idx) => (
                      <button key={idx} onClick={() => { setSortConfig(opt); setIsSortOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all hover:bg-white/5 ${sortConfig.label === opt.label ? 'text-amber-400 bg-amber-500/5' : 'text-zinc-400 hover:text-zinc-100'}`}>
                        <span className="text-lg w-6 flex justify-center">{opt.icon}</span>
                        <span className="flex-1 text-left font-medium">{opt.label}</span>
                        {sortConfig.label === opt.label && <span className="text-[10px] font-black uppercase text-amber-500">Active</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredNotes.length === 0 ? (
            <div className="p-10 text-center text-zinc-600 text-sm italic">No entries match your search</div>
          ) : (
            filteredNotes.map(note => {
              const isSelected = selectedNoteId === note.id;
              const cached = decryptedCache[note.id];
              const title = cached?.title || note.title || 'Untitled';
              const rawPreview = stripHtml(cached?.content || (note.is_encrypted ? 'Encrypted Content' : note.content));
              const preview = rawPreview || (note.is_encrypted ? 'Encrypted Content' : 'Empty note');
              const matchedInAttachments = searchQuery && note.attachments?.some(p => {
                const name = getFileNameFromPath(p).toLowerCase();
                const text = attachmentTextCache[p]?.toLowerCase() || '';
                return name.includes(searchQuery.toLowerCase()) || text.includes(searchQuery.toLowerCase());
              });

              return (
                <div key={note.id} onClick={() => handleSelectNote(note.id)} className={`px-6 py-5 border-b border-white/5 cursor-pointer transition-all ${isSelected ? 'bg-amber-500/10' : 'hover:bg-white/5'}`}>
                  <div className="flex justify-between items-start mb-1.5">
                    <h3 className={`font-bold truncate pr-4 text-sm transition-colors ${isSelected ? 'text-amber-400' : 'text-zinc-200'}`}>{title}</h3>
                    <span className="text-[9px] text-zinc-600 font-bold uppercase shrink-0 mt-0.5">{formatRelativeTime(note.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed opacity-60 italic">{preview}</p>
                  {matchedInAttachments && (
                    <div className="mt-2 text-[9px] font-black uppercase text-amber-500/60 flex items-center gap-1.5">
                      <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" /> Match in attachments
                    </div>
                  )}
                  <div className="mt-3 flex gap-4 items-center">
                    <div className="flex items-center gap-2.5">
                      {note.is_encrypted && <span className={`text-[10px] transition-all ${isSelected ? 'text-amber-400' : 'opacity-30'}`} title="Protected">🔒</span>}
                      {note.attachments && note.attachments.length > 0 && (
                        <span className={`text-[10px] transition-all flex items-center gap-1 ${isSelected ? 'text-amber-400' : 'opacity-30'}`} title={`${note.attachments.length} Files`}>📎 <span className="text-[8px] font-black">{note.attachments.length}</span></span>
                      )}
                    </div>
                    <div className="flex-1" />
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${isSelected ? 'border-amber-500/40 text-amber-500' : 'border-white/5 text-zinc-700'}`}>{note.category}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Note Content / Creation Area */}
      <main className={`${mobileView === 'note' ? 'block' : 'hidden'} md:block flex-1 bg-[#050505] relative overflow-hidden z-10`}>
        {isCreating ? (
          <div className="h-full flex flex-col bg-[#0c0c0c] relative animate-in fade-in duration-300">
            {/* 1. TOP BAR: Title & Actions */}
            <div className="px-6 py-4 border-b border-white/5 bg-[#121212] flex items-center justify-between shrink-0 gap-4">
               <input 
                  autoFocus placeholder="Untitled Document"
                  autoComplete="off"
                  className="text-xl md:text-2xl font-bold bg-transparent border-none outline-none placeholder-zinc-700 w-full text-zinc-200"
                  value={newNote.title} onChange={e => setNewNote({...newNote, title: e.target.value})}
               />
               <div className="flex items-center gap-3">
                  <button onClick={() => { setIsCreating(false); setMobileView('list'); }} className="text-xs font-bold text-zinc-500 hover:text-zinc-300 px-3 py-2 rounded-lg hover:bg-white/5">Discard</button>
                  <button onClick={handleSaveNewNote} disabled={isUploading} className="bg-amber-500 text-black px-6 py-2 rounded-lg font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all">
                    {isUploading ? 'Saving...' : 'Save Note'}
                  </button>
               </div>
            </div>

            {/* 2. SETTINGS BAR (Moved to Top) */}
            <div className="bg-[#121212] border-b border-white/5 p-3 flex flex-wrap gap-4 items-center justify-center shrink-0 z-50 text-xs">
                <button onClick={() => setNewNote({...newNote, encrypt: !newNote.encrypt})} className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all ${newNote.encrypt ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' : 'border-white/10 text-zinc-500 hover:border-white/20'}`}>
                   <span>{newNote.encrypt ? '🔒 Encrypted' : '🔓 Standard'}</span>
                </button>
                {newNote.encrypt && (
                  <div className="flex items-center gap-2 bg-black/20 border border-white/10 rounded px-2 py-0.5">
                     <input 
                       type="text" 
                       placeholder="Set Password" 
                       value={newNote.password} 
                       onChange={e => setNewNote({...newNote, password: e.target.value})} 
                       className={`bg-transparent outline-none w-24 md:w-32 ${showPassword ? '' : 'secure-input-field'}`} 
                     />
                     <div className="w-px h-4 bg-white/10"></div>
                     <input 
                       type="text" 
                       placeholder="Confirm" 
                       value={newNote.confirmPassword} 
                       onChange={e => setNewNote({...newNote, confirmPassword: e.target.value})} 
                       className={`bg-transparent outline-none w-24 md:w-32 ${showPassword ? '' : 'secure-input-field'}`} 
                     />
                     <button onClick={() => setShowPassword(!showPassword)} className="text-zinc-500 hover:text-white" title={showPassword ? 'Hide' : 'Show'}>
                        {showPassword ? (
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                     </button>
                  </div>
                )}
                <div className="h-4 w-px bg-white/10"></div>
                <FancyDatePicker value={newNote.date} onChange={(val) => setNewNote({...newNote, date: val})} />
                <div className="h-4 w-px bg-white/10"></div>
                <select className="bg-transparent text-zinc-400 outline-none cursor-pointer hover:text-zinc-200" value={newNote.category} onChange={e => setNewNote({...newNote, category: e.target.value})}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div className="h-4 w-px bg-white/10"></div>
                <button onClick={() => fileInputRef.current?.click()} className="text-zinc-400 hover:text-white flex items-center gap-1">
                   <span>📎 Attach ({stagedFiles.length})</span>
                </button>
                {/* --- GLOBAL FILE INPUT MOVED HERE --- */}
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                      setStagedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                      e.target.value = ''; // Reset so same file can be selected again
                  }
                }} />
            </div>

            {/* 3. TOOLBAR */}
            <div className="shrink-0 bg-[#1a1a1a] z-40">
               <FormattingToolbar />
            </div>

            {/* 4. SCROLLABLE DESK AREA */}
            <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center p-4 md:p-12 bg-[#0a0a0a] cursor-text" onClick={() => document.getElementById('new-note-editor')?.focus()}>
                {/* 5. THE PAGE */}
                <div className="w-full max-w-[850px] min-h-[1000px] bg-[#1a1a1a] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col relative border border-white/5" onClick={(e) => e.stopPropagation()}>
                    <div 
                      id="new-note-editor"
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck={false}
                      onClick={toggleCheckboxState}
                      onInput={e => setNewNote({...newNote, content: e.currentTarget.innerHTML})}
                      data-placeholder="Start writing..."
                      className="flex-1 p-12 md:p-16 outline-none text-lg leading-[1.8] text-zinc-300 rich-text-content selection:bg-amber-500/30"
                    />
                </div>
            </div>
            
            {/* Staged Files (New Uploads) - CLICKABLE TO EDIT */}
            {stagedFiles.length > 0 && (
              <div className="mb-6 p-4 md:p-5 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-md fixed bottom-20 right-10 z-50 w-64 shadow-2xl">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  Staged ({stagedFiles.length})
                </h4>
                <div className="flex flex-col gap-2">
                  {stagedFiles.map((f, i) => (
                    <div key={i} onClick={() => {
                        if (f.type.startsWith('image/')) {
                            const url = URL.createObjectURL(f);
                            setPreviewData({ url, name: f.name, type: f.type });
                            setIsEditingImage(true);
                        }
                    }} className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-xl text-xs border border-white/10 group hover:border-amber-500/40 transition-colors cursor-pointer" title="Click to Edit">
                      <span className="text-zinc-400">{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                      <span className="truncate max-w-[150px] font-medium">{f.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); setStagedFiles(prev => prev.filter((_, idx) => idx !== i)); }} className="text-zinc-600 hover:text-red-400 transition-colors ml-auto">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : selectedNote ? (
          <div className="h-full flex flex-col">
            {selectedNote.is_encrypted && !decryptedCache[selectedNote.id] ? (
              <div className="h-full flex flex-col items-center justify-center gap-10 animate-in fade-in duration-700 p-6 md:p-12">
                <button onClick={() => setMobileView('list')} className="md:hidden absolute top-6 left-6 text-zinc-400 font-bold text-sm flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg> Back
                </button>
                <div className="text-[80px] md:text-[120px] leading-none opacity-5 animate-pulse">🔒</div>
                <div className="text-center space-y-4">
                  <h3 className="text-3xl md:text-4xl font-black tracking-tighter">Vault Protected</h3>
                  <p className="text-zinc-500 max-w-xs md:max-w-sm mx-auto font-medium text-sm md:text-base">This entry is locally encrypted with AES-256-GCM. We do not have your key.</p>
                </div>
                <div className="flex flex-col gap-4 w-full max-w-md">
                  <input type="text" placeholder="Enter Access Key" autoFocus autoComplete="off" spellCheck={false} className="secure-input-field w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-center text-xl outline-none focus:border-amber-500/50 transition-all placeholder-white/10" value={unlockPassword} onChange={e => setUnlockPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUnlock()} />
                  <button onClick={handleUnlock} className="w-full bg-amber-500 text-black py-4 rounded-2xl font-black text-lg transition-all hover:bg-amber-400 shadow-xl shadow-amber-500/10">Unlock Identity</button>
                </div>
              </div>
            ) : isEditing ? (
              <div className="h-full flex flex-col bg-[#0c0c0c] relative animate-in fade-in duration-300">
                {/* 1. TOP BAR */}
                <div className="px-6 py-4 border-b border-white/5 bg-[#121212] flex items-center justify-between shrink-0 gap-4">
                   <input 
                      autoFocus placeholder="Untitled"
                      autoComplete="off"
                      className="text-xl md:text-2xl font-bold bg-transparent border-none outline-none placeholder-zinc-700 w-full text-zinc-200"
                      value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})}
                   />
                   <div className="flex items-center gap-3">
                      <button onClick={() => setIsEditing(false)} className="text-xs font-bold text-zinc-500 hover:text-zinc-300 px-3 py-2 rounded-lg hover:bg-white/5">Cancel</button>
                      <button onClick={handleUpdateNote} disabled={isUploading} className="bg-amber-500 text-black px-6 py-2 rounded-lg font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all">
                        {isUploading ? 'Saving...' : 'Save Changes'}
                      </button>
                   </div>
                </div>
    
                {/* 2. SETTINGS BAR (Moved to Top) */}
                <div className="bg-[#121212] border-b border-white/5 p-3 flex gap-4 items-center justify-center shrink-0 z-50 text-xs">
                    <button onClick={() => setEditForm({...editForm, is_encrypted: !editForm.is_encrypted})} className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all ${editForm.is_encrypted ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' : 'border-white/10 text-zinc-500 hover:border-white/20'}`}>
                       <span>{editForm.is_encrypted ? '🔒 Encrypted' : '🔓 Standard'}</span>
                    </button>
                    {editForm.is_encrypted && (
                      <div className="flex items-center gap-2 bg-black/20 border border-white/10 rounded px-2 py-0.5">
                         <input type="text" placeholder="New Password" value={editForm.password} onChange={e => setEditForm({...editForm, password: e.target.value})} className={`bg-transparent outline-none w-24 md:w-32 ${showPassword ? '' : 'secure-input-field'}`} />
                         {editForm.password && (
                             <>
                               <div className="w-px h-4 bg-white/10"></div>
                               <input type="text" placeholder="Confirm" value={editForm.confirmPassword} onChange={e => setEditForm({...editForm, confirmPassword: e.target.value})} className={`bg-transparent outline-none w-24 md:w-32 ${showPassword ? '' : 'secure-input-field'}`} />
                             </>
                         )}
                         <button onClick={() => setShowPassword(!showPassword)} className="text-zinc-500 hover:text-white" title={showPassword ? 'Hide' : 'Show'}>
                            {showPassword ? (
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            ) : (
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            )}
                         </button>
                      </div>
                    )}
                    <div className="h-4 w-px bg-white/10"></div>
                    <FancyDatePicker value={editForm.date} onChange={(val) => setEditForm({...editForm, date: val})} />
                    <div className="h-4 w-px bg-white/10"></div>
                    <select className="bg-transparent text-zinc-400 outline-none cursor-pointer hover:text-zinc-200" value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})}>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <div className="h-4 w-px bg-white/10"></div>
                    <button onClick={() => fileInputRef.current?.click()} className="text-zinc-400 hover:text-white flex items-center gap-1">
                       <span>📎 Add Attachment</span>
                    </button>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                          setStagedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                          e.target.value = '';
                      }
                    }} />
                </div>

                {/* 3. TOOLBAR */}
                <div className="shrink-0 bg-[#1a1a1a] z-40">
                   <FormattingToolbar />
                </div>
    
                {/* 4. SCROLLABLE DESK AREA */}
                <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center p-4 md:p-12 bg-[#0a0a0a] cursor-text" onClick={() => document.getElementById('edit-note-editor')?.focus()}>
                    {/* 5. THE PAGE */}
                    <div className="w-full max-w-[850px] min-h-[1000px] bg-[#1a1a1a] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col relative border border-white/5" onClick={(e) => e.stopPropagation()}>
                        <div 
                          id="edit-note-editor"
                          contentEditable
                          suppressContentEditableWarning
                          spellCheck={false}
                          onClick={toggleCheckboxState}
                          onInput={e => setEditForm({...editForm, content: e.currentTarget.innerHTML})}
                          data-placeholder="Start writing..."
                          className="flex-1 p-12 md:p-16 outline-none text-lg leading-[1.8] text-zinc-300 rich-text-content selection:bg-amber-500/30"
                        />
                    </div>
                </div>

                {/* Staged Files (New Uploads) - CLICKABLE */}
                {stagedFiles.length > 0 && (
                  <div className="mb-6 p-4 md:p-5 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-md fixed bottom-20 right-10 z-50 w-64 shadow-2xl">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                      Staged for Update ({stagedFiles.length})
                    </h4>
                    <div className="flex flex-col gap-2">
                      {stagedFiles.map((f, i) => (
                        <div key={i} onClick={() => {
                             if (f.type.startsWith('image/')) {
                                 const url = URL.createObjectURL(f);
                                 setPreviewData({ url, name: f.name, type: f.type });
                                 setIsEditingImage(true);
                             }
                        }} className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-xl text-xs border border-white/10 group hover:border-amber-500/40 transition-colors cursor-pointer" title="Click to Edit">
                          <span className="text-zinc-400">{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                          <span className="truncate max-w-[150px] font-medium">{f.name}</span>
                          <button onClick={(e) => { e.stopPropagation(); setStagedFiles(prev => prev.filter((_, idx) => idx !== i)); }} className="text-zinc-600 hover:text-red-400 transition-colors ml-auto">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* EXISTING ATTACHMENTS (Missing Piece Added Here) */}
                {existingAttachments && existingAttachments.length > 0 && (
                  <div className="mt-4 p-4 md:p-5 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-md">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4 flex items-center gap-2">
                      <span className="text-lg">📎</span>
                      Existing Attachments ({existingAttachments.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {existingAttachments.map((path, idx) => {
                        const filename = getFileNameFromPath(path);
                        const isText = isTextFile(filename);
                        const isImage = isImageFile(filename);
                        const isPdf = isPdfFile(filename);
                        const isIndexed = !!attachmentTextCache[path] || !!attachmentImageCache[path];
                        return (
                          <div key={idx} className="flex flex-col p-2 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-amber-500/30 transition-all text-left group relative overflow-hidden">
                            {isImage && attachmentImageCache[path] && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-black/20 border border-white/5"><img src={attachmentImageCache[path]} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Preview" /></div>
                            )}
                            {isText && attachmentTextCache[path] && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-black/40 border border-white/5 p-3 text-[9px] font-mono text-zinc-500 opacity-80 leading-tight custom-scrollbar overflow-y-auto whitespace-pre-wrap">{attachmentTextCache[path].slice(0, 500)}{attachmentTextCache[path].length > 500 && '...'}</div>
                            )}
                            {isPdf && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-red-500/5 border border-white/5 flex items-center justify-center"><span className="text-4xl">📄</span><span className="absolute text-[8px] font-black uppercase text-red-500">PDF Document</span></div>
                            )}
                            <div className="flex items-center gap-4 p-3 relative min-w-0">
                              <div className="relative shrink-0">
                                <span className="text-3xl group-hover:scale-110 transition-transform duration-500 block">{isText ? '📝' : isImage ? '🖼️' : isPdf ? '📄' : '📦'}</span>
                                {isIndexed && <span className="absolute -bottom-1 -right-1 text-[8px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded font-black">PREVIEW</span>}
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm font-bold truncate pr-4 text-zinc-200">{filename}</span>
                                <span className="text-[9px] text-zinc-600 uppercase font-black tracking-tighter flex items-center gap-1">{filename.split('.').pop()} {isIndexed ? '• Ready' : ''}</span>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-2 pt-2 border-t border-white/5 p-1">
                              <button onClick={(e) => { e.stopPropagation(); handleOpenPreview(path); }} className="flex-1 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[9px] font-black uppercase rounded-lg transition-all">View</button>
                              <button onClick={(e) => { e.stopPropagation(); handleDownloadAttachment(path); }} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 text-[9px] font-black uppercase rounded-lg transition-all">Save</button>
                              {/* --- DELETE BUTTON --- */}
                              <button onClick={(e) => { e.stopPropagation(); setExistingAttachments(prev => prev.filter(p => p !== path)); }} className="flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-black uppercase rounded-lg transition-all" title="Remove attachment">Trash</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col animate-in slide-in-from-bottom-8 duration-500 max-w-4xl mx-auto p-6 md:p-12 w-full overflow-y-auto custom-scrollbar">
                <div className="md:hidden flex items-center mb-6">
                   <button onClick={() => { setSelectedNoteId(null); setMobileView('list'); }} className="text-zinc-400 flex items-center gap-2 font-bold text-sm">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg> Back
                   </button>
                </div>
                <div className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-12 gap-4">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-4xl md:text-7xl font-black mb-4 md:mb-6 tracking-tighter leading-tight break-words">{decryptedCache[selectedNote.id]?.title || selectedNote.title}</h1>
                    <div className="flex flex-wrap gap-4 md:gap-6 items-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
                      <span className="flex items-center gap-2 shrink-0">📅 {formatRelativeTime(selectedNote.created_at)}</span>
                      <span className="hidden md:block w-1 h-1 bg-white/10 rounded-full" />
                      <span className="text-amber-500/80 bg-amber-500/5 px-3 py-1 rounded-full border border-amber-500/10 shrink-0">{selectedNote.category}</span>
                    </div>
                  </div>
                  <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={() => { setEditForm({ title: decryptedCache[selectedNote.id]?.title || selectedNote.title, content: decryptedCache[selectedNote.id]?.content || selectedNote.content, category: selectedNote.category, is_encrypted: selectedNote.is_encrypted, password: '', confirmPassword: '', date: selectedNote.created_at.slice(0, 16) }); setExistingAttachments(selectedNote.attachments || []); setStagedFiles([]); setIsEditing(true); setShowPassword(false); }} className="flex-1 md:flex-none p-3 md:p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-center" title="Edit Entry">✎</button>
                    <button onClick={() => confirm("Delete this secure entry permanently?") && db.deleteNote(selectedNote.id).then(() => { setSelectedNoteId(null); fetchNotes(); setMobileView('list'); })} className="flex-1 md:flex-none p-3 md:p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-red-500/20 text-red-500 transition-all text-center" title="Wipe Note">🗑️</button>
                  </div>
                </div>
                <div className="flex-1 text-xl md:text-2xl leading-[1.6] text-zinc-300 font-medium selection:bg-amber-500/30 rich-text-content" spellCheck={false} dangerouslySetInnerHTML={{ __html: decryptedCache[selectedNote.id]?.content || selectedNote.content }} />

                {selectedNote.attachments && selectedNote.attachments.length > 0 && (
                  <div className="mt-8 md:mt-12 pt-6 md:pt-10 border-t border-white/5">
                    <div className="flex justify-between items-end mb-6">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-3"><span className="text-xl">📎</span> Attachments ({selectedNote.attachments.length})</h4>
                      <span className="hidden sm:inline-block text-[9px] font-black uppercase text-zinc-700 bg-white/5 px-3 py-1 rounded-full border border-white/5">{selectedNote.is_encrypted ? 'Encrypted Local Index' : 'Standard View'}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedNote.attachments.map((path, idx) => {
                        const filename = getFileNameFromPath(path);
                        const isText = isTextFile(filename);
                        const isImage = isImageFile(filename);
                        const isPdf = isPdfFile(filename);
                        const isIndexed = !!attachmentTextCache[path] || !!attachmentImageCache[path];
                        return (
                          <div key={idx} className="flex flex-col p-2 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-amber-500/30 transition-all text-left group relative overflow-hidden">
                            {isImage && attachmentImageCache[path] && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-black/20 border border-white/5"><img src={attachmentImageCache[path]} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Preview" /></div>
                            )}
                            {isText && attachmentTextCache[path] && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-black/40 border border-white/5 p-3 text-[9px] font-mono text-zinc-500 opacity-80 leading-tight custom-scrollbar overflow-y-auto whitespace-pre-wrap">{attachmentTextCache[path].slice(0, 500)}{attachmentTextCache[path].length > 500 && '...'}</div>
                            )}
                            {isPdf && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-red-500/5 border border-white/5 flex items-center justify-center"><span className="text-4xl">📄</span><span className="absolute text-[8px] font-black uppercase text-red-500">PDF Document</span></div>
                            )}
                            <div className="flex items-center gap-4 p-3 relative min-w-0">
                              <div className="relative shrink-0">
                                <span className="text-3xl group-hover:scale-110 transition-transform duration-500 block">{isText ? '📝' : isImage ? '🖼️' : isPdf ? '📄' : '📦'}</span>
                                {isIndexed && <span className="absolute -bottom-1 -right-1 text-[8px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded font-black">PREVIEW</span>}
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm font-bold truncate pr-4 text-zinc-200">{filename}</span>
                                <span className="text-[9px] text-zinc-600 uppercase font-black tracking-tighter flex items-center gap-1">{filename.split('.').pop()} {isIndexed ? '• Ready' : ''}</span>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-2 pt-2 border-t border-white/5 p-1">
                              <button onClick={(e) => { e.stopPropagation(); handleOpenPreview(path); }} className="flex-1 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[9px] font-black uppercase rounded-lg transition-all">View</button>
                              <button onClick={(e) => { e.stopPropagation(); handleDownloadAttachment(path); }} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 text-[9px] font-black uppercase rounded-lg transition-all">Save</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-10 pointer-events-none grayscale px-6">
            <div className="w-32 h-32 md:w-48 md:h-48 bg-white/10 rounded-[64px] flex items-center justify-center text-6xl md:text-8xl mb-12 animate-float">📜</div>
            <div className="text-center space-y-2">
              <p className="text-xl md:text-2xl font-black italic tracking-tighter">"Omnia mea mecum porto"</p>
              <p className="text-[10px] uppercase tracking-[0.4em] font-medium">All that is mine I carry with me</p>
            </div>
          </div>
        )}
      </main>

      {/* Attachment Preview Modal / Image Editor */}
      {previewData && (
        isEditingImage && previewData.type.startsWith('image/') ? (
          <ImageEditor 
            imageUrl={previewData.url} 
            fileName={previewData.name} 
            onSave={handleImageSave} 
            onCancel={() => setIsEditingImage(false)}
          />
        ) : (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[150] flex flex-col items-center justify-center p-4 md:p-10 animate-in fade-in duration-300">
             <div className="w-full max-w-7xl flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                   <div className="flex flex-col">
                      <h3 className="text-xl font-black tracking-tight text-white">{previewData.name}</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{previewData.type} • Secure Decrypted Stream</span>
                   </div>
                   <div className="flex gap-4">
                      {previewData.type.startsWith('image/') && (
                        <button onClick={() => setIsEditingImage(true)} className="px-6 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-amber-500">Edit Image</button>
                      )}
                      <button onClick={() => {
                          const a = document.createElement('a');
                          a.href = previewData.url;
                          a.download = previewData.name;
                          a.click();
                      }} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Save File</button>
                      <button onClick={closePreview} className="w-12 h-12 flex items-center justify-center bg-white/10 text-white rounded-xl font-black text-xl hover:scale-110 transition-all">✕</button>
                   </div>
                </div>
                
                <div className="flex-1 bg-black/40 rounded-[32px] border border-white/5 overflow-hidden flex items-center justify-center shadow-2xl relative">
                   {previewData.type.startsWith('image/') ? (
                      <img src={previewData.url} className="max-w-full max-h-full object-contain animate-in zoom-in-95 duration-500" alt="Preview" />
                   ) : previewData.type === 'application/pdf' ? (
                      <iframe src={previewData.url} className="w-full h-full border-none" title="PDF Preview" />
                   ) : previewData.text ? (
                      <div className="w-full h-full p-8 md:p-12 overflow-y-auto custom-scrollbar font-mono text-sm md:text-base leading-relaxed text-zinc-400 whitespace-pre-wrap selection:bg-amber-500/30">
                         {previewData.text}
                      </div>
                   ) : (
                      <div className="text-center space-y-4">
                         <span className="text-6xl">📦</span>
                         <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">No direct preview available for this file type.</p>
                         <button onClick={() => window.open(previewData.url)} className="text-amber-500 underline text-sm font-black">Try opening in new tab</button>
                      </div>
                   )}
                </div>
             </div>
          </div>
        )
      )}

      {/* Category Creation Modal */}
      {catModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#121212] border border-white/10 rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black tracking-tight">New Category</h3>
              <button onClick={() => setCatModal({ ...catModal, isOpen: false })} className="text-zinc-500 hover:text-white transition-colors">✕</button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-2 ml-1">Category Identity</label>
                <input type="text" placeholder="e.g. Finance, Travel, Work..." autoComplete="off" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-5 text-sm outline-none focus:border-amber-500/50 transition-all" value={catModal.name} onChange={e => setCatModal({ ...catModal, name: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-2 ml-1">Select Icon</label>
                <div className="grid grid-cols-6 gap-2 p-3 bg-white/5 rounded-2xl max-h-[180px] overflow-y-auto custom-scrollbar">
                  {COMMON_ICONS.map(icon => (
                    <button key={icon} onClick={() => setCatModal({ ...catModal, icon })} className={`text-xl p-2 rounded-xl transition-all ${catModal.icon === icon ? 'bg-amber-500/20 border border-amber-500/40' : 'hover:bg-white/5 border border-transparent'}`}>{icon}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setCatModal({ ...catModal, isOpen: false })} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">Cancel</button>
                <button onClick={submitNewCategory} className="flex-1 bg-amber-500 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-amber-500/10">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .rich-text-content { color: #e0e0e0; }
        .rich-text-content a { color: #fbbf24; text-decoration: underline; font-weight: 700; }
        .rich-text-content img { max-width: 100%; height: auto; border-radius: 1rem; margin: 1rem 0; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
        .rich-text-content ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .rich-text-content ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
        .rich-text-content p { margin-bottom: 1rem; }
        .rich-text-content h1, .rich-text-content h2, .rich-text-content h3 { font-weight: 900; margin-top: 1.5rem; margin-bottom: 1rem; }
        
        .secure-input-field {
          -webkit-text-security: disc;
          text-security: disc;
        }

        /* Fix for pasted black text visibility */
        .rich-text-content [style*="color: rgb(0, 0, 0)"],
        .rich-text-content [style*="color: #000000"],
        .rich-text-content [style*="color: #000"],
        .rich-text-content [style*="color: black"],
        .rich-text-content font[color="#000000"],
        .rich-text-content font[color="black"] {
          color: inherit !important;
        }

        [contentEditable]:empty:before {
          content: attr(data-placeholder);
          color: #3f3f46;
          pointer-events: none;
          display: block; /* For Firefox */
        }
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type="color"]::-webkit-color-swatch { border: none; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default App;