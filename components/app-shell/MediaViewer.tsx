'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { toggleFullscreen } from '@/lib/fullscreen';

function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function getVideoEmbed(url: string): { type: 'youtube' | 'vimeo' | 'direct'; src: string } | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
  if (yt) return { type: 'youtube', src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1` };
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return { type: 'vimeo', src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1` };
  if (/\.(mp4|webm|ogg|mov)$/i.test(url)) return { type: 'direct', src: url };
  return null;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export default function MediaViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isVideo = item.mimeType === 'video';
  const isAudio = item.mimeType === 'audio';
  const embed = !isVideo && !isAudio ? getVideoEmbed(item.rawUrl) : null;
  const isEmbed = !!embed && (embed.type === 'youtube' || embed.type === 'vimeo');

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [dragging, setDragging] = useState(false);

  const v = videoRef.current;

  // ─── Play / Pause ───
  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) { vid.play(); setPlaying(true); }
    else { vid.pause(); setPlaying(false); }
  }, []);

  // ─── Progress drag ───
  const seekTo = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const vid = videoRef.current;
    if (!bar || !vid) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    vid.currentTime = pct * vid.duration;
  }, []);

  const onProgressDown = useCallback((e: React.PointerEvent) => {
    setDragging(true);
    seekTo(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [seekTo]);

  const onProgressMove = useCallback((e: React.PointerEvent) => {
    if (dragging) seekTo(e.clientX);
  }, [dragging, seekTo]);

  const onProgressUp = useCallback(() => setDragging(false), []);

  // ─── Volume ───
  const toggleMute = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
  }, []);

  const changeVolume = useCallback((delta: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const next = Math.max(0, Math.min(1, vid.volume + delta));
    vid.volume = next;
    setVolume(next);
    if (next > 0 && vid.muted) { vid.muted = false; setMuted(false); }
  }, []);

  // ─── Speed ───
  const cycleSpeed = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    vid.playbackRate = next;
    setSpeed(next);
  }, [speed]);

  // ─── Keyboard ───
  useEffect(() => {
    if (isEmbed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const vid = videoRef.current;
      if (!vid) return;
      switch (e.key) {
        case ' ':
        case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); vid.currentTime = Math.max(0, vid.currentTime - 5); break;
        case 'ArrowRight': e.preventDefault(); vid.currentTime = Math.min(vid.duration, vid.currentTime + 5); break;
        case 'ArrowUp': e.preventDefault(); changeVolume(0.1); break;
        case 'ArrowDown': e.preventDefault(); changeVolume(-0.1); break;
        case 'f': e.preventDefault(); toggleFullscreen(rootRef.current); break;
        case 'm': e.preventDefault(); toggleMute(); break;
      }
      resetHideTimer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEmbed, togglePlay, changeVolume, toggleMute]);

  // ─── Video events ───
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || isEmbed) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => { setCurrent(vid.currentTime); };
    const onDurationChange = () => setDuration(vid.duration);
    const onProgress = () => {
      if (vid.buffered.length > 0) setBuffered(vid.buffered.end(vid.buffered.length - 1));
    };
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('timeupdate', onTimeUpdate);
    vid.addEventListener('durationchange', onDurationChange);
    vid.addEventListener('progress', onProgress);
    return () => {
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('timeupdate', onTimeUpdate);
      vid.removeEventListener('durationchange', onDurationChange);
      vid.removeEventListener('progress', onProgress);
    };
  }, [isEmbed]);

  // ─── Auto-hide controls ───
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, [playing]);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [playing, resetHideTimer]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  // ─── Embed (YouTube/Vimeo) ───
  if (isEmbed && embed) {
    return (
      <div ref={rootRef} className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <i className={`fab ${embed.type === 'youtube' ? 'fa-youtube text-red-500' : 'fa-vimeo-v text-cyan-400'}`}></i>
            <span className="text-neutral-300 text-[0.8rem] font-semibold truncate">{item.name}</span>
          </div>
          <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen"><i className="fas fa-expand"></i></button>
          <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
        </div>
        <div className="flex-1 flex items-center justify-center bg-black">
          <iframe src={embed.src} className="w-full h-full border-0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        </div>
      </div>
    );
  }

  // ─── Direct video or audio ───
  return (
    <div ref={rootRef} className="fixed inset-0 z-[1500] bg-[#0a0f1e] flex flex-col" onMouseMove={resetHideTimer}>
      {/* Top bar */}
      <div className={`flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <i className={`fas ${isVideo ? 'fa-video text-qsis' : 'fa-music text-purple-400'}`}></i>
          <span className="text-neutral-300 text-[0.8rem] font-semibold truncate">{item.name}</span>
        </div>
        <button className="pdf-btn" onClick={() => toggleFullscreen(rootRef.current)} title="Fullscreen (F)"><i className="fas fa-expand"></i></button>
        <a className="pdf-btn no-underline" href={item.rawUrl} target="_blank" rel="noreferrer" title="Download"><i className="fas fa-download"></i></a>
        <button className="pdf-btn" onClick={onClose} title="Close" style={{ background: '#ef4444', color: 'white', borderRadius: '7px' }}><i className="fas fa-times"></i></button>
      </div>

      {/* Media area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black relative" onClick={isVideo ? togglePlay : undefined}>
        {isVideo ? (
          <video ref={videoRef} src={item.rawUrl} className="max-h-full max-w-full" preload="metadata" crossOrigin="anonymous" />
        ) : (
          <div className="flex flex-col items-center gap-6 w-full max-w-md px-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/30 to-qsis/30 flex items-center justify-center">
              <i className="fas fa-music text-4xl text-purple-400"></i>
            </div>
            <audio ref={videoRef} src={item.rawUrl} className="w-full" preload="metadata" controls={false} />
            {/* Inline audio controls below */}
            <div className="w-full space-y-3">
              <div
                ref={progressRef}
                className="relative h-2 rounded-full bg-neutral-800 cursor-pointer group"
                onPointerDown={onProgressDown}
                onPointerMove={onProgressMove}
                onPointerUp={onProgressUp}
              >
                <div className="absolute inset-y-0 left-0 rounded-full bg-neutral-700" style={{ width: `${bufProgress}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-qsis" style={{ width: `${progress}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-qsis shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress}% - 7px)` }} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[0.72rem] text-neutral-400 font-mono min-w-[40px]">{formatTime(currentTime)}</span>
                <div className="flex-1" />
                <span className="text-[0.72rem] text-neutral-500 font-mono">{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls (video only) */}
      {isVideo && (
        <div className={`bg-neutral-900/95 backdrop-blur-sm border-t border-neutral-800 transition-all duration-300 ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative h-1.5 hover:h-2.5 cursor-pointer group transition-all mx-3 mt-2 rounded-full bg-neutral-800"
            onPointerDown={onProgressDown}
            onPointerMove={onProgressMove}
            onPointerUp={onProgressUp}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-neutral-600 transition-all" style={{ width: `${bufProgress}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-qsis transition-all" style={{ width: `${progress}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-qsis shadow-lg border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress}% - 7px)` }} />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-1 px-3 py-1.5">
            <button onClick={togglePlay} className="w-9 h-9 rounded-lg flex items-center justify-center text-white hover:bg-white/10 cursor-pointer border-none transition" title="Play/Pause (Space)">
              <i className={`fas ${playing ? 'fa-pause' : 'fa-play'} ${!playing ? 'ml-0.5' : ''} text-[0.9rem]`}></i>
            </button>

            <button onClick={() => { if (v) v.currentTime = Math.max(0, v.currentTime - 10); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer border-none transition" title="Rewind 10s">
              <i className="fas fa-backward text-[0.7rem]"></i>
            </button>
            <button onClick={() => { if (v) v.currentTime = Math.min(v.duration, v.currentTime + 10); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer border-none transition" title="Forward 10s">
              <i className="fas fa-forward text-[0.7rem]"></i>
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol">
              <button onClick={toggleMute} className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer border-none transition" title="Mute (M)">
                <i className={`fas ${muted || volume === 0 ? 'fa-volume-mute' : volume < 0.5 ? 'fa-volume-down' : 'fa-volume-up'} text-[0.75rem]`}></i>
              </button>
              <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-200">
                <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                  onChange={e => { const v = parseFloat(e.target.value); if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; setVolume(v); setMuted(v === 0); } }}
                  className="w-full h-1 accent-qsis cursor-pointer" />
              </div>
            </div>

            {/* Time */}
            <span className="text-[0.72rem] text-neutral-400 font-mono ml-2">
              {formatTime(currentTime)}<span className="text-neutral-600 mx-0.5">/</span>{formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* Speed */}
            <button onClick={cycleSpeed} className="px-2 py-1 rounded-lg text-[0.68rem] font-bold text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer border-none transition min-w-[36px] text-center" title="Playback Speed">
              {speed === 1 ? '1x' : `${speed}x`}
            </button>

            {/* Fullscreen */}
            <button onClick={() => toggleFullscreen(rootRef.current)} className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer border-none transition" title="Fullscreen (F)">
              <i className="fas fa-expand text-[0.75rem]"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
