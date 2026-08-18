'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

const STORE_KEY = 'qsis_todos_v1';
const FLOAT_CMD_KEY = 'qsis_todos_cmd';

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

export default function FloatingFocus() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [expanded, setExpanded] = useState(false);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragBase = useRef<{ left: number; top: number } | null>(null);
  const hasDragged = useRef(false);

  const loadTodos = useCallback(() => {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      const list: Todo[] = Array.isArray(data?.todos) ? data.todos : [];
      setTodos(list);
    } catch {
      setTodos([]);
    }
  }, []);

  useEffect(() => {
    loadTodos();
    const interval = setInterval(loadTodos, 500);
    return () => clearInterval(interval);
  }, [loadTodos]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORE_KEY) loadTodos();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loadTodos]);

  const running = todos.find((t) => t.running);
  const active = running || todos.find((t) => !t.done);

  if (!active) return null;

  const state = running
    ? 'Focus'
    : active.done
      ? 'Done'
      : active.remaining < active.duration
        ? 'Paused'
        : 'Ready';

  const sendCommand = (cmd: string) => {
    try {
      localStorage.setItem(FLOAT_CMD_KEY, JSON.stringify({ id: active.id, cmd }));
      loadTodos();
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
        className={`flex items-center gap-2 px-3 py-2 border bg-dark-bg2/95 backdrop-blur-sm shadow-xl cursor-grab transition-all ${
          running ? 'border-green-500/50' : 'border-dark-border'
        } ${expanded ? 'rounded-2xl' : 'rounded-full'}`}
        style={{ maxWidth: 'min(360px, calc(100vw - 24px))' }}
      >
        <div
          className={`w-2.5 h-2.5 rounded-full flex-none transition-colors ${
            running
              ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,.5)]'
              : 'bg-dark-text3'
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[0.7rem] font-semibold text-dark-text2 truncate max-w-[200px]">
            {active.text}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-sm font-bold tabular-nums ${
                running ? 'text-green-400' : 'text-dark-text'
              }`}
            >
              {fmt(active.remaining)}
            </span>
            <span className="text-[0.6rem] font-bold uppercase tracking-wider text-dark-text3">
              {state}
            </span>
          </div>
        </div>
        <Link
          href="/focus"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-7 h-7 rounded-lg border border-dark-border bg-dark-bg flex items-center justify-center text-dark-text2 hover:text-qsis hover:border-qsis transition no-underline flex-none"
          title="Open full app"
        >
          <span className="material-symbols-outlined text-[0.85rem]">open_in_new</span>
        </Link>
      </div>

      {expanded && (
        <div className="flex gap-1.5 mt-1.5 px-1">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => sendCommand(running ? 'play' : 'play')}
            className="flex-1 h-8 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-[0.68rem] font-medium cursor-pointer hover:border-green-500 hover:text-green-400 transition"
            title={running ? 'Pause' : 'Start'}
          >
            {running ? '❚❚' : '▶'}
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => sendCommand('+5')}
            className="flex-1 h-8 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-[0.68rem] font-medium cursor-pointer hover:border-green-500 hover:text-green-400 transition"
            title="Add 5 minutes"
          >
            +5m
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => sendCommand('play')}
            className="flex-1 h-8 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-[0.68rem] font-medium cursor-pointer hover:border-green-500 hover:text-green-400 transition"
            title="Complete"
          >
            ✓ Done
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setExpanded(false);
              sendCommand('close');
            }}
            className="h-8 px-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-[0.68rem] font-medium cursor-pointer hover:border-rose-500 hover:text-rose-400 transition"
            title="Close"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
