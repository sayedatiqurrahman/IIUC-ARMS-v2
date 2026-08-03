'use client';

export default function ConnectedUsers({ allDepts, deptCounts }: {
  allDepts: string[];
  deptCounts: Record<string, number>;
}) {
  return (
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
  );
}
