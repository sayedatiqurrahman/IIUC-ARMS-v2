'use client';

import { useState, useEffect } from 'react';
import BotStatus from './telegram/BotStatus';
import ConnectedUsers from './telegram/ConnectedUsers';
import BotCommands from './telegram/BotCommands';
import DepartmentNotification from './telegram/DepartmentNotification';
import ChannelBroadcast from './telegram/ChannelBroadcast';
import ExamRoutineNotification from './telegram/ExamRoutineNotification';
import NotificationHistory from './telegram/NotificationHistory';

export default function TelegramTab({ isOwner, effectiveRole }: { isOwner: boolean; effectiveRole?: string }) {
  const [botStatus, setBotStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [botInfo, setBotInfo] = useState<any>(null);
  const [connectedCount, setConnectedCount] = useState(0);
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>({});
  const [faculties, setFaculties] = useState<{ id: string; name: string; shortName: string; departments: { id: string; name: string; shortName: string }[] }[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const allDepts = faculties.flatMap(f => f.departments.map(d => d.shortName));

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

    fetch('/api/faculty-departments')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setFaculties([...(data.builtInFaculties || []), ...(data.customFaculties || [])]);
        }
      })
      .catch(() => {});
  }, []);

  function handleNotifySent() {
    setHistoryRefresh(prev => prev + 1);
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-dark-text mb-3"><i className="fas fa-paper-plane text-cyan-400 mr-2"></i>Telegram Bot & Notifications</h3>

      <BotStatus botStatus={botStatus} botInfo={botInfo} connectedCount={connectedCount} />

      <ConnectedUsers allDepts={allDepts} deptCounts={deptCounts} />

      {(isOwner || effectiveRole === 'admin') && (
        <DepartmentNotification
          allDepts={allDepts}
          deptCounts={deptCounts}
          connectedCount={connectedCount}
          onNotifySent={handleNotifySent}
        />
      )}

      <BotCommands />

      {isOwner && <ChannelBroadcast />}

      {(isOwner || effectiveRole === 'admin') && (
        <ExamRoutineNotification allDepts={allDepts} onNotifySent={handleNotifySent} />
      )}

      <NotificationHistory refreshTrigger={historyRefresh} />
    </div>
  );
}
