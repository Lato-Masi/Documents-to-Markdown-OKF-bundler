import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  children: ReactNode;
  title?: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 my-4 bg-zinc-900/90 border border-rose-800/60 rounded-2xl text-zinc-200 shadow-xl space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-rose-950/80 rounded-xl border border-rose-800/80 text-rose-400 flex-shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-rose-200">
                {this.props.title || "Something went wrong in this section"}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                {this.state.error?.message || "An unexpected rendering error occurred while loading this component."}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
            <button
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition flex items-center gap-1"
            >
              <span>{this.state.showDetails ? "Hide Error Details" : "View Error Details"}</span>
              {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={this.handleReset}
              className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-zinc-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Reloading Component</span>
            </button>
          </div>

          {this.state.showDetails && (
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-[11px] font-mono text-rose-300/90 overflow-x-auto max-h-48 whitespace-pre-wrap">
              {this.state.error?.stack || this.state.error?.toString()}
              {this.state.errorInfo?.componentStack && (
                <div className="mt-2 text-zinc-500 pt-2 border-t border-zinc-800/80">
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
