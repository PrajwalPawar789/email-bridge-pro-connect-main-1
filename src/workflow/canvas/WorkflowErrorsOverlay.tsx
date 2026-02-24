interface WorkflowErrorsOverlayProps {
  errors: string[];
}

const WorkflowErrorsOverlay = ({ errors }: WorkflowErrorsOverlayProps) => {
  if (!errors.length) return null;

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-md space-y-2">
      {errors.slice(0, 4).map((error, index) => (
        <div key={`${error}_${index}`} className="rounded-lg border border-rose-300 bg-rose-50/95 px-3 py-2 text-xs text-rose-800 shadow-sm">
          {error}
        </div>
      ))}
    </div>
  );
};

export default WorkflowErrorsOverlay;
