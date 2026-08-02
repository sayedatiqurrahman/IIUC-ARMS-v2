'use client';

import { useState, useEffect } from 'react';
import { config } from '@/lib/config';

export default function TelegramTab({ isOwner, effectiveRole }: { isOwner: boolean; effectiveRole?: string }) {
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');
  const [botStatus, setBotStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [botInfo, setBotInfo] = useState<any>(null);
  const [notifyDepts, setNotifyDepts] = useState<string[]>([]);
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResult, setNotifyResult] = useState('');
  const [notifySemester, setNotifySemester] = useState('');
  const [allDeptsSelected, setAllDeptsSelected] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [examDept, setExamDept] = useState('');
  const [examSemester, setExamSemester] = useState('');
  const [examMsg, setExamMsg] = useState('');
  const [examLoading, setExamLoading] = useState(false);
  const [examResult, setExamResult] = useState('');

  const allDepts = ['CSE', 'EEE', 'BBA', 'ENG', 'ARCH', 'LLB', 'PHARM'];

  useEffect(() => {
    fetch('/api/telegram/broadcast')
      .then(r => r.json())
      .then(data => {
        setBotStatus(data.success ? 'ok' : 'error');
        setBotInfo(data);
      })
      .catch(() => setBotStatus('error'));

    fetch('/api/telegram/department-notify?action=connected-count')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setConnectedCount(data.total || 0);
          setDeptCounts(data.byDept || {});
        }
      })
      .catch(() => {});

    loadHistory();
  }, []);

  function loadHistory() {
    setHistoryLoading(true);
    fetch('/api/telegram/department-notify?action=history&limit=20')
      .then(r => r.json())
      .then(data => { setHistory(data.history || []); setHistoryLoading(false); })
      .catch(() => setHistoryLoading(false));
  }

  async function handleBroadcast() {
    if (!broadcastMsg.trim() || !isOwner) return;
    setBroadcastLoading(true);
    setBroadcastResult('');
    try {
      const res = await fetch('/api/telegram/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setBroadcastResult('Message sent to channel!');
        setBroadcastMsg('');
      } else {
        setBroadcastResult(data.error || 'Failed to send');
      }
    } catch {
      setBroadcastResult('Network error');
    } finally {
      setBroadcastLoading(false);
    }
  }

  async function handleDeptNotify() {
    if (!notifyMsg.trim() || notifyDepts.length === 0) return;
    setNotifyLoading(true);
    setNotifyResult('');
    try {
      const res = await fetch('/api/telegram/department-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departments: allDeptsSelected ? ['ALL'] : notifyDepts,
          message: notifyMsg.trim(),
          title: notifyTitle.trim() || undefined,
          semester: notifySemester || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotifyResult(data.message || 'Sent!');
        setNotifyMsg('');
        setNotifyTitle('');
        loadHistory();
      } else {
        setNotifyResult(data.error || 'Failed');
      }
    } catch {
      setNotifyResult('Network error');
    } finally {
      setNotifyLoading(false);
    }
  }

  function toggleDept(dept: string) {
    setNotifyDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);
  }

  async function handleExamRoutineNotify() {
    if (!examDept || !examSemester || !examMsg.trim()) return;
    setExamLoading(true);
    setExamResult('');
    try {
      const formattedMsg = `📋 <b>Exam Routine Update</b>\n\n` +
        `🏛 Department: <b>${examDept}</b>\n` +
        `📅 Semester: <b>${examSemester}</b>\n\n` +
        `${examMsg.trim()}\n\n` +
        `<i>Please prepare accordingly. Good luck!</i>`;
      const res = await fetch('/api/telegram/department-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departments: [examDept],
          message: formattedMsg,
          title: `${examDept} - Semester ${examSemester} Exam Routine`,
          semester: examSemester,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setExamResult(data.message || 'Exam routine notification sent!');
        setExamMsg('');
        loadHistory();
      } else {
        setExamResult(data.error || 'Failed to send');
      }
    } catch {
      setExamResult('Network error');
    } finally {
      setExamLoading(false);
    }
  }

  const botCommands = [
    { cmd: '/start', desc: 'Welcome message & main menu' },
    { cmd: '/help', desc: 'List all available commands' },
    { cmd: '/courses', desc: 'List all courses (dept > sem > courses)' },
    { cmd: '/search notes', desc: 'Search files by name' },
    { cmd: '/stats', desc: 'View site statistics' },
    { cmd: '/broadcast <msg>', desc: 'Send announcement (owner only)' },
    { cmd: 'QUR101', desc: 'Search course by code (any format)' },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-dark-text mb-3"><i className="fas fa-paper-plane text-cyan-400 mr-2"></i>Telegram Bot & Notifications</h3>

      {/* Bot Status */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${botStatus === 'ok' ? 'bg-green-400' : botStatus === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`}></div>
          <div className="flex-1">
            <p className="text-dark-text text-sm font-semibold">IIUC-ARMS Bot</p>
            <p className="text-dark-text3 text-[0.72rem]">
              {botStatus === 'ok' ? `Bot is online · ${botInfo?.users || 0} registered users` : botStatus === 'loading' ? 'Checking...' : 'Bot is offline or token missing'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-green-400 text-[0.82rem] font-bold">{connectedCount}</p>
            <p className="text-dark-text3 text-[0.65rem]">Connected</p>
          </div>
        </div>
      </div>

      {/* Department-wise Connected Users */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
        <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-users text-qsis mr-2"></i>Connected Users by Department</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {allDepts.map(dept => (
            <div key={dept} className="bg-dark-bg rounded-lg p-2.5 border border-dark-border text-center">
              <p className="text-dark-text font-bold text-sm">{deptCounts[dept] || 0}</p>
              <p className="text-dark-text3 text-[0.65rem]">{dept}</p>
            </div>
          ))}
        </div>
        <p className="text-[0.65rem] text-dark-text3 mt-2"><i className="fas fa-info-circle mr-1"></i>Users who set their Telegram ID in profile AND started the bot</p>
      </div>

      {/* Department-wise Notification */}
      {(isOwner || effectiveRole === 'admin') && (
        <div className="bg-dark-bg2 border border-qsis/20 rounded-xl p-4 mb-4">
          <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-building text-teal-400 mr-2"></i>Send Department Notification</h4>
          <p className="text-[0.72rem] text-dark-text3 mb-3">Send a direct message to all connected users in selected departments. Only users who set their Telegram ID and started the bot will receive it.</p>

          <div className="mb-3">
            <label className="text-[0.72rem] text-dark-text2 block mb-1.5">Departments</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setAllDeptsSelected(prev => !prev);
                  setNotifyDepts([]);
                  setNotifySemester('');
                }}
                className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold border cursor-pointer transition-all ${
                  allDeptsSelected
                    ? 'bg-yellow-500 text-white border-yellow-500'
                    : 'bg-dark-bg border-dark-border text-dark-text2 hover:border-yellow-500/50'
                }`}
              >
                <i className="fas fa-globe mr-1"></i>All Depts
              </button>
              {allDepts.map(dept => {
                const count = deptCounts[dept] || 0;
                const selected = notifyDepts.includes(dept);
                return (
                  <button
                    key={dept}
                    onClick={() => {
                      setAllDeptsSelected(false);
                      if (notifyDepts.includes(dept)) {
                        setNotifyDepts(prev => prev.filter(d => d !== dept));
                        if (notifyDepts.filter(d => d !== dept).length === 0) setNotifySemester('');
                      } else {
                        setNotifyDepts(prev => [...prev, dept]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold border cursor-pointer transition-all ${
                      selected
                        ? 'bg-qsis text-white border-qsis'
                        : 'bg-dark-bg border-dark-border text-dark-text2 hover:border-qsis/50'
                    }`}
                  >
                    {dept} <span className={`ml-1 text-[0.65rem] ${selected ? 'opacity-80' : 'text-dark-text3'}`}>({count})</span>
                  </button>
                );
              })}
            </div>
            {allDeptsSelected ? (
              <p className="text-[0.68rem] text-yellow-400 mt-1.5">
                <i className="fas fa-globe mr-1"></i>
                All Departments · ~{connectedCount} users will receive this
              </p>
            ) : notifyDepts.length > 0 ? (
              <p className="text-[0.68rem] text-qsis mt-1.5">
                <i className="fas fa-check-circle mr-1"></i>
                {notifyDepts.length} dept{notifyDepts.length > 1 ? 's' : ''} selected · ~{notifyDepts.reduce((sum, d) => sum + (deptCounts[d] || 0), 0)} users will receive this
              </p>
            ) : null}
          </div>

          {/* Semester selector - show only when a single department is selected */}
          {!allDeptsSelected && notifyDepts.length === 1 && (
            <div className="mb-3">
              <label className="text-[0.72rem] text-dark-text2 block mb-1.5">Semester</label>
              <select
                value={notifySemester}
                onChange={e => setNotifySemester(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
              >
                <option value="">All Semesters</option>
                <option value="1">1st Semester</option>
                <option value="2">2nd Semester</option>
                <option value="3">3rd Semester</option>
                <option value="4">4th Semester</option>
                <option value="5">5th Semester</option>
                <option value="6">6th Semester</option>
                <option value="7">7th Semester</option>
                <option value="8">8th Semester</option>
              </select>
              <p className="text-[0.65rem] text-dark-text3 mt-0.5">
                {notifySemester
                  ? `Sending to ${notifyDepts[0]} Semester ${notifySemester} students only`
                  : `Sending to all semesters in ${notifyDepts[0]}`}
              </p>
            </div>
          )}

          <div className="mb-3">
            <label className="text-[0.72rem] text-dark-text2 block mb-1">Title <span className="text-dark-text3">(optional)</span></label>
            <input
              type="text"
              value={notifyTitle}
              onChange={e => setNotifyTitle(e.target.value)}
              placeholder="e.g. CSE Routine Update"
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
            />
          </div>

          <div className="mb-3">
            <label className="text-[0.72rem] text-dark-text2 block mb-1">Message *</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis resize-y min-h-[80px]"
              placeholder="Type your notification... (HTML supported: <b>bold</b>, <i>italic</i>, <a href='...'>link</a>)"
              value={notifyMsg}
              onChange={e => setNotifyMsg(e.target.value)}
              maxLength={2000}
            />
            <p className="text-[0.65rem] text-dark-text3 mt-0.5">{notifyMsg.length}/2000 characters</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDeptNotify}
              disabled={notifyLoading || !notifyMsg.trim() || (!allDeptsSelected && notifyDepts.length === 0)}
              className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {notifyLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Sending...</> : (
                allDeptsSelected
                  ? <><i className="fas fa-paper-plane mr-1"></i>Send to All Depts</>
                  : <><i className="fas fa-paper-plane mr-1"></i>Send to {notifyDepts.length || ''} Dept{notifyDepts.length !== 1 ? 's' : ''}</>
              )}
            </button>
            {notifyResult && (
              <span className={`text-[0.72rem] ${notifyResult.includes('Sent') || notifyResult.includes('success') ? 'text-green-400' : 'text-red-400'}`}>{notifyResult}</span>
            )}
          </div>
        </div>
      )}

      {/* Commands Reference */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
        <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-terminal text-qsis mr-2"></i>Bot Commands</h4>
        <div className="space-y-1.5">
          {botCommands.map((c, i) => (
            <div key={i} className="flex items-start gap-3 text-[0.78rem]">
              <code className="bg-dark-bg3 px-1.5 py-0.5 rounded text-qsis font-mono whitespace-nowrap">{c.cmd}</code>
              <span className="text-dark-text2">{c.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Channel Broadcast */}
      {isOwner && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
          <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-bullhorn text-yellow-400 mr-2"></i>Channel Broadcast</h4>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis resize-y min-h-[80px] mb-2"
            placeholder="Type your announcement message... (HTML supported: <b>bold</b>, <i>italic</i>, <code>code</code>)"
            value={broadcastMsg}
            onChange={e => setBroadcastMsg(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleBroadcast}
              disabled={broadcastLoading || !broadcastMsg.trim()}
              className="px-4 py-2 rounded-lg bg-yellow-500 text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {broadcastLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Sending...</> : <><i className="fas fa-paper-plane mr-1"></i>Send to Channel</>}
            </button>
            {broadcastResult && (
              <span className={`text-[0.72rem] ${broadcastResult.includes('success') ? 'text-green-400' : 'text-red-400'}`}>{broadcastResult}</span>
            )}
          </div>
          <p className="text-[0.68rem] text-dark-text3 mt-2">
            <i className="fas fa-info-circle mr-1"></i>
            Sends to the Telegram channel (@iiuc_arms). Use department notification above for DMs.
          </p>
        </div>
      )}

      {/* Exam Routine Notification */}
      {(isOwner || effectiveRole === 'admin') && (
        <div className="bg-dark-bg2 border border-orange-500/20 rounded-xl p-4 mb-4">
          <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-file-alt text-orange-400 mr-2"></i>Send Exam Routine Notification</h4>
          <p className="text-[0.72rem] text-dark-text3 mb-3">Send a formatted exam routine notification to students in a specific department and semester.</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1.5">Department *</label>
              <select
                value={examDept}
                onChange={e => setExamDept(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
              >
                <option value="">Select Department</option>
                {allDepts.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1.5">Semester *</label>
              <select
                value={examSemester}
                onChange={e => setExamSemester(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
              >
                <option value="">Select Semester</option>
                <option value="1">1st Semester</option>
                <option value="2">2nd Semester</option>
                <option value="3">3rd Semester</option>
                <option value="4">4th Semester</option>
                <option value="5">5th Semester</option>
                <option value="6">6th Semester</option>
                <option value="7">7th Semester</option>
                <option value="8">8th Semester</option>
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="text-[0.72rem] text-dark-text2 block mb-1">Exam Routine Details *</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis resize-y min-h-[100px]"
              placeholder={`e.g. Mid-term exam will be held on:\n\n📅 Date: 15th August 2026\n⏰ Time: 9:00 AM - 12:00 PM\n📖 Course: CSE-301 - Data Structures\n\n📌 Hall: Room 301, Building A\n⚠️ Bring your student ID card`}
              value={examMsg}
              onChange={e => setExamMsg(e.target.value)}
              maxLength={2000}
            />
            <p className="text-[0.65rem] text-dark-text3 mt-0.5">{examMsg.length}/2000 characters</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExamRoutineNotify}
              disabled={examLoading || !examMsg.trim() || !examDept || !examSemester}
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {examLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Sending...</> : <><i className="fas fa-paper-plane mr-1"></i>Send Exam Routine</>}
            </button>
            {examResult && (
              <span className={`text-[0.72rem] ${examResult.includes('Sent') || examResult.includes('success') ? 'text-green-400' : 'text-red-400'}`}>{examResult}</span>
            )}
          </div>
        </div>
      )}

      {/* Notification History */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-dark-text text-sm font-semibold"><i className="fas fa-history text-dark-text2 mr-2"></i>Notification History</h4>
          <button onClick={loadHistory} className="text-[0.7rem] text-qsis hover:underline cursor-pointer bg-transparent border-none">Refresh</button>
        </div>
        {historyLoading ? (
          <p className="text-dark-text3 text-[0.78rem]"><i className="fas fa-spinner fa-spin mr-1"></i>Loading...</p>
        ) : history.length === 0 ? (
          <p className="text-dark-text3 text-[0.78rem]">No notifications sent yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {history.map((h: any) => (
              <div key={h.id} className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[0.7rem] px-1.5 py-0.5 rounded bg-dark-bg3 text-dark-text2 font-mono">{h.type}</span>
                      <span className="text-[0.7rem] text-dark-text3">{h.department}</span>
                    </div>
                    <p className="text-[0.78rem] text-dark-text font-medium truncate">{h.title}</p>
                    <p className="text-[0.68rem] text-dark-text3 truncate mt-0.5">{h.message.substring(0, 100)}...</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[0.75rem] text-green-400 font-bold">{h.recipientCount}</p>
                    <p className="text-[0.6rem] text-dark-text3">sent</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[0.62rem] text-dark-text3">
                  <span><i className="fas fa-user mr-0.5"></i>{h.sentBy || 'system'}</span>
                  <span>·</span>
                  <span>{new Date(h.sentAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
