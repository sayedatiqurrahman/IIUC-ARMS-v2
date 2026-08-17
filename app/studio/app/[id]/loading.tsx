export default function StudioAppLoading() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 animate-pulse">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-dark-bg3"></div>
        </div>
        <div className="space-y-2 text-center">
          <div className="h-5 w-2/3 mx-auto bg-dark-bg3 rounded"></div>
          <div className="h-3 w-full mx-auto bg-dark-bg3 rounded"></div>
        </div>
        <div className="flex justify-center gap-3">
          <div className="h-8 w-24 bg-dark-bg3 rounded-full"></div>
          <div className="h-8 w-24 bg-dark-bg3 rounded-full"></div>
        </div>
        <div className="flex justify-center">
          <div className="h-10 w-40 bg-dark-bg3 rounded-xl"></div>
        </div>
      </div>
    </div>
  );
}
