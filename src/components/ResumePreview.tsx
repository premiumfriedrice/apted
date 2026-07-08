"use client";

const PDF_VIEWER = "#toolbar=0&navpanes=0&scrollbar=0";

export function ResumePreview({ pdfBase64 }: { pdfBase64: string | null }) {
  if (!pdfBase64) {
    return <SkeletonResume />;
  }

  return (
    <iframe
      src={`data:application/pdf;base64,${pdfBase64}${PDF_VIEWER}`}
      title="Resume preview"
      className="h-full w-full border-0"
    />
  );
}

function SkeletonResume() {
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="h-4 w-1/2 bg-surface-container-highest"></div>
      <div className="h-2 w-full bg-surface-container-highest/60"></div>
      <div className="h-2 w-full bg-surface-container-highest/60"></div>
      <div className="h-2 w-3/4 bg-surface-container-highest/60"></div>
      <div className="mt-4 flex flex-col gap-1.5">
        <div className="h-2.5 w-1/3 bg-surface-container-highest"></div>
        <div className="h-1.5 w-full bg-surface-container-highest/40"></div>
        <div className="h-1.5 w-full bg-surface-container-highest/40"></div>
      </div>
    </div>
  );
}
