'use client';

import { useState, useEffect } from 'react';

interface WebhookInfo {
  bot: { id: number; username: string; name: string } | null;
  webhook: {
    url: string;
    hasCustomCertificate: boolean;
    pendingUpdateCount: number;
    lastErrorDate: number | null;
    lastErrorMessage: string | null;
    maxConnections: number;
  } | null;
  webhookSecret: string | null;
  webhookSecretRaw: string;
  setupUrl: string;
  siteUrl: string;
  dbColumns: Record<string, boolean>;
  allColumnsExist: boolean;
}

export default function WebhookSetup() {
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [reRegistering, setReRegistering] = useState(false);
  const [reRegistered, setReRegistered] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetchInfo();
  }, []);

  async function fetchInfo() {
    setLoading(true);
    try {
      const res = await fetch('/api/telegram/webhook-info');
      const data = await res.json();
      if (data.success) setInfo(data);
    } catch {}
    setLoading(false);
  }

  async function runMigration() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await fetch('/api/telegram/webhook-info', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMigrateResult({ ok: true, msg: data.migrations?.join(', ') || 'Done' });
        fetchInfo(); // Refresh
      } else {
        setMigrateResult({ ok: false, msg: data.errors?.join(', ') || data.error || 'Failed' });
      }
    } catch {
      setMigrateResult({ ok: false, msg: 'Network error' });
    }
    setMigrating(false);
  }

  async function reRegisterWebhook() {
    setReRegistering(true);
    setReRegistered(null);
    try {
      const res = await fetch(`/api/telegram/setup?key=${info?.webhookSecretRaw || ''}`);
      const data = await res.json();
      if (data.webhook?.ok || data.webhook?.result?.ok) {
        const url = data.webhookInfo?.url || '?';
        const cmds = data.commands?.ok ? 'command menu OK' : 'command menu FAILED';
        const pending = data.webhookInfo?.pendingUpdateCount ?? 0;
        setReRegistered({ ok: true, msg: `Webhook → ${url} · ${cmds} · ${pending} pending update(s)` });
        fetchInfo();
      } else if (data.success) {
        setReRegistered({ ok: true, msg: `Done: ${Array.isArray(data.commands) ? data.commands.join(', ') : 'webhook re-registered'}, ${data.bot?.result?.username ? '@' + data.bot.result.username : ''}` });
        fetchInfo();
      } else {
        setReRegistered({ ok: false, msg: data.error || 'Failed to re-register' });
      }
    } catch {
      setReRegistered({ ok: false, msg: 'Network error' });
    }
    setReRegistering(false);
  }

  function copyText(field: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-dark-bg3 border border-dark-border text-center">
        <i className="fas fa-spinner fa-spin text-qsis mr-2"></i>
        <span className="text-sm text-dark-text2">Loading webhook info...</span>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
        <i className="fas fa-exclamation-circle mr-2"></i>Failed to load webhook info
      </div>
    );
  }

  const wh = info.webhook;
  const isWebhookSet = wh?.url?.includes('/api/telegram/webhook');
  const hasErrors = wh?.lastErrorMessage && wh.lastErrorMessage.length > 0;

  return (
    <div className="space-y-4">
      {/* Bot Info */}
      {info.bot && (
        <div className="p-4 rounded-xl bg-dark-bg3 border border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center">
              <i className="fab fa-telegram-plane text-blue-400 text-xl"></i>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-dark-text">{info.bot.name}</p>
              <p className="text-xs text-dark-text2">@{info.bot.username}</p>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${isWebhookSet ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              {isWebhookSet ? 'Webhook Active' : 'No Webhook'}
            </span>
          </div>
        </div>
      )}

      {/* Webhook Status */}
      <div className="p-4 rounded-xl bg-dark-bg3 border border-dark-border">
        <h4 className="text-sm font-semibold text-dark-text mb-3">
          <i className="fas fa-link text-cyan-400 mr-2"></i>Webhook Status
        </h4>

        {wh ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-dark-text2">URL</span>
              <span className="text-dark-text font-mono truncate ml-4">{wh.url || '(none)'}</span>
            </div>
            {wh.pendingUpdateCount > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-dark-text2">Pending updates</span>
                <span className="text-amber-400 font-medium">{wh.pendingUpdateCount}</span>
              </div>
            )}
            {wh.lastErrorDate && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-dark-text2">Last error</span>
                <span className="text-red-400 truncate ml-4 max-w-[250px]">{wh.lastErrorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-dark-text2">Could not fetch webhook info</p>
        )}

        <button
          onClick={reRegisterWebhook}
          disabled={reRegistering}
          className="mt-3 px-3 py-1.5 rounded-lg bg-dark-bg2 border border-dark-border text-xs text-dark-text2 hover:text-dark-text transition disabled:opacity-50"
        >
          {reRegistering ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-redo mr-1"></i>}
          Re-register Webhook
        </button>

        {reRegistered && (
          <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${reRegistered.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {reRegistered.msg}
          </div>
        )}
      </div>

      {/* Setup URLs — copyable */}
      <div className="p-4 rounded-xl bg-dark-bg3 border border-dark-border">
        <h4 className="text-sm font-semibold text-dark-text mb-3">
          <i className="fas fa-key text-amber-400 mr-2"></i>Setup & Secrets
        </h4>

        {/* Webhook Secret */}
        <div className="mb-3">
          <label className="text-xs text-dark-text2 block mb-1">Webhook Secret</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg bg-dark-bg2 border border-dark-border font-mono text-xs text-dark-text">
              {showSecret ? info.webhookSecretRaw : (info.webhookSecret || '(not set)')}
            </div>
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="px-2 py-2 rounded-lg bg-dark-bg2 border border-dark-border text-dark-text2 hover:text-dark-text transition text-xs"
              title={showSecret ? 'Hide' : 'Show'}
            >
              <i className={`fas ${showSecret ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
            <button
              onClick={() => copyText('secret', info.webhookSecretRaw)}
              className={`px-2 py-2 rounded-lg border transition text-xs ${
                copiedField === 'secret' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-dark-bg2 border-dark-border text-dark-text2 hover:text-dark-text'
              }`}
              title="Copy"
            >
              <i className={`fas ${copiedField === 'secret' ? 'fa-check' : 'fa-copy'}`}></i>
            </button>
          </div>
        </div>

        {/* Setup URL */}
        <div className="mb-3">
          <label className="text-xs text-dark-text2 block mb-1">Setup URL (open to register webhook)</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg bg-dark-bg2 border border-dark-border font-mono text-[0.65rem] text-dark-text truncate">
              {info.setupUrl}
            </div>
            <button
              onClick={() => copyText('setup', info.setupUrl)}
              className={`px-2 py-2 rounded-lg border transition text-xs ${
                copiedField === 'setup' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-dark-bg2 border-dark-border text-dark-text2 hover:text-dark-text'
              }`}
              title="Copy"
            >
              <i className={`fas ${copiedField === 'setup' ? 'fa-check' : 'fa-copy'}`}></i>
            </button>
            <a
              href={info.setupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-2 rounded-lg bg-dark-bg2 border border-dark-border text-dark-text2 hover:text-dark-text transition text-xs"
              title="Open in browser"
            >
              <i className="fas fa-external-link-alt"></i>
            </a>
          </div>
        </div>

        {/* Site URL */}
        <div>
          <label className="text-xs text-dark-text2 block mb-1">Site URL</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg bg-dark-bg2 border border-dark-border font-mono text-xs text-dark-text">
              {info.siteUrl}
            </div>
            <button
              onClick={() => copyText('site', info.siteUrl)}
              className={`px-2 py-2 rounded-lg border transition text-xs ${
                copiedField === 'site' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-dark-bg2 border-dark-border text-dark-text2 hover:text-dark-text'
              }`}
              title="Copy"
            >
              <i className={`fas ${copiedField === 'site' ? 'fa-check' : 'fa-copy'}`}></i>
            </button>
          </div>
        </div>
      </div>

      {/* DB Columns */}
      <div className="p-4 rounded-xl bg-dark-bg3 border border-dark-border">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-dark-text">
            <i className="fas fa-database text-purple-400 mr-2"></i>Database Columns
          </h4>
          {!info.allColumnsExist && (
            <button
              onClick={runMigration}
              disabled={migrating}
              className="px-3 py-1.5 rounded-lg bg-qsis/15 text-qsis text-xs font-medium hover:bg-qsis/25 transition disabled:opacity-50"
            >
              {migrating ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-wand-magic mr-1"></i>}
              Auto-fix
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {Object.entries(info.dbColumns).map(([name, exists]) => (
            <div key={name} className="flex items-center gap-2 text-xs">
              <i className={`fas ${exists ? 'fa-check-circle text-emerald-400' : 'fa-times-circle text-red-400'}`}></i>
              <span className={exists ? 'text-dark-text2' : 'text-red-400 font-medium'}>{name}</span>
            </div>
          ))}
        </div>

        {migrateResult && (
          <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${migrateResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {migrateResult.msg}
          </div>
        )}
      </div>

      {/* Refresh */}
      <button
        onClick={fetchInfo}
        className="text-xs text-dark-text2 hover:text-dark-text transition"
      >
        <i className="fas fa-sync-alt mr-1"></i>Refresh
      </button>
    </div>
  );
}
