interface WorkflowStepperProps {
  siteReady: boolean;
  contextReady: boolean;
  generationStarted: boolean;
  variantsReady: boolean;
}

type StepState = "done" | "active" | "pending";

function stepState(
  index: number,
  siteReady: boolean,
  contextReady: boolean,
  generationStarted: boolean,
  variantsReady: boolean
): StepState {
  if (index === 0) return siteReady ? "done" : "active";
  if (index === 1) {
    if (contextReady) return "done";
    return siteReady ? "active" : "pending";
  }
  if (index === 2) {
    if (variantsReady) return "done";
    return generationStarted ? "active" : "pending";
  }
  return variantsReady ? "done" : "pending";
}

export function WorkflowStepper({
  siteReady,
  contextReady,
  generationStarted,
  variantsReady
}: WorkflowStepperProps) {
  const steps = [
    "Site",
    "Context",
    "Generate",
    "Compare & Export"
  ] as const;

  return (
    <section className="stepper section-fade-in">
      {steps.map((label, index) => {
        const state = stepState(index, siteReady, contextReady, generationStarted, variantsReady);
        return (
          <div key={label} className={`step ${state}`}>
            <span className="dot" />
            <span className="label">{label}</span>
          </div>
        );
      })}
    </section>
  );
}

