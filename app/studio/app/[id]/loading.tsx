export default function StudioAppLoading() {
  return (
    <div className="fixed top-[60px] left-0 right-0 bottom-[60px] md:bottom-0 z-[50] flex flex-col items-center justify-center bg-dark-bg">
      <div className="w-10 h-10 border-3 border-dark-border border-t-qsis rounded-full animate-spin mb-4" />
      <p className="text-[0.78rem] text-dark-text2">Loading app…</p>
    </div>
  );
}
