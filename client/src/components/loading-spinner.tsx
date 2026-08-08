interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message = "로딩 중..." }: LoadingSpinnerProps) {
  return (
    <section className="mb-8">
      <div className="bg-card rounded-lg p-8 border border-border text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground" data-testid="text-loading-message">
          {message}
        </p>
      </div>
    </section>
  );
}
