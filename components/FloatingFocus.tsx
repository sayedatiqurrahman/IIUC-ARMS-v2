'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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
      duration: Math.max(5, Number(t.duration) || 1500),
      remaining: Math.max(0, t.remaining !== undefined ? Number(t.remaining) : (Number(t.duration) || 1500)),
      running: !!t.running,
      done: !!t.done,
      lastTick: Number(t.lastTick) || 0,
      createdAt: Number(t.createdAt) || Date.now(),
    }));
  } catch { return []; }
}

function writeTodos(todos: Todo[]) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ todos })); } catch {}
}

export default function FloatingFocus() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [expanded, setExpanded] = useState(false);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragBase = useRef<{ left: number; top: number } | null>(null);
  const hasDragged = useRef(false);
  const lastSavedRef = useRef<string>('');

  // Core tick — THIS is the single source of truth for the timer
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

        if (running.remaining <= 0) {
          running.remaining = 0;
          running.running = false;
          running.lastTick = 0;
          running.done = true;
        }

        const serialized = JSON.stringify(current);
        if (serialized !== lastSavedRef.current) {
          writeTodos(current);
          lastSavedRef.current = serialized;
        }
        setTodos(current);
      } catch {}
    };

    // Reconcile on mount — catch up any time that passed while this component wasn't mounted
    try {
      const current = readTodos();
      const running = current.find(t => t.running);
      if (running && running.lastTick) {
        const elapsed = Math.floor((Date.now() - running.lastTick) / 1000);
        if (elapsed > 0) {
          running.remaining = Math.max(0, running.remaining - elapsed);
          running.lastTick = Date.now();
          if (running.remaining <= 0) {
            running.remaining = 0;
            running.running = false;
            running.lastTick = 0;
            running.done = true;
          }
          writeTodos(current);
          setTodos(current);
        }
      }
    } catch {}

    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, []);

  // Load from localStorage periodically (for non-running state changes)
  useEffect(() => {
    const interval = setInterval(() => {
      setTodos(readTodos());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Only show when a timer is actually running
  const running = todos.find(t => t.running);
  if (!running) return null;

  const progress = running.duration > 0 ? ((running.duration - running.remaining) / running.duration) * 100 : 0;

  const sendCommand = (cmd: string) => {
    try {
      const current = readTodos();
      const t = current.find(x => x.id === running.id);
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
  };

  const handlePointerUp = () => {
    dragStart.current = null;
  };

  return (
    <div
      ref={capsuleRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="fixed right-3 bottom-[80px] md:bottom-4 z-[80] select-none touch-none"
    >
      <div
        onClick={() => {
          if (!hasDragged.current) setExpanded(!expanded);
        }}
        className={`flex items-center gap-2 px-3 py-2 border bg-dark-bg2/95 backdrop-blur-sm shadow-xl cursor-grab transition-all rounded-full ${expanded ? 'rounded-2xl' : ''}`}
        style={{ borderColor: running ? 'rgba(34,197,94,0.5)' : 'var(--color-dark-border, #2a3a5c)', maxWidth: 'min(360px, calc(100vw - 24px))' }}
      >
        <div className="relative flex-none">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,.5)]" />
          <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-500 animate-ping opacity-75" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[0.7rem] font-semibold text-dark-text2 truncate max-w-[200px]">
            {running.text}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tabular-nums text-green-400">
              {fmt(running.remaining)}
            </span>
            <span className="text-[0.6rem] font-bold uppercase tracking-wider text-green-400">
              Focus
            </span>
          </div>
          <div className="mt-1 h-0.5 w-full bg-dark-border rounded-full overflow-hidden">
            <div className="h-full bg-green-500/60 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-1.5 mx-1 rounded-2xl bg-dark-bg2/95 backdrop-blur-sm border border-green-500/30 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[0.65rem] text-dark-text3 px-1">
            <span>{fmt(running.duration - running.remaining)} elapsed</span>
            <span>{fmt(running.duration)} total</span>
          </div>

          <div className="flex gap-1.5">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => sendCommand('play')}
              className="flex-1 h-9 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text text-[0.7rem] font-semibold cursor-pointer hover:border-green-500 hover:text-green-400 transition flex items-center justify-center gap-1.5"
            >
              <i className={`fas ${running ? 'fa-pause' : 'fa-play'} text-[0.6rem]`}></i>
              {running ? 'Pause' : 'Resume'}
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => sendCommand('+5')}
              className="h-9 px-3 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text text-[0.7rem] font-semibold cursor-pointer hover:border-green-500 hover:text-green-400 transition flex items-center justify-center gap-1"
            >
              <i className="fas fa-plus text-[0.55rem]"></i> 5m
            </button>
          </div>

          <div className="flex gap-1.5">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => sendCommand('reset')}
              className="flex-1 h-8 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text2 text-[0.68rem] font-medium cursor-pointer hover:border-amber-500 hover:text-amber-400 transition flex items-center justify-center gap-1"
            >
              <i className="fas fa-rotate-left text-[0.55rem]"></i> Reset
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => sendCommand('done')}
              className="flex-1 h-8 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text2 text-[0.68rem] font-medium cursor-pointer hover:border-green-500 hover:text-green-400 transition flex items-center justify-center gap-1"
            >
              <i className="fas fa-check text-[0.55rem]"></i> Done
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => sendCommand('close')}
              className="h-8 px-2.5 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text2 text-[0.68rem] font-medium cursor-pointer hover:border-rose-500 hover:text-rose-400 transition"
            >
              <i className="fas fa-times text-[0.55rem]"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
