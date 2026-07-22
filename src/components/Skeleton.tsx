export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-container-low ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 border border-border-subtle bg-surface-white p-3">
      <Skeleton className="aspect-[1/1.4] w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <tr className="border-b border-border-subtle">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="py-3 px-4 text-center">
        <Skeleton className="mx-auto h-5 w-16 rounded-full" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-3 w-20" />
      </td>
    </tr>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="flex flex-col gap-2 border border-border-subtle bg-surface-white p-md">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

export function SkeletonFunnel() {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-white p-md">
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
