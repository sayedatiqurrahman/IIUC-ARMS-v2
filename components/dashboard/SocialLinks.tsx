'use client';

import { showToast } from '@/lib/utils';

interface SocialLinksProps {
  profile: any;
  profileForm: any;
  setProfileForm: React.Dispatch<React.SetStateAction<any>>;
  editingSocials: boolean;
  setEditingSocials: (v: boolean) => void;
  updateProfile: (data: any) => void;
}

export default function SocialLinks({ profile, profileForm, setProfileForm, editingSocials, setEditingSocials, updateProfile }: SocialLinksProps) {
  return (
    <>
      {editingSocials ? (
        <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
          <h5 className="text-[0.85rem] font-semibold mb-3"><i className="fas fa-share-alt text-qsis mr-2"></i>Social Links</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-globe mr-1"></i>Website URL</label>
              <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://..." value={profileForm.website} onChange={e => setProfileForm(p => ({ ...p, website: e.target.value }))} />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-facebook mr-1"></i>Facebook URL</label>
              <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://facebook.com/..." value={profileForm.facebook} onChange={e => setProfileForm(p => ({ ...p, facebook: e.target.value }))} />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-twitter mr-1"></i>Twitter URL</label>
              <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://twitter.com/..." value={profileForm.twitter} onChange={e => setProfileForm(p => ({ ...p, twitter: e.target.value }))} />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fab fa-linkedin mr-1"></i>LinkedIn URL</label>
              <input type="url" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" placeholder="https://linkedin.com/in/..." value={profileForm.linkedin} onChange={e => setProfileForm(p => ({ ...p, linkedin: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.8rem] cursor-pointer hover:opacity-90 transition-opacity" onClick={() => {
              updateProfile(profileForm);
              setEditingSocials(false);
              showToast('Social links saved!', 'success');
            }}>
              <i className="fas fa-save mr-1"></i> Save
            </button>
            <button className="px-4 py-2 rounded-xl border border-dark-border bg-dark-bg text-dark-text font-semibold text-[0.8rem] cursor-pointer hover:border-qsis transition-all" onClick={() => setEditingSocials(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="text-[0.75rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer hover:underline" onClick={() => {
          setProfileForm(p => ({ ...p, facebook: profile.facebook, twitter: profile.twitter, linkedin: profile.linkedin, website: profile.website }));
          setEditingSocials(true);
        }}>
          <i className="fas fa-share-alt mr-1"></i> Edit Social Links
        </button>
      )}
    </>
  );
}
