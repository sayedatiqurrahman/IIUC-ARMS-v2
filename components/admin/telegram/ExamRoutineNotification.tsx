'use client';

import { useState } from 'react';
import CustomSelect from '@/components/CustomSelect';

interface ExamRoutineNotificationProps {
  allDepts: string[];
  onNotifySent: () => void;
}

export default function ExamRoutineNotification({ allDepts, onNotifySent }: ExamRoutineNotificationProps) {
  const [examDept, setExamDept] = useState('');
  const [examSemester, setExamSemester] = useState('');
  const [examMsg, setExamMsg] = useState('');
  const [examLoading, setExamLoading] = useState(false);
  const [examResult, setExamResult] = useState('');

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
        onNotifySent();
      } else {
        setExamResult(data.error || 'Failed to send');
      }
    } catch {
      setExamResult('Network error');
    } finally {
      setExamLoading(false);
    }
  }

  return (
    <div className="bg-dark-bg2 border border-orange-500/20 rounded-xl p-4 mb-4">
      <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-file-alt text-orange-400 mr-2"></i>Send Exam Routine Notification</h4>
      <p className="text-[0.72rem] text-dark-text3 mb-3">Send a formatted exam routine notification to students in a specific department and semester.</p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[0.72rem] text-dark-text2 block mb-1.5">Department *</label>
          <CustomSelect
            options={allDepts.map(d => ({ value: d, label: d }))}
            value={examDept}
            onChange={val => setExamDept(val)}
            placeholder="Select Department"
          />
        </div>
        <div>
          <label className="text-[0.72rem] text-dark-text2 block mb-1.5">Semester *</label>
          <CustomSelect
            options={[
              { value: '1', label: '1st Semester' },
              { value: '2', label: '2nd Semester' },
              { value: '3', label: '3rd Semester' },
              { value: '4', label: '4th Semester' },
              { value: '5', label: '5th Semester' },
              { value: '6', label: '6th Semester' },
              { value: '7', label: '7th Semester' },
              { value: '8', label: '8th Semester' },
            ]}
            value={examSemester}
            onChange={val => setExamSemester(val)}
            placeholder="Select Semester"
          />
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
  );
}
