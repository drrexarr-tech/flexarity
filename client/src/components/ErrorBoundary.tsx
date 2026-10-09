import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  error: Error | null;
}

/**
 * Any render-time throw used to unmount the whole React tree, leaving a
 * permanent white screen recoverable only by a force reload. On an installed
 * PWA that reads as a broken app.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ошибка при отрисовке интерфейса:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Что-то пошло не так</h1>
          <p className="text-sm text-muted-foreground">
            Интерфейс не удалось отобразить. Ваши данные не пострадали.
          </p>
        </div>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Попробовать снова
        </button>
      </div>
    );
  }
}