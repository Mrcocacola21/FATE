import { useI18n, type Language } from "../i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  const options: Array<{ value: Language; short: string; label: string }> = [
    { value: "en", short: "EN", label: t("language.english") },
    { value: "uk", short: "UK", label: t("language.ukrainian") },
  ];

  return (
    <div
      className={`inline-flex min-w-0 items-center rounded-full border border-amber-500/20 bg-white/65 p-1 shadow-sm dark:bg-black/25 ${className}`}
      role="group"
      aria-label={t("language.switchLabel")}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded-full px-2.5 py-1 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-amber-500 ${
            language === option.value
              ? "bg-amber-500 text-stone-950"
              : "text-stone-500 hover:bg-amber-500/10 dark:text-stone-300"
          }`}
          aria-pressed={language === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => setLanguage(option.value)}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
