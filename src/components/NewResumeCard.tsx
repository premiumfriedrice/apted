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

// Dashed "New Resume" card. In the resumes grid it occupies a single cell as
// the trailing "add" slot; when there are no versions yet (`prominent`) it
// spans the full grid width with a larger icon and padding so it reads as the
// primary call-to-action, not a shrunk placeholder.
export function NewResumeCard({ href = "/master", prominent = false }: { href?: string; prominent?: boolean }) {
  const iconWrapCls = prominent
    ? "flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low text-secondary transition-colors group-hover:text-primary"
    : "flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-secondary transition-colors group-hover:text-primary";
  const titleCls = prominent ? "font-headline-lg text-headline-lg text-primary" : "font-bold text-primary";
  const subtitleCls = prominent ? "px-4 text-center text-body-sm text-secondary" : "px-4 text-center text-xs text-secondary";
  const cardCls = prominent
    ? "group col-span-full flex cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-border-subtle bg-surface-white p-xl py-xl transition-all hover:border-primary"
    : "group flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border-subtle bg-surface-white p-3 transition-all hover:border-primary";

  return (
    <Link href={href} className={cardCls}>
      <div className={iconWrapCls}>
        <MaterialIcon name="add" className={prominent ? "text-[40px]" : "text-[32px]"} />
      </div>
      <p className={titleCls}>New Resume</p>
      <p className={subtitleCls}>Start from a template or import a PDF</p>
    </Link>
  );
}