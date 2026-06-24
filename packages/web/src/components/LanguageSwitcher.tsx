import { useI18n, type Language } from "../i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  const options: Array<{ value: Language; short: string; label: string }> = [
    { value: "en", short: "EN", label: t("language.english") },
    { value: "uk", short: "UK", label: t("language.ukrainian") },
  ];

  return (
    <div
      className={`inline-flex items-center rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 ${className}`}
      role="group"
      aria-label={t("language.switchLabel")}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded-full px-2.5 py-1 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-teal-500 ${
            language === option.value
              ? "bg-teal-500 text-white dark:text-slate-950"
              : "text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
