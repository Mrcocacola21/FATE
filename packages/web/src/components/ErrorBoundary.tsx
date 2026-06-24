import type { ReactNode } from "react";
import { Component } from "react";
import { useI18n } from "../i18n";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error) {
    console.error("UI error boundary:", error);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback message={this.state.message} />;
    }

    return this.props.children;
  }
}

function ErrorFallback({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div className="app-shell p-6">
      <div className="panel-card mx-auto max-w-lg border-amber-200 p-6 text-sm text-amber-900 dark:border-amber-800/60 dark:text-amber-200">
        <div className="text-base font-semibold">{t("errors.crashed")}</div>
        <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
          {message ?? t("errors.crashedDescription")}
        </div>
        <button
          className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
          onClick={() => window.location.reload()}
        >
          {t("errors.reload")}
        </button>
      </div>
    </div>
  );
}
