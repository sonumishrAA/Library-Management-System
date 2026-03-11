export default function StepIndicator({ currentStep, totalSteps, labels }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const isCompleted = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        const dotClass = isCompleted
          ? 'completed'
          : isActive
            ? 'active'
            : 'upcoming';

        return (
          <div key={stepNum} className="step-item">
            {i > 0 && (
              <div
                className={`step-line ${isCompleted || isActive ? 'completed' : 'upcoming'}`}
              />
            )}
            <div className="flex flex-col items-center gap-2">
              <div className={`step-dot ${dotClass}`}>
                {isCompleted ? <span className="material-symbols-rounded icon-sm">check</span> : stepNum}
              </div>
              {labels && labels[i] && (
                <span
                  className="hidden-mobile text-xs font-medium text-center"
                  style={{
                    color: isActive
                      ? 'var(--color-amber-dark)'
                      : isCompleted
                        ? 'var(--color-success)'
                        : 'var(--color-text-light)',
                    maxWidth: '5rem',
                  }}
                >
                  {labels[i]}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
