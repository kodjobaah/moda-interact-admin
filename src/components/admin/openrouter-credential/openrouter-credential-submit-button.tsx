"use client";

export function OpenRouterCredentialSubmitButton({
  disabled,
  pending,
  children,
}: {
  disabled: boolean;
  pending: boolean;
  children: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Saving..." : children}
    </button>
  );
}
