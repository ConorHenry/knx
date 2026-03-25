interface MistakeCounterProps {
  mistakesRemaining: number;
  max?: number;
}

export function MistakeCounter({ mistakesRemaining, max = 4 }: MistakeCounterProps) {
  return (
    <div className="flex items-center gap-2" role="status" aria-label={`${mistakesRemaining} mistakes remaining`}>
      <span className="text-sm text-muted-foreground">Mistakes remaining:</span>
      <div className="flex gap-1.5">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className="w-4 h-4 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i < mistakesRemaining ? '#5c4a00' : '#d1d5db',
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
