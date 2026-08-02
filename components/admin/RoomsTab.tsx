'use client';
import { useState, useEffect, useCallback, useMemo } from 'react'
import { FACULTIES } from '@/lib/departments'
import CustomSelect from '@/components/CustomSelect'

export default function RoomsTab({ effectiveRole }: { effectiveRole: string }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dept, setDept] = useState('qsis');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('40');
  const [gender, setGender] = useState('both');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [numColumns, setNumColumns] = useState('');
  const [chairsPerColumn, setChairsPerColumn] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<any>({});

  const deptOptions = useMemo(() => FACULTIES.flatMap(f => f.departments.map(d => ({
    value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: f.shortName,
  }))), []);

  const genderOptions = [
    { value: 'both', label: 'All Genders', icon: 'fa-venus-mars' },
    { value: 'male', label: 'MAZ Only', icon: 'fa-mars' },
    { value: 'female', label: 'FAZ Only', icon: 'fa-venus' },
  ];

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms?department=${dept}`);
      const data = await res.json();
      if (data.success) setRooms(data.rooms);
    } catch {}
    setLoading(false);
  }, [dept]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const addRoom = async () => {
    if (!name.trim()) { setError('Enter room name'); return; }
    setError(''); setSuccess('');
    try {
      const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        department: dept, name: name.trim(), capacity: parseInt(capacity) || 40, gender,
        building: building.trim() || undefined, floor: floor.trim() || undefined,
        numberOfColumns: numColumns ? parseInt(numColumns) : undefined,
        chairsPerColumn: chairsPerColumn ? parseInt(chairsPerColumn) : undefined,
      })});
      const data = await res.json();
      if (data.success) { setSuccess('Room added'); setName(''); setCapacity('40'); setBuilding(''); setFloor(''); setNumColumns(''); setChairsPerColumn(''); loadRooms(); setTimeout(() => setSuccess(''), 2000); }
      else setError(data.error || 'Failed');
    } catch { setError('Network error'); }
  };

  const startEdit = (r: any) => {
    setEditId(r.id);
    setEditFields({ name: r.name, capacity: String(r.capacity || 40), gender: r.gender, building: r.building || '', floor: r.floor || '', numberOfColumns: r.numberOfColumns ? String(r.numberOfColumns) : '', chairsPerColumn: r.chairsPerColumn ? String(r.chairsPerColumn) : '' });
  };

  const saveEdit = async () => {
    if (!editId) return;
    try {
      const res = await fetch('/api/rooms', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...editFields, capacity: parseInt(editFields.capacity) || 40 }) });
      const data = await res.json();
      if (data.success) { setEditId(null); setSuccess('Room updated'); loadRooms(); setTimeout(() => setSuccess(''), 2000); }
      else setError(data.error || 'Failed');
    } catch { setError('Network error'); }
  };

  const deleteRoom = async (id: string) => {
    try { await fetch(`/api/rooms?id=${id}`, { method: 'DELETE' }); loadRooms(); } catch {}
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-dark-text"><i className="fas fa-door-open text-cyan-400 mr-2"></i>Room Management</h3>
      <p className="text-[0.72rem] text-dark-text3">Manage exam rooms per department. Optionally set layout (columns & chairs per column).</p>
      {success && <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs"><i className="fas fa-check mr-1"></i>{success}</div>}
      {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"><i className="fas fa-exclamation-triangle mr-1"></i>{error}</div>}

      <div className="p-4 bg-dark-bg2 border border-dark-border rounded-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          <div>
            <label className="text-[0.68rem] text-dark-text3 mb-0.5 block">Department *</label>
            <CustomSelect value={dept} onChange={setDept} options={deptOptions} placeholder="Select..." searchable className="w-full" />
          </div>
          <div>
            <label className="text-[0.68rem] text-dark-text3 mb-0.5 block">Room Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 301-A" className="w-full px-2.5 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
          </div>
          <div>
            <label className="text-[0.68rem] text-dark-text3 mb-0.5 block">Capacity</label>
            <input value={capacity} onChange={e => setCapacity(e.target.value)} type="number" placeholder="40" className="w-full px-2.5 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
          </div>
          <div>
            <label className="text-[0.68rem] text-dark-text3 mb-0.5 block">Gender</label>
            <CustomSelect value={gender} onChange={setGender} options={genderOptions} className="w-full" />
          </div>
          <div>
            <label className="text-[0.68rem] text-dark-text3 mb-0.5 block">Building</label>
            <input value={building} onChange={e => setBuilding(e.target.value)} placeholder="Optional" className="w-full px-2.5 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
          </div>
          <div>
            <label className="text-[0.68rem] text-dark-text3 mb-0.5 block">Floor</label>
            <input value={floor} onChange={e => setFloor(e.target.value)} placeholder="Optional" className="w-full px-2.5 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
          </div>
          <div>
            <label className="text-[0.68rem] text-dark-text3 mb-0.5 block">Columns (optional)</label>
            <input value={numColumns} onChange={e => setNumColumns(e.target.value)} type="number" placeholder="e.g. 5" className="w-full px-2.5 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
          </div>
          <div>
            <label className="text-[0.68rem] text-dark-text3 mb-0.5 block">Chairs per Column</label>
            <input value={chairsPerColumn} onChange={e => setChairsPerColumn(e.target.value)} type="number" placeholder="e.g. 8" className="w-full px-2.5 py-1.5 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis" />
          </div>
        </div>
        <button onClick={addRoom} className="routine-btn routine-btn-primary text-[0.72rem]"><i className="fas fa-plus mr-1"></i>Add Room</button>
      </div>

      {loading ? <div className="text-center py-6"><i className="fas fa-spinner fa-spin text-qsis text-xl"></i></div> : (
        <div className="space-y-1.5">
          {rooms.length === 0 && <p className="text-dark-text3 text-xs text-center py-4">No rooms for this department</p>}
          {rooms.map(r => (
            <div key={r.id} className={`p-2.5 bg-dark-bg2 border rounded-lg ${editId === r.id ? 'border-qsis' : 'border-dark-border'}`}>
              {editId === r.id ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input value={editFields.name} onChange={e => setEditFields((f: any) => ({ ...f, name: e.target.value }))} className="px-2 py-1 rounded border border-qsis bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Name" />
                  <input value={editFields.capacity} onChange={e => setEditFields((f: any) => ({ ...f, capacity: e.target.value }))} type="number" className="px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Capacity" />
                  <CustomSelect value={editFields.gender} onChange={v => setEditFields((f: any) => ({ ...f, gender: v }))} options={genderOptions} size="sm" />
                  <input value={editFields.building} onChange={e => setEditFields((f: any) => ({ ...f, building: e.target.value }))} className="px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Building" />
                  <input value={editFields.floor} onChange={e => setEditFields((f: any) => ({ ...f, floor: e.target.value }))} className="px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Floor" />
                  <input value={editFields.numberOfColumns} onChange={e => setEditFields((f: any) => ({ ...f, numberOfColumns: e.target.value }))} type="number" className="px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Columns" />
                  <input value={editFields.chairsPerColumn} onChange={e => setEditFields((f: any) => ({ ...f, chairsPerColumn: e.target.value }))} type="number" className="px-2 py-1 rounded border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Chairs/Col" />
                  <div className="flex gap-1">
                    <button onClick={saveEdit} className="text-green-400 hover:text-green-300 bg-transparent border-none cursor-pointer text-[0.7rem]"><i className="fas fa-check"></i></button>
                    <button onClick={() => setEditId(null)} className="text-dark-text3 hover:text-dark-text bg-transparent border-none cursor-pointer text-[0.7rem]"><i className="fas fa-times"></i></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <i className={`fas fa-door-open ${r.gender === 'male' ? 'text-blue-400' : r.gender === 'female' ? 'text-pink-400' : 'text-dark-text3'}`}></i>
                  <div className="flex-1 min-w-0">
                    <span className="text-[0.78rem] font-semibold text-dark-text">{r.name}</span>
                    <span className="text-[0.65rem] text-dark-text3 ml-2">{r.capacity} seats</span>
                    {r.numberOfColumns && <span className="text-[0.65rem] text-dark-text3 ml-1">&middot; {r.numberOfColumns} cols</span>}
                    {r.chairsPerColumn && <span className="text-[0.65rem] text-dark-text3 ml-1">&middot; {r.chairsPerColumn}/col</span>}
                    {r.building && <span className="text-[0.65rem] text-dark-text3 ml-1">&middot; {r.building}</span>}
                    {r.floor && <span className="text-[0.65rem] text-dark-text3 ml-1">F{r.floor}</span>}
                  </div>
                  <span className={`text-[0.6rem] px-1.5 py-0.5 rounded ${r.gender === 'male' ? 'bg-blue-500/15 text-blue-400' : r.gender === 'female' ? 'bg-pink-500/15 text-pink-400' : 'bg-dark-bg border border-dark-border text-dark-text3'}`}>{r.gender === 'both' ? 'ALL' : r.gender === 'male' ? 'MAZ' : 'FAZ'}</span>
                  {(effectiveRole === 'admin' || effectiveRole === 'manager') && (
                    <>
                      <button onClick={() => startEdit(r)} className="text-qsis hover:text-qsis/80 bg-transparent border-none cursor-pointer text-[0.68rem]"><i className="fas fa-edit"></i></button>
                      <button onClick={() => deleteRoom(r.id)} className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-[0.68rem]"><i className="fas fa-trash"></i></button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
