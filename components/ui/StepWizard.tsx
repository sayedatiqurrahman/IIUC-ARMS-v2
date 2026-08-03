'use client';

interface Step {
  label: string;
  icon: string;
}

interface StepWizardProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export default function StepWizard({ steps, currentStep, className = '' }: StepWizardProps) {
  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((s, idx) => {
        const isActive = idx === currentStep;
        const isCompleted = idx < currentStep;

        return (
          <div key={idx} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div
                className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[0.75rem] font-bold flex-shrink-0 transition-all ${
                  isActive
                    ? 'bg-qsis text-white border-2 border-qsis shadow-[0_2px_8px_rgba(0,200,83,0.3)]'
                    : isCompleted
                      ? 'bg-green-600 text-white border-2 border-green-600'
                      : 'bg-dark-bg2 border-2 border-dark-border text-dark-text2'
                }`}
              >
                {isCompleted ? <i className="fas fa-check"></i> : idx + 1}
              </div>
              <span
                className={`text-[0.75rem] font-semibold whitespace-nowrap ${
                  isActive ? 'text-dark-text' : isCompleted ? 'text-qsis' : 'text-dark-text2'
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-[2px] mx-3 ${
                  isCompleted ? 'bg-qsis' : 'bg-dark-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
