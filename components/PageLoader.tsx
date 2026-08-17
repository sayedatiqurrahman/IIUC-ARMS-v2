export default function PageLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img src="/page-loader.gif" alt="Loading" className="w-40 h-40 object-contain" />
    </div>
  );
}
