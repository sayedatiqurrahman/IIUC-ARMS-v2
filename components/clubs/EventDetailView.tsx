'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { parseClubRoles } from '@/lib/club-member-roles';
import { CertTheme, DEFAULT_THEME } from '@/lib/cert-theme';

function parseGallery(raw?: string | null): string[] {
  try { const g = JSON.parse(raw || '[]'); return Array.isArray(g) ? g.filter((u: any) => typeof u === 'string') : []; } catch { return []; }
}

function parseTheme(raw?: string | null): CertTheme | null {
  try { const t = JSON.parse(raw || ''); return t && t.name ? t : null; } catch { return null; }
}

// Read an image file, downscale it to a sane dimension and return a data URI.
function fileToDataURI(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, w, h);
        const isPng = file.type === 'image/png';
        resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function EventDetailView({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const profile = useAppStore(s => s.profile);
  const [slug, setSlug] = useState('');
  const [eventId, setEventId] = useState('');
  const [club, setClub] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [certs, setCerts] = useState<any[]>([]);
  const [certSearch, setCertSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Editing state
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function reload() {
    const [clubRes, eventsRes] = await Promise.all([
      fetch(`/api/clubs/${slug}`),
      fetch(`/api/clubs/${slug}/events`),
    ]);
    const clubData = await clubRes.json();
    const eventsData = await eventsRes.json();
    setClub(clubData.club);
    const ev = (Array.isArray(eventsData.events) ? eventsData.events : []).find((e: any) => e.id === eventId) || null;
    setEvent(ev);
    if (!ev) setNotFound(true);
  }

  useEffect(() => {
    params.then(p => { setSlug(p.slug); setEventId(p.eventId); });
  }, []);

  useEffect(() => {
    if (!slug || !eventId) return;
    (async () => {
      try {
        await reload();
        const res = await fetch(`/api/clubs/${slug}/certificates?eventId=${encodeURIComponent(eventId)}`);
        const data = await res.json();
        setCerts(data.certificates || []);
      } catch {}
      setLoading(false);
    })();
  }, [slug, eventId]);

  // Permission mirrors the issue page (admins, officers, club admins, cert managers).
  const myMember = club?.members?.find((m: any) => m.userId === profile.email);
  const isAdmin = profile.role === 'admin' || profile.role === 'manager';
  const isOfficer = !!myMember && ['gs', 'ags', 'ogs', 'office_secretary'].includes(myMember.role);
  const isClubAdmin = !!myMember?.isClubAdmin;
  const myClubRoles = parseClubRoles(myMember?.clubRoles);
  const canManage = isAdmin || isOfficer || isClubAdmin
    || myClubRoles.includes('club_admin') || myClubRoles.includes('club_maintainer') || myClubRoles.includes('club_event_manager');

  const theme = parseTheme(event?.theme);
  const gallery = parseGallery(event?.gallery);

  function startEdit() {
    setTitle(event.title || '');
    setDesc(event.description || '');
    setDate(event.eventDate ? new Date(event.eventDate).toISOString().slice(0, 16) : '');
    setVenue(event.venue || '');
    setEditing(true);
  }

  async function saveEvent() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/events`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId, title: title.trim(), description: desc.trim(), eventDate: date || undefined, venue: venue.trim() }),
      });
      const data = await res.json();
      if (data.success) { setEditing(false); await reload(); }
      else alert(data.error || 'Failed to save event');
    } catch { alert('Failed to save event'); }
    setSaving(false);
  }

  async function deleteEvent() {
    if (!window.confirm(`Delete event "${event?.title}"? This also removes its uploaded photos and detaches its certificates.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/events`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId }),
      });
      const data = await res.json();
      if (data.success) window.location.href = `/clubs/${slug}?tab=events`;
      else alert(data.error || 'Failed to delete event');
    } catch { alert('Failed to delete event'); }
    setDeleting(false);
  }

  async function uploadImage(file: File, kind: 'cover' | 'gallery') {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const image = await fileToDataURI(file);
      const res = await fetch(`/api/clubs/${slug}/events/assets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, image, kind }),
      });
      const data = await res.json();
      if (data.success) await reload();
      else alert(data.error || 'Upload failed');
    } catch { alert('Upload failed'); }
    setUploading(false);
  }

  async function removeImage(kind: 'cover' | 'gallery', url: string) {
    if (!window.confirm('Remove this image?')) return;
    try {
      const res = await fetch(`/api/clubs/${slug}/events/assets`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, kind, url }),
      });
      const data = await res.json();
      if (data.success) await reload();
      else alert(data.error || 'Failed to remove image');
    } catch { alert('Failed to remove image'); }
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
    </div>
  );

  if (notFound || !event) return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <i className="fas fa-calendar-xmark text-dark-text2 text-4xl mb-3 block"></i>
        <h2 className="text-lg font-bold text-dark-text mb-1">Event Not Found</h2>
        <a href={`/clubs/${slug}`} className="text-qsis text-sm hover:underline"><i className="fas fa-arrow-left mr-1"></i>Back to {club?.name || 'Club'}</a>
      </div>
    </div>
  );

  const filteredCerts = certSearch
    ? certs.filter(c => (c.memberName || '').toLowerCase().includes(certSearch.toLowerCase()) || (c.universityId || '').toLowerCase().includes(certSearch.toLowerCase()) || (c.certificateId || '').toLowerCase().includes(certSearch.toLowerCase()))
    : certs;

  return (
    <div className="min-h-screen bg-dark-bg pb-10">
      {/* Cover hero */}
      <div className="relative">
        {event.coverUrl ? (
          <img src={event.coverUrl} alt={event.title} className="w-full h-56 sm:h-72 object-cover" />
        ) : (
          <div className="w-full h-56 sm:h-72 bg-gradient-to-br from-qsis/70 to-qsis relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <i className="fas fa-calendar-days text-white/70 text-5xl"></i>
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-dark-bg to-transparent pointer-events-none"></div>
        <div className="absolute top-4 left-4">
          <a href={`/clubs/${slug}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur rounded-lg text-xs text-white hover:bg-black/60 transition no-underline">
            <i className="fas fa-arrow-left"></i> Back to {club?.name || 'Club'}
          </a>
        </div>
        {canManage && (
          <div className="absolute top-4 right-4 flex gap-2">
            <button onClick={startEdit} className="px-3 py-1.5 bg-black/40 backdrop-blur rounded-lg text-xs text-white hover:bg-black/60 transition">
              <i className="fas fa-edit mr-1"></i>Edit Event
            </button>
            <button onClick={deleteEvent} disabled={deleting} className="px-3 py-1.5 bg-red-600/70 backdrop-blur rounded-lg text-xs text-white hover:bg-red-600 transition disabled:opacity-50">
              {deleting ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-trash mr-1"></i>Delete</>}
            </button>
          </div>
        )}
        {canManage && (
          <label className="absolute bottom-4 right-4 cursor-pointer px-3 py-1.5 bg-black/40 backdrop-blur rounded-lg text-xs text-white hover:bg-black/60 transition inline-flex items-center gap-1.5">
            <i className="fas fa-camera"></i> {event.coverUrl ? 'Change Cover' : 'Set Cover'}
            <input type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'cover'); e.target.value = ''; }} />
          </label>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-10 relative z-10">
        {/* Title block */}
        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-dark-text leading-tight">{event.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-dark-text2">
                {event.eventDate && (
                  <span><i className="fas fa-calendar-check mr-1.5 text-qsis"></i>{new Date(event.eventDate).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                )}
                {event.venue && <span><i className="fas fa-location-dot mr-1.5 text-qsis"></i>{event.venue}</span>}
              </div>
              {theme && (
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className="text-dark-text2">Certificate design:</span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-qsis/30 bg-qsis/10 text-qsis font-semibold">
                    <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: `rgb(${theme.colors.primary.join(',')})` }}></span>
                    {theme.displayName || DEFAULT_THEME.displayName}
                  </span>
                  {canManage && <a href={`/clubs/${slug}/certificates/issue`} className="text-qsis font-semibold hover:underline"><i className="fas fa-cog mr-0.5"></i>Design</a>}
                </div>
              )}
            </div>
            <span className="text-xs text-dark-text3">{certs.length} certificate{certs.length !== 1 ? 's' : ''} linked</span>
          </div>
          {event.description && <p className="text-sm text-dark-text mt-4 leading-relaxed whitespace-pre-wrap">{event.description}</p>}
        </div>

        {/* Inline edit form */}
        {editing && (
          <div className="bg-dark-bg2 border border-qsis/40 rounded-2xl p-5 mt-4">
            <h3 className="text-sm font-bold text-dark-text mb-3"><i className="fas fa-edit text-qsis mr-2"></i>Edit Event</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[0.68rem] text-dark-text2 mb-1 block">Title *</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis" />
              </div>
              <div>
                <label className="text-[0.68rem] text-dark-text2 mb-1 block">Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis resize-none" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[0.68rem] text-dark-text2 mb-1 block">Date & Time</label>
                  <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis" />
                </div>
                <div>
                  <label className="text-[0.68rem] text-dark-text2 mb-1 block">Venue</label>
                  <input type="text" value={venue} onChange={e => setVenue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveEvent} disabled={saving || !title.trim()}
                  className="px-5 py-2 bg-qsis text-white rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
                  {saving ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-1"></i>Save</>}
                </button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 bg-dark-bg3 text-dark-text border border-dark-border rounded-lg text-sm font-semibold hover:border-qsis transition">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Photo gallery */}
        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 sm:p-6 mt-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-images text-qsis mr-2"></i>Event Photos ({gallery.length + (event.coverUrl ? 1 : 0)})</h3>
            {canManage && (
              <label className="cursor-pointer px-3 py-1.5 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition inline-flex items-center gap-1.5">
                {uploading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-upload"></i>} Upload Photos
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    files.forEach((f, i) => setTimeout(() => uploadImage(f, 'gallery'), i * 250));
                    e.target.value = '';
                  }} />
              </label>
            )}
          </div>

          {gallery.length === 0 && !event.coverUrl ? (
            <p className="text-sm text-dark-text2 text-center py-8">
              <i className="fas fa-camera-retro text-2xl block mb-2 opacity-40"></i>
              No photos yet{canManage ? ' — upload the first one above. Photos are stored under the club\'s GitHub assets folder.' : '.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {event.coverUrl && (
                <PhotoCard url={event.coverUrl} label="Cover" onRemove={canManage ? () => removeImage('cover', event.coverUrl) : null} />
              )}
              {gallery.map(url => (
                <PhotoCard key={url} url={url} onRemove={canManage ? () => removeImage('gallery', url) : null} />
              ))}
            </div>
          )}
        </div>

        {/* Certificates */}
        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 sm:p-6 mt-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-award text-yellow-400 mr-2"></i>Certificates ({certs.length})</h3>
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-dark-text2 text-sm"></i>
              <input type="text" value={certSearch} onChange={e => setCertSearch(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis transition"
                placeholder="Search name, ID, certificate..." />
            </div>
          </div>
          {filteredCerts.length === 0 ? (
            <p className="text-sm text-dark-text2 text-center py-8">
              <i className="fas fa-award text-2xl block mb-2 opacity-40"></i>
              {certSearch ? 'No certificates match your search' : 'No certificates issued for this event yet'}
              {canManage && !certSearch && (
                <a href={`/clubs/${slug}/certificates/issue`} className="text-qsis font-semibold hover:underline block mt-1"><i className="fas fa-plus mr-0.5"></i>Issue certificates</a>
              )}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredCerts.map(c => (
                <div key={c.id || c.certificateId} className="flex items-center gap-3 bg-dark-bg border border-dark-border rounded-xl p-3">
                  <div className="w-9 h-9 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                    <i className="fas fa-award text-yellow-400 text-sm"></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-bold text-dark-text">{c.certificateId}</p>
                    <p className="text-xs text-dark-text2 truncate">{c.memberName} · <span className="font-mono">{c.universityId}</span></p>
                  </div>
                  <a href={`/clubs/preview/${c.certificateId}`} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 flex items-center justify-center bg-qsis/15 text-qsis border border-qsis/30 rounded-lg hover:bg-qsis/20 transition no-underline shrink-0">
                    <i className="fas fa-external-link-alt text-xs"></i>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoCard({ url, label, onRemove }: { url: string; label?: string; onRemove: (() => void) | null }) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-dark-border group bg-dark-bg">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={label || 'Event photo'} className="w-full aspect-square object-cover transition group-hover:opacity-90" loading="lazy" />
      </a>
      {label && (
        <span className="absolute top-2 left-2 text-[0.55rem] px-1.5 py-0.5 rounded bg-black/50 text-white font-semibold uppercase">Cover</span>
      )}
      {onRemove && (
        <button onClick={() => onRemove()} title="Remove photo"
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-red-600/80 hover:bg-red-600 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition">
          <i className="fas fa-times"></i>
        </button>
      )}
    </div>
  );
}