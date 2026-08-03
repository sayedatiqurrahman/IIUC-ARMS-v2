'use client';

import { useState } from 'react';
import CustomSelect from '@/components/CustomSelect';

interface DepartmentNotificationProps {
  allDepts: string[];
  deptCounts: Record<string, number>;
  connectedCount: number;
  onNotifySent: () => void;
}

export default function DepartmentNotification({ allDepts, deptCounts, connectedCount, onNotifySent }: DepartmentNotificationProps) {
  const [notifyDepts, setNotifyDepts] = useState<string[]>([]);
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResult, setNotifyResult] = useState('');
  const [notifySemester, setNotifySemester] = useState('');
  const [allDeptsSelected, setAllDeptsSelected] = useState(false);

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
        onNotifySent();
      } else {
        setNotifyResult(data.error || 'Failed');
      }
    } catch {
      setNotifyResult('Network error');
    } finally {
      setNotifyLoading(false);
    }
  }

  return (
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

      {!allDeptsSelected && notifyDepts.length === 1 && (
        <div className="mb-3">
          <label className="text-[0.72rem] text-dark-text2 block mb-1.5">Semester</label>
          <CustomSelect
            options={[
              { value: '', label: 'All Semesters' },
              { value: '1', label: '1st Semester' },
              { value: '2', label: '2nd Semester' },
              { value: '3', label: '3rd Semester' },
              { value: '4', label: '4th Semester' },
              { value: '5', label: '5th Semester' },
              { value: '6', label: '6th Semester' },
              { value: '7', label: '7th Semester' },
              { value: '8', label: '8th Semester' },
            ]}
            value={notifySemester}
            onChange={val => setNotifySemester(val)}
            placeholder="All Semesters"
          />
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
  );
}
