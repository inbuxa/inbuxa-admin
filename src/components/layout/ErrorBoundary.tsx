/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import i18n from '@/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown instead of the standard message when something below fails. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** Keeps a failing part of the page from taking the rest down, with a way to try it again. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  private tryAgain = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 p-8">
        <div className="text-destructive text-lg font-semibold">
          {i18n.t('errorBoundary.title', 'Something went wrong')}
        </div>
        <p className="text-muted-foreground text-sm max-w-md text-center">
          {this.state.error?.message ?? i18n.t('errors.unexpectedError', 'An unexpected error occurred.')}
        </p>
        <Button variant="outline" onClick={this.tryAgain}>
          {i18n.t('errorBoundary.tryAgain', 'Try Again')}
        </Button>
      </div>
    );
  }
}
