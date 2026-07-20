import Link from "next/link";

function MaterialIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center align-middle ${className}`}
      style={{ fontFamily: "'Material Symbols Outlined', sans-serif", fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
    >
      {name}
    </span>
  );
}

// Dashed "New Resume" card used as both the empty-state (when there are no
// tailored resume versions yet) and the trailing slot in the resumes grid.
// Points to the Master Resume editor, the remaining resume-creation surface.
export function NewResumeCard({ href = "/master" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border-subtle bg-surface-white p-3 transition-all hover:border-primary"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-secondary transition-colors group-hover:text-primary">
        <MaterialIcon name="add" className="text-[32px]" />
      </div>
      <p className="font-bold text-primary">New Resume</p>
      <p className="px-4 text-center text-xs text-secondary">Start from a template or import a PDF</p>
    </Link>
  );
}