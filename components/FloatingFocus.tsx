'use client';

import { useState, useEffect, useRef } from 'react';

const STORE_KEY = 'qsis_todos_v1';

interface Todo {
  id: string;
  text: string;
  duration: number;
  remaining: number;
  running: boolean;
  done: boolean;
  lastTick: number;
  createdAt: number;
  notes?: { id: string; text: string; done: boolean }[];
  deadline?: string | null;
}

function fmt(s: number) {
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function readTodos(): Todo[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const list: Todo[] = Array.isArray(data?.todos) ? data.todos : [];
    return list.map((t) => ({
      id: String(t.id || ''),
      text: String(t.text || ''),
      duration: Number(t.duration) || 0,
      remaining: Math.max(0, t.remaining !== undefined ? Number(t.remaining) : (Number(t.duration) || 0)),
      running: !!t.running,
      done: !!t.done,
      lastTick: Number(t.lastTick) || 0,
      createdAt: Number(t.createdAt) || Date.now(),
      notes: Array.isArray(t.notes) ? t.notes : [],
      deadline: t.deadline || null,
    }));
  } catch { return []; }
}

function writeTodos(todos: Todo[]) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ todos })); } catch {}
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.18, 0.36, 0.54].forEach((dt) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime + dt);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dt + 0.35);
      o.start(ctx.currentTime + dt);
      o.stop(ctx.currentTime + dt + 0.4);
    });
  } catch {}
}

export default function FloatingFocus() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragBase = useRef<{ left: number; top: number } | null>(null);
  const hasDragged = useRef(false);
  const lastSavedRef = useRef<string>('');
  const lastBeepRef = useRef<string>('');

  // Core tick — single source of truth for the timer
  useEffect(() => {
    const tick = () => {
      try {
        const current = readTodos();
        const running = current.find(t => t.running);
        if (!running) return;

        const now = Date.now();
        const elapsed = Math.floor((now - running.lastTick) / 1000);
        if (elapsed <= 0) return;

        running.remaining = Math.max(0, running.remaining - elapsed);
        running.lastTick = now;

        let justFinished = false;
        if (running.remaining <= 0) {
          running.remaining = 0;
          running.running = false;
          running.lastTick = 0;
          running.done = true;
          justFinished = true;
        }

        const serialized = JSON.stringify(current);
        if (serialized !== lastSavedRef.current) {
          writeTodos(current);
          lastSavedRef.current = serialized;
        }
        setTodos(current);

        if (justFinished && lastBeepRef.current !== running.id) {
          lastBeepRef.current = running.id;
          playBeep();
        }
      } catch {}
    };

    // Reconcile on mount
    try {
      const current = readTodos();
      const running = current.find(t => t.running);
      if (running && running.lastTick) {
        const elapsed = Math.floor((Date.now() - running.lastTick) / 1000);
        if (elapsed > 0) {
          running.remaining = Math.max(0, running.remaining - elapsed);
          running.lastTick = Date.now();
          let justFinished = false;
          if (running.remaining <= 0) {
            running.remaining = 0;
            running.running = false;
            running.lastTick = 0;
            running.done = true;
            justFinished = true;
          }
          writeTodos(current);
          setTodos(current);
          if (justFinished) {
            lastBeepRef.current = running.id;
            playBeep();
          }
        }
      }
    } catch {}

    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, []);

  // Load from localStorage periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setTodos(readTodos());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Clamp capsule to viewport on resize
  useEffect(() => {
    const onResize = () => {
      const el = capsuleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isOff = rect.right < 0 || rect.left > vw || rect.bottom < 0 || rect.top > vh;
      setOffscreen(isOff);
      if (isOff) {
        el.style.left = '';
        el.style.top = '';
        el.style.right = '12px';
        el.style.bottom = '80px';
        setOffscreen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Only show when a timer is actually running (or just finished in the last few seconds)
  const running = todos.find(t => t.running);
  const justFinished = todos.find(t => t.done && !t.running && t.remaining <= 0);
  const active = running || null;
  if (!active && !justFinished) return null;

  const display = active || justFinished!;
  const progress = display.duration > 0 ? ((display.duration - display.remaining) / display.duration) * 100 : 0;
  const isActive = !!running;

  const sendCommand = (cmd: string) => {
    try {
      const current = readTodos();
      const t = current.find(x => x.id === display.id);
      if (!t) return;

      if (cmd === 'play') {
        if (t.running) {
          t.remaining = Math.max(0, t.remaining - Math.floor((Date.now() - t.lastTick) / 1000));
          t.running = false;
          t.lastTick = 0;
        } else {
          t.done = false;
          if (t.remaining <= 0) t.remaining = t.duration;
          t.running = true;
          t.lastTick = Date.now();
        }
      } else if (cmd === 'reset') {
        t.remaining = t.duration;
        t.running = false;
        t.lastTick = 0;
        t.done = false;
      } else if (cmd === '+5') {
        t.remaining += 300;
        t.done = false;
      } else if (cmd === 'done') {
        t.running = false;
        t.lastTick = 0;
        t.done = true;
      } else if (cmd === 'close') {
        t.running = false;
        t.lastTick = 0;
      }

      writeTodos(current);
      setTodos(current);
    } catch {}
  };

  const resetPosition = () => {
    const el = capsuleRef.current;
    if (!el) return;
    el.style.left = '';
    el.style.top = '';
    el.style.right = '12px';
    el.style.bottom = '80px';
    setOffscreen(false);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return;
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    const rect = capsuleRef.current?.getBoundingClientRect();
    if (rect) dragBase.current = { left: rect.left, top: rect.top };
    capsuleRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current || !dragBase.current || !capsuleRef.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (!hasDragged.current && Math.hypot(dx, dy) < 6) return;
    hasDragged.current = true;
    capsuleRef.current.style.left = `${dragBase.current.left + dx}px`;
    capsuleRef.current.style.top = `${dragBase.current.top + dy}px`;
    capsuleRef.current.style.right = 'auto';
    capsuleRef.current.style.bottom = 'auto';
    // Check if off-screen after drag
    const rect = capsuleRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setOffscreen(rect.right < 0 || rect.left > vw || rect.bottom < 0 || rect.top > vh);
  };

  const handlePointerUp = () => {
    dragStart.current = null;
  };

  return (
    <>
      {/* Off-screen reset button */}
      {offscreen && (
        <button
          onClick={resetPosition}
          className="fixed bottom-[80px] md:bottom-4 right-3 z-[1700] w-10 h-10 rounded-full border border-amber-500/50 bg-dark-bg2/95 backdrop-blur-sm flex items-center justify-center text-amber-400 cursor-pointer shadow-lg animate-pulse"
          title="Bring timer back to screen"
        >
          <span className="material-symbols-outlined text-[1.1rem]">focus_center</span>
        </button>
      )}

      <div
        ref={capsuleRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={() => {
          if (!hasDragged.current) setExpanded(!expanded);
        }}
        className="fixed right-3 bottom-[80px] md:bottom-4 z-[1600] select-none touch-none"
      >
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border bg-dark-bg2/95 backdrop-blur-sm shadow-xl cursor-grab transition-all rounded-full ${expanded ? 'rounded-2xl' : ''}`}
          style={{ borderColor: isActive ? 'rgba(34,197,94,0.5)' : 'var(--color-dark-border, #2a3a5c)', maxWidth: 'min(300px, calc(100vw - 24px))' }}
        >
          <div className="relative flex-none">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_6px_rgba(34,197,94,.5)] ${isActive ? 'bg-green-500' : 'bg-amber-400'}`} />
            {isActive && <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping opacity-75" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[0.62rem] font-semibold text-dark-text2 truncate max-w-[140px]">
              {display.text}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xs font-bold tabular-nums ${isActive ? 'text-green-400' : 'text-amber-400'}`}>
                {fmt(display.remaining)}
              </span>
              <span className={`text-[0.5rem] font-bold uppercase tracking-wider ${isActive ? 'text-green-400' : 'text-amber-400'}`}>
                {isActive ? 'Focus' : 'Done'}
              </span>
            </div>
            <div className="mt-0.5 h-[2px] w-full bg-dark-border rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${isActive ? 'bg-green-500/60' : 'bg-amber-400/60'}`} style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
          </div>
        </div>

        {expanded && (
          <div
            className="mt-1.5 mx-1 rounded-2xl bg-dark-bg2/95 backdrop-blur-sm border border-green-500/30 p-3 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-[0.6rem] text-dark-text3 px-1">
              <span>{fmt(display.duration - display.remaining)} elapsed</span>
              <span>{fmt(display.duration)} total</span>
            </div>

            <div className="flex gap-2">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => sendCommand('play')}
                className="flex-1 h-9 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text text-[0.7rem] font-semibold cursor-pointer hover:border-green-500 hover:text-green-400 transition flex items-center justify-center gap-1.5"
              >
                <i className={`fas ${isActive ? 'fa-pause' : 'fa-play'} text-[0.6rem]`}></i>
                {isActive ? 'Pause' : 'Resume'}
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => sendCommand('+5')}
                className="h-9 px-3 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text text-[0.7rem] font-semibold cursor-pointer hover:border-green-500 hover:text-green-400 transition flex items-center justify-center gap-1"
              >
                <i className="fas fa-plus text-[0.55rem]"></i> 5m
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => sendCommand('reset')}
                className="flex-1 h-8 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text2 text-[0.65rem] font-medium cursor-pointer hover:border-amber-500 hover:text-amber-400 transition flex items-center justify-center gap-1.5"
              >
                <i className="fas fa-rotate-left text-[0.55rem]"></i> Reset
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => sendCommand('done')}
                className="flex-1 h-8 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text2 text-[0.65rem] font-medium cursor-pointer hover:border-green-500 hover:text-green-400 transition flex items-center justify-center gap-1.5"
              >
                <i className="fas fa-check text-[0.55rem]"></i> Done
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={resetPosition}
                className="flex-1 h-8 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text2 text-[0.65rem] font-medium cursor-pointer hover:border-blue-500 hover:text-blue-400 transition flex items-center justify-center gap-1.5"
                title="Reset position"
              >
                <i className="fas fa-crosshairs text-[0.55rem]"></i> Reposition
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => sendCommand('close')}
                className="flex-1 h-8 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text2 text-[0.65rem] font-medium cursor-pointer hover:border-rose-500 hover:text-rose-400 transition flex items-center justify-center gap-1.5"
              >
                <i className="fas fa-times text-[0.55rem]"></i> Hide
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
