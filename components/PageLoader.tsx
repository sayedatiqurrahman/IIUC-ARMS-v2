export default function PageLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-dark-bg">
        <div className="bg-white rounded-3xl p-6 shadow-2xl">
          <img src="/page-loader.gif" alt="Loading" className="w-40 h-40 object-contain" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center py-10">
      <div className="bg-white rounded-3xl p-6 shadow-2xl">
        <img src="/page-loader.gif" alt="Loading" className="w-40 h-40 object-contain" />
      </div>
    </div>
  );
}
