'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];
const TIMES = [
  '8:00 AM - 9:20 AM',
  '9:30 AM - 10:50 AM',
  '11:00 AM - 12:20 PM',
  '12:30 PM - 1:50 PM',
  '2:00 PM - 3:20 PM',
  '3:30 PM - 4:50 PM',
];

function getSlot(day: string, time: string, data: any[]) {
  return data.find((r: any) => r.day === day && r.time === time);
}

export default function RoutineView() {
  const router = useRouter();
  const routineData = useAppStore(s => s.routineData);
  const routineLoading = useAppStore(s => s.routineLoading);
  const loadRoutine = useAppStore(s => s.loadRoutine);
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (routineData.length === 0 && !routineLoading) {
      loadRoutine();
    }
  }, [routineData.length, routineLoading, loadRoutine]);

  const handleExport = useCallback(async (format: 'pdf' | 'png' | 'jpeg') => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const margin = 20;
        const imgData = canvas.toDataURL('image/png');
        const imgW = pdfW - margin * 2;
        const imgH = (canvas.height * imgW) / canvas.width;
        if (imgH <= pdfH - margin * 2) {
          pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH);
        } else {
          let yPos = 0;
          const pageContentH = pdfH - margin * 2;
          const sourceH = (pageContentH / imgH) * canvas.height;
          while (yPos < canvas.height) {
            if (yPos > 0) pdf.addPage();
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = Math.min(sourceH, canvas.height - yPos);
            const ctx = sliceCanvas.getContext('2d')!;
            ctx.drawImage(canvas, 0, yPos, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
            const sliceData = sliceCanvas.toDataURL('image/png');
            const sliceH = (sliceCanvas.height * imgW) / canvas.width;
            pdf.addImage(sliceData, 'PNG', margin, margin, imgW, sliceH);
            yPos += sourceH;
          }
        }
        pdf.save('QSIS-ARMS-Class-Routine.pdf');
      } else {
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        const link = document.createElement('a');
        link.download = `QSIS-ARMS-Class-Routine.${format}`;
        link.href = canvas.toDataURL(mimeType, 0.95);
        link.click();
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (routineLoading) {
    return (
      <section className="mb-5">
        <div className="no-print flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
          <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
            <i className="fas fa-arrow-left"></i> Back
          </button>
        </div>
        <div className="loading-container">
          <div className="book-loader">
            <div className="book-base"></div>
            <div className="book-spine-loader"></div>
            <div className="book-cover"></div>
            <div className="book-page-stack"><div className="book-page"></div><div className="book-page"></div><div className="book-page"></div></div>
            <div className="page-shadow"></div><div className="page-shadow"></div><div className="page-shadow"></div>
          </div>
          <div className="loading-text">Loading routine<span className="loading-dots"></span></div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5">
      {/* Toolbar — hidden on print */}
      <div className="no-print">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
          <div className="flex items-center gap-2">
            {routineData.length > 0 && (
              <>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all disabled:opacity-50" onClick={() => handleExport('pdf')}>
                  <i className="fas fa-file-pdf text-red-400"></i> PDF
                </button>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all disabled:opacity-50" onClick={() => handleExport('png')}>
                  <i className="fas fa-image text-blue-400"></i> PNG
                </button>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all disabled:opacity-50" onClick={() => handleExport('jpeg')}>
                  <i className="fas fa-camera text-yellow-400"></i> JPEG
                </button>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-qsis/30 bg-qsis/10 text-qsis cursor-pointer text-[0.75rem] font-semibold hover:bg-qsis/20 transition-all disabled:opacity-50" onClick={handlePrint}>
                  <i className="fas fa-print"></i> Print
                </button>
              </>
            )}
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
          </div>
        </div>
        {exporting && (
          <div className="mb-4 p-3 rounded-xl bg-qsis/10 border border-qsis/20 text-qsis text-[0.82rem] flex items-center gap-2">
            <i className="fas fa-spinner fa-spin"></i> Generating export, please wait...
          </div>
        )}
      </div>

      {routineData.length === 0 ? (
        <div className="no-print text-center py-12 text-dark-bg2 rounded-2xl border border-dark-border">
          <i className="fas fa-calendar-times text-4xl text-dark-text2 mb-3 block opacity-30"></i>
          <p className="text-[0.9rem] text-dark-text2">No routine available yet.</p>
          <p className="text-[0.78rem] text-dark-text2 mt-1 opacity-60">Class routine will be published by the department.</p>
          <a href="https://www.facebook.com/DQSIS" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-qsis/10 text-qsis text-[0.8rem] font-semibold hover:bg-qsis/20 transition-all">
            <i className="fab fa-facebook"></i> Check Facebook for Updates
          </a>
        </div>
      ) : (
        <div ref={printRef} className="routine-export">
          {/* ─── HEADER ─── */}
          <div className="routine-header">
            <div className="routine-header-inner">
              <div className="routine-logo-wrapper">
                <Image src="/iiuc-logo.png" alt="IIUC" width={72} height={72} className="routine-logo" priority />
              </div>
              <h1 className="routine-university-name">International Islamic University Chittagong</h1>
              <p className="routine-arabic-name">&#x262F;&#x2015;&#x627;&#x644;&#x62C;&#x627;&#x645;&#x639;&#x629; &#x627;&#x644;&#x625;&#x633;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x627;&#x644;&#x62F;&#x648;&#x644;&#x64A;&#x629; &#x634;&#x64A;&#x62A;&#x627;&#x63A;&#x648;&#x646;&#x63A;</p>
              <p className="routine-dept-name">Department of Qur&apos;anic Sciences &amp; Islamic Studies</p>
              <div className="routine-title-bar">
                <h2 className="routine-title">Class Routine</h2>
              </div>
              <div className="routine-badges">
                <span className="routine-badge-semester">Spring 2025</span>
                <span className="routine-badge-session">Session: 2023-24</span>
              </div>
            </div>
          </div>

          {/* ─── TABLE ─── */}
          <div className="routine-table-wrapper">
            <table className="routine-table">
              <thead>
                <tr>
                  <th className="routine-th routine-th-time">Time</th>
                  {DAYS.map(day => (
                    <th key={day} className="routine-th">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIMES.map(time => (
                  <tr key={time}>
                    <td className="routine-td routine-td-time">
                      <div className="routine-time-text">{time.split(' - ')[0]}</div>
                      <div className="routine-time-sub">{time.split(' - ')[1]}</div>
                    </td>
                    {DAYS.map(day => {
                      const slot = getSlot(day, time, routineData);
                      return (
                        <td key={day} className="routine-td">
                          {slot ? (
                            <div className="routine-course">
                              <span className="routine-course-code">{slot.courseCode || slot.course}</span>
                              {slot.courseTitle && <span className="routine-course-title">{slot.courseTitle}</span>}
                              {slot.teacher && <span className="routine-teacher">{slot.teacher}</span>}
                              {slot.room && <span className="routine-room">{slot.room}</span>}
                            </div>
                          ) : (
                            <span className="routine-empty">&mdash;</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── FOOTER ─── */}
          <div className="routine-footer">
            <div className="routine-footer-grid">
              <div className="routine-footer-notes">
                <h4>Important Notes</h4>
                <ul>
                  <li>Students must arrive 5 minutes before class.</li>
                  <li>Any schedule change will be notified via department notice board.</li>
                  <li>Midterm and final exam schedules are separate.</li>
                  <li>For queries, contact the department office.</li>
                </ul>
              </div>
              <div className="routine-footer-timing">
                <h4>Timing Information</h4>
                <p><strong>Class Duration:</strong> 80 minutes</p>
                <p><strong>Break:</strong> 10 minutes between classes</p>
                <p><strong>Office Hours:</strong> 9:00 AM - 4:00 PM</p>
              </div>
            </div>
            <div className="routine-footer-center">
              <p className="routine-generated">Generated by <strong>QSIS Academic Resource Management System</strong></p>
              <p className="routine-updated">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="routine-footer-signature">
              <div className="routine-sig-box">
                <div className="routine-sig-line"></div>
                <p>Head of Department</p>
              </div>
              <div className="routine-sig-box">
                <div className="routine-sig-line"></div>
                <p>Program Coordinator</p>
              </div>
            </div>
            <div className="routine-footer-strip">
              <p>&copy; {new Date().getFullYear()} QSIS-ARMS &mdash; Qur&apos;anic Sciences &amp; Islamic Studies, IIUC</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
