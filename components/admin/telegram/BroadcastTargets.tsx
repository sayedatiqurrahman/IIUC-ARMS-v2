'use client';

import { useState, useEffect } from 'react';

interface BroadcastTarget {
  id: string;
  label: string;
  chatId: string;
  type: 'channel' | 'group' | 'personal';
  enabled: boolean;
}

export default function BroadcastTargets() {
  const [targets, setTargets] = useState<BroadcastTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formLabel, setFormLabel] = useState('');
  const [formChatId, setFormChatId] = useState('');
  const [formType, setFormType] = useState<'channel' | 'group' | 'personal'>('group');

  useEffect(() => {
    fetchTargets();
  }, []);

  async function fetchTargets() {
    try {
      const res = await fetch('/api/telegram/broadcast-targets');
      const data = await res.json();
      if (data.success) setTargets(data.targets || []);
    } catch {} finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormLabel('');
    setFormChatId('');
    setFormType('group');
    setEditingId(null);
    setShowAdd(false);
    setError('');
  }

  function startEdit(t: BroadcastTarget) {
    setFormLabel(t.label);
    setFormChatId(t.chatId);
    setFormType(t.type);
    setEditingId(t.id);
    setShowAdd(true);
    setError('');
  }

  async function handleSave() {
    if (!formLabel.trim() || !formChatId.trim()) {
      setError('Label and Chat ID are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const action = editingId ? 'update' : 'add';
      const payload: any = { action, target: { label: formLabel.trim(), chatId: formChatId.trim(), type: formType } };
      if (editingId) payload.target.id = editingId;
      const res = await fetch('/api/telegram/broadcast-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setTargets(data.targets);
        setSuccess(editingId ? 'Target updated' : 'Target added');
        resetForm();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/telegram/broadcast-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', target: { id } }),
      });
      const data = await res.json();
      if (data.success) {
        setTargets(data.targets);
        setSuccess('Target removed');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch {} finally { setSaving(false); }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch('/api/telegram/broadcast-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', target: { id } }),
      });
      const data = await res.json();
      if (data.success) setTargets(data.targets);
    } catch {}
  }

  async function handleTestSend(target: BroadcastTarget) {
    setSaving(true);
    try {
      const res = await fetch('/api/telegram/broadcast-targets/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: target.chatId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Test message sent to "${target.label}"`);
      } else {
        setError(`Test failed for "${target.label}": ${data.error || 'Unknown error'}`);
      }
      setTimeout(() => { setSuccess(''); setError(''); }, 4000);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  const typeIcon: Record<string, string> = { channel: '📢', group: '💬', personal: '👤' };
  const typeLabel: Record<string, string> = { channel: 'Channel', group: 'Group', personal: 'Personal (DM)' };

  if (loading) {
    return (
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
        <h4 className="text-dark-text text-sm font-semibold mb-2"><i className="fas fa-bullseye text-orange-400 mr-2"></i>Broadcast Targets</h4>
        <p className="text-dark-text3 text-[0.75rem]">Loading targets...</p>
      </div>
    );
  }

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-dark-text text-sm font-semibold"><i className="fas fa-bullseye text-orange-400 mr-2"></i>Broadcast Targets</h4>
        <button
          onClick={() => { resetForm(); setShowAdd(true); }}
          className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-[0.72rem] font-semibold border-none cursor-pointer hover:bg-orange-600 transition-colors"
        >
          <i className="fas fa-plus mr-1"></i>Add Target
        </button>
      </div>

      {success && <div className="bg-green-900/30 border border-green-700 rounded-lg px-3 py-2 mb-3 text-green-300 text-[0.75rem]">{success}</div>}
      {error && <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 mb-3 text-red-300 text-[0.75rem]">{error}</div>}

      {targets.length === 0 && !showAdd && (
        <div className="text-dark-text3 text-[0.75rem] py-4 text-center">
          <i className="fas fa-inbox text-lg mb-2 block opacity-40"></i>
          No broadcast targets configured. Notices will fall back to env vars.
        </div>
      )}

      {targets.length > 0 && (
        <div className="space-y-2 mb-3">
          {targets.map(t => (
            <div key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${t.enabled ? 'bg-dark-bg border-dark-border' : 'bg-dark-bg3 border-dark-border opacity-50'}`}>
              <span className="text-base">{typeIcon[t.type] || '📌'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-dark-text text-[0.8rem] font-medium truncate">{t.label}</div>
                <div className="text-dark-text3 text-[0.68rem] font-mono truncate">{t.chatId}</div>
              </div>
              <span className={`text-[0.62rem] px-2 py-0.5 rounded-full font-semibold ${t.type === 'channel' ? 'bg-purple-900/40 text-purple-300' : t.type === 'group' ? 'bg-blue-900/40 text-blue-300' : 'bg-green-900/40 text-green-300'}`}>
                {typeLabel[t.type]}
              </span>
              <button
                onClick={() => handleToggle(t.id)}
                className={`w-9 h-5 rounded-full border-none cursor-pointer transition-colors relative ${t.enabled ? 'bg-green-500' : 'bg-dark-border'}`}
                title={t.enabled ? 'Disable' : 'Enable'}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${t.enabled ? 'left-[18px]' : 'left-0.5'}`}></span>
              </button>
              <button onClick={() => handleTestSend(t)} disabled={saving || !t.enabled} className="w-7 h-7 rounded-md border border-dark-border bg-dark-bg hover:bg-qsis/20 text-dark-text3 hover:text-qsis text-[0.7rem] cursor-pointer disabled:opacity-30 transition-colors flex items-center justify-center" title="Send test message">
                <i className="fas fa-paper-plane"></i>
              </button>
              <button onClick={() => startEdit(t)} className="w-7 h-7 rounded-md border border-dark-border bg-dark-bg hover:bg-blue-500/20 text-dark-text3 hover:text-blue-400 text-[0.7rem] cursor-pointer transition-colors flex items-center justify-center" title="Edit">
                <i className="fas fa-pen"></i>
              </button>
              <button onClick={() => handleDelete(t.id)} className="w-7 h-7 rounded-md border border-dark-border bg-dark-bg hover:bg-red-500/20 text-dark-text3 hover:text-red-400 text-[0.7rem] cursor-pointer transition-colors flex items-center justify-center" title="Delete">
                <i className="fas fa-trash"></i>
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="bg-dark-bg border border-dark-border rounded-lg p-4 mt-2">
          <div className="text-dark-text text-[0.78rem] font-semibold mb-3">
            {editingId ? 'Edit Broadcast Target' : 'Add Broadcast Target'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-dark-text3 text-[0.68rem] mb-1">Label *</label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.8rem] outline-none focus:border-qsis"
                placeholder="e.g. Main Channel, CSE Group"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-dark-text3 text-[0.68rem] mb-1">Chat ID *</label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.8rem] font-mono outline-none focus:border-qsis"
                placeholder="@channel_username or -100xxxxxxxxxx"
                value={formChatId}
                onChange={e => setFormChatId(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="block text-dark-text3 text-[0.68rem]">Type:</label>
            {(['channel', 'group', 'personal'] as const).map(tp => (
              <button
                key={tp}
                onClick={() => setFormType(tp)}
                className={`px-3 py-1 rounded-lg border text-[0.72rem] cursor-pointer transition-colors ${formType === tp ? 'bg-qsis text-white border-qsis' : 'bg-dark-bg text-dark-text3 border-dark-border hover:border-qsis/50'}`}
              >
                {typeIcon[tp]} {typeLabel[tp]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !formLabel.trim() || !formChatId.trim()}
              className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.75rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : editingId ? 'Update Target' : 'Add Target'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg bg-dark-bg text-dark-text3 text-[0.75rem] border border-dark-border cursor-pointer hover:text-dark-text transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="text-[0.68rem] text-dark-text3 mt-3">
        <i className="fas fa-info-circle mr-1"></i>
        {targets.length > 0
          ? `${targets.filter(t => t.enabled).length}/${targets.length} targets enabled. Notices broadcast to all enabled targets.`
          : 'No targets set — notices use TELEGRAM_CHANNEL_ID / TELEGRAM_GROUP_ID env vars as fallback.'}
      </p>
    </div>
  );
}
