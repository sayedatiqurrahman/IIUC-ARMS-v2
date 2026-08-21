'use client';

import Image from 'next/image';
import Modal from '@/components/ui/Modal';
import SocialIcons from './SocialIcons';

export default function ContributorMoreModal({ c, onClose }: { c: any; onClose: () => void }) {
  if (!c) return null;
  const e = c.publicEmail || c.email;
  const hasWhatsApp = c.whatsapp && !c.hideWhatsapp;
  const hasEmail = e && !c.hideEmail;
  const hasCompany = c.company && !c.hideCompany;
  const hasWebsite = c.website && !c.hideWebsite;
  const hasLinkedin = c.linkedin && !c.hideLinkedin;
  const hasFacebook = c.facebook && !c.hideFacebook;
  const hasTwitter = c.twitter && !c.hideTwitter;
  const hasContact = hasWhatsApp || hasEmail || hasCompany;
  const hasSocial = hasWebsite || hasLinkedin || hasFacebook || hasTwitter;

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 text-center border-b border-dark-border">
          <Image src={c.avatar_url} alt={c.login} width={56} height={56} className="w-14 h-14 rounded-full border-2 border-dark-border object-cover mx-auto mb-2" />
          <h3 className="text-[0.95rem] font-bold text-dark-text">{c.name || c.login}</h3>
          <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="text-[0.7rem] text-dark-text3 hover:text-qsis no-underline">
            <i className="fab fa-github mr-1"></i>@{c.login}
          </a>
          {c.departmentShortName && (
            <p className="text-[0.72rem] text-dark-text2 mt-1"><i className="fas fa-building mr-1 text-teal-400"></i>{c.departmentShortName}</p>
          )}
        </div>

        <div className="px-5 py-3 space-y-3 max-h-[50vh] overflow-y-auto">
          {/* Contact Info */}
          {hasContact && (
            <div>
              <h4 className="text-[0.68rem] text-dark-text3 uppercase tracking-wider font-semibold mb-1.5"><i className="fas fa-address-card mr-1 text-qsis"></i>Contact</h4>
              <div className="space-y-1">
                {hasWhatsApp && (
                  <a href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border hover:border-green-500/40 transition-colors no-underline">
                    <i className="fab fa-whatsapp text-green-400 text-[0.7rem]"></i>
                    <span className="text-[0.75rem] text-dark-text">{c.whatsapp}</span>
                  </a>
                )}
                {hasEmail && (
                  <a href={`mailto:${e}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border hover:border-amber-500/40 transition-colors no-underline">
                    <i className="fas fa-envelope text-amber-400 text-[0.7rem]"></i>
                    <span className="text-[0.75rem] text-dark-text">{e}</span>
                  </a>
                )}
                {hasCompany && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border">
                    <i className="fas fa-briefcase text-purple-400 text-[0.7rem]"></i>
                    <span className="text-[0.75rem] text-dark-text">{c.company}</span>
                    {c.companyUrl && <a href={c.companyUrl} target="_blank" rel="noopener noreferrer" className="text-[0.65rem] text-qsis hover:underline no-underline ml-auto">↗</a>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Social Media */}
          {hasSocial && (
            <div>
              <h4 className="text-[0.68rem] text-dark-text3 uppercase tracking-wider font-semibold mb-1.5"><i className="fas fa-share-nodes mr-1 text-blue-400"></i>Social Media</h4>
              <div className="space-y-1">
                {hasWebsite && (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border hover:border-cyan-500/40 transition-colors no-underline">
                    <i className="fas fa-globe text-cyan-400 text-[0.7rem]"></i>
                    <span className="text-[0.75rem] text-dark-text">{c.website.replace(/^https?:\/\//, '').slice(0, 40)}</span>
                  </a>
                )}
                {hasLinkedin && (
                  <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border hover:border-blue-500/40 transition-colors no-underline">
                    <i className="fab fa-linkedin-in text-blue-400 text-[0.7rem]"></i>
                    <span className="text-[0.75rem] text-dark-text">LinkedIn</span>
                  </a>
                )}
                {hasFacebook && (
                  <a href={c.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border hover:border-blue-500/40 transition-colors no-underline">
                    <i className="fab fa-facebook-f text-blue-500 text-[0.7rem]"></i>
                    <span className="text-[0.75rem] text-dark-text">Facebook</span>
                  </a>
                )}
                {hasTwitter && (
                  <a href={c.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border hover:border-dark-text2/40 transition-colors no-underline">
                    <i className="fab fa-x-twitter text-dark-text2 text-[0.7rem]"></i>
                    <span className="text-[0.75rem] text-dark-text">X / Twitter</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Academic Info */}
          <div>
            <h4 className="text-[0.68rem] text-dark-text3 uppercase tracking-wider font-semibold mb-1.5"><i className="fas fa-graduation-cap mr-1 text-accent"></i>Academic</h4>
            <div className="grid grid-cols-2 gap-1.5">
              {c.semester && !c.hideSemester && (
                <div className="px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.6rem] text-dark-text3 block">Semester</span>
                  <span className="text-[0.75rem] text-dark-text font-medium">{c.semester === 'graduated' ? 'Graduated' : c.semester}</span>
                </div>
              )}
              {c.universityId && !c.hideUniversityId && (
                <div className="px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.6rem] text-dark-text3 block">ID</span>
                  <span className="text-[0.75rem] text-dark-text font-medium">{c.universityId}</span>
                </div>
              )}
              {c.section && (
                <div className="px-2.5 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border">
                  <span className="text-[0.6rem] text-dark-text3 block">Section</span>
                  <span className="text-[0.75rem] text-dark-text font-medium">{c.section}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-border flex items-center justify-center">
          <SocialIcons c={c} />
        </div>
      </div>
    </Modal>
  );
}
