import type { ReactNode } from 'react';

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {children ? (
        <div className="mt-1 text-xs text-gray-500">{children}</div>
      ) : null}
    </div>
  );
}
