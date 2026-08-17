export default function PageLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="bg-white rounded-3xl p-6 shadow-2xl">
        <img src="/page-loader.gif" alt="Loading" className="w-20 h-20 object-contain" />
      </div>
    </div>
  );
}
