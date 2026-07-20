import Link from "next/link";

function MaterialIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center align-middle ${className}`}
      style={{ fontFamily: "'Material Symbols Outlined', sans-serif", fontSize: "20px", fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
    >
      {name}
    </span>
  );
}

// Dashed "New Resume" card. Same height as a tailored-resume version card:
// a preview-shaped placeholder (aspect-[1/1.4]) holding the add icon, plus a
// footer line. Used as the empty state when there are no versions yet and as
// the trailing grid slot otherwise.
export function NewResumeCard({ href = "/master" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group flex cursor-pointer flex-col gap-3 border border-dashed border-border-subtle bg-surface-white p-3 transition-all hover:border-primary"
    >
      <div className="relative flex aspect-[1/1.4] items-center justify-center overflow-hidden border border-dashed border-border-subtle bg-surface-container-low resume-preview-mask">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-lowest text-secondary transition-colors group-hover:text-primary">
          <MaterialIcon name="add" className="text-[32px]" />
        </div>
      </div>
      <div>
        <p className="mb-1 font-bold text-primary">New Resume</p>
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          <MaterialIcon name="add" className="text-[14px]" />
          <span>Start from a template or import a PDF</span>
        </div>
      </div>
    </Link>
  );
}