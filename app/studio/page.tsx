import Link from 'next/link';

const APPS = [
  {
    href: '/studio/compressor',
    icon: 'fas fa-file-zipper',
    bg: 'bg-qsis/15',
    color: 'text-qsis',
    title: 'File Compressor',
    sub: 'Shrink images, scanned PDFs, DOCX, PPTX & EPUB and download the result.',
  },
  {
    href: '/studio/scanner',
    icon: 'fas fa-camera-retro',
    bg: 'bg-accent/15',
    color: 'text-accent',
    title: 'Document Scanner',
    sub: 'Capture, crop, enhance, merge to PDF and run OCR — save straight to your device.',
  },
  {
    href: '/studio/whiteboard',
    icon: 'fas fa-draw-polygon',
    bg: 'bg-violet-500/15',
    color: 'text-violet-400',
    title: 'Whiteboard',
    sub: 'Full drawing canvas — shapes, arrows, freehand, text & the magic laser. Save drafts on your device and resume them anytime.',
  },
  {
    href: '/studio/creative-hub',
    icon: 'fas fa-palette',
    bg: 'bg-indigo-500/15',
    color: 'text-indigo-400',
    title: 'Creative Hub',
    sub: 'Design templates, thesis covers, assignment covers & community gallery. Save locally, publish to GitHub.',
  },
];

export default function StudioPage() {
  return (
    <div className="min-h-[60vh]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-dark-text">
          <i className="fas fa-tools text-qsis mr-2"></i>Studio
        </h1>
        <p className="text-[0.78rem] text-dark-text2 mt-1 max-w-xl">
          Free tools for students and users. Pick an app — no login, no file upload.
          Everything runs in your browser and stays on your device.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {APPS.map(app => (
          <Link
            key={app.href}
            href={app.href}
            className="group rounded-2xl border border-dark-border bg-dark-bg2 p-5 hover:border-qsis/50 hover:bg-dark-bg3 transition-all no-underline"
          >
            <div className={`w-12 h-12 rounded-2xl ${app.bg} flex items-center justify-center mb-3`}>
              <i className={`${app.icon} ${app.color} text-xl`}></i>
            </div>
            <h3 className="text-[0.9rem] font-bold text-dark-text mb-1 flex items-center gap-2">
              {app.title}
              <i className="fas fa-arrow-right text-dark-text3 group-hover:text-qsis text-xs transition-colors"></i>
            </h3>
            <p className="text-[0.72rem] text-dark-text2 leading-relaxed">{app.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
