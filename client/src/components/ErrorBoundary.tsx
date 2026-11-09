import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Download, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
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
    console.error('[u-SHA-jua ErrorBoundary] Unhandled component error caught:', error, errorInfo);
    this.setState({ errorInfo });

    try {
      const crashSnapshot = {
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      };
      sessionStorage.setItem('ushajua_last_crash', JSON.stringify(crashSnapshot));
    } catch (e) {
      console.warn('Failed to save crash snapshot', e);
    }
  }

  private handleRecover = () => {
    try {
      if (typeof window !== 'undefined' && (window as any).__RESET_SIMULATED_CRASH__) {
        (window as any).__RESET_SIMULATED_CRASH__();
      }
    } catch (e) {
      // ignore
    }
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleExportDump = () => {
    try {
      const dump = {
        title: 'u-SHA-jua Sovereign Crisis Platform - Crash Diagnostic Dump',
        timestamp: new Date().toISOString(),
        error: {
          name: this.state.error?.name,
          message: this.state.error?.message,
          stack: this.state.error?.stack,
        },
        componentStack: this.state.errorInfo?.componentStack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ushajua-crash-dump-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export crash dump', e);
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.handleRecover);
      }

      return (
        <div
          id="tactical-error-boundary-fallback"
          className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-6 select-none"
        >
          <div className="max-w-2xl w-full bg-slate-900 border border-red-500/40 rounded-2xl shadow-2xl p-8 backdrop-blur-md relative overflow-hidden">
            {/* Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-pulse" />

            {/* Header */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                  Critical Exception Intercepted
                </span>
                <h1 className="text-xl font-bold text-white tracking-wide mt-1">
                  Tactical Component Failure Recovered
                </h1>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              The <strong className="text-white">u-SHA-jua Global Error Boundary</strong> intercepted an unhandled runtime error.
              The application state and offline distress outbox were isolated to prevent browser freeze or data corruption.
            </p>

            {/* Error Message Box */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 mb-6 font-mono text-xs text-red-300">
              <span className="text-slate-500 block mb-1 uppercase tracking-wider text-[10px]">Error Details:</span>
              <p className="font-semibold break-words">{this.state.error?.message || 'Unknown runtime error'}</p>
            </div>

            {/* Collapsible Stack Trace */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                className="text-xs text-slate-400 hover:text-slate-200 underline transition cursor-pointer"
              >
                {this.state.showDetails ? 'Hide technical trace' : 'Show technical component trace'}
              </button>

              {this.state.showDetails && (
                <div className="mt-3 p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 max-h-48 overflow-y-auto space-y-2 select-text">
                  <div>
                    <span className="text-red-400 font-bold">Stack:</span>
                    <pre className="whitespace-pre-wrap">{this.state.error?.stack}</pre>
                  </div>
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <span className="text-amber-400 font-bold">Component Stack:</span>
                      <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Controls */}
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={this.handleRecover}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Recover Tactical View</span>
              </button>

              <button
                type="button"
                onClick={this.handleExportDump}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export Diagnostic Dump</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer ml-auto"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Safe Reload</span>
              </button>
            </div>
          </div>
        </div>
    );
  }

  return this.props.children;
 }
}
