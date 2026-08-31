import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorCard } from './StatesSystem';
import { logError } from '../lib/security';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logError(error, `ErrorBoundary: ${errorInfo.componentStack}`);
  }

  public handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-ios-bg flex items-center justify-center p-6 safe-area-top safe-area-bottom">
          <ErrorCard
            title="The gallery encountered an interruption"
            message={
              this.state.error?.message ||
              "A quiet interruption occurred in the gallery view. You can reload to restore your session."
            }
            onRetry={this.handleReset}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
