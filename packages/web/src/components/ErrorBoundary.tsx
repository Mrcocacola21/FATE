import type { ReactNode } from "react";
import { Component } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error) {
    console.error("UI error boundary:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-app p-6">
          <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-white/90 p-6 text-sm text-amber-900 shadow-sm shadow-slate-900/5 dark:border-amber-800/60 dark:bg-neutral-900/70 dark:text-amber-200 dark:shadow-black/40">
            <div className="text-base font-semibold">Something went wrong</div>
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
              {this.state.message ?? "The UI crashed unexpectedly."}
            </div>
            <button
              className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-amber-400"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
