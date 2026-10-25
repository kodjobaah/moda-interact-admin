export function TranslationRunErrorNotice({ message }: { message: string | null }) {
  return message ? <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    <p className="font-semibold">Translation request needs attention</p><p className="mt-1 break-words">{message}</p>
    <p className="mt-2 text-xs">For missing model credentials or automatic-default settings, visit System Controls / Translations.</p>
  </div> : null;
}
