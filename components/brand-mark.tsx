// Símbolo "u." da UfaProva, o mesmo da página inicial e do favicon.
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`font-display text-lg font-extrabold leading-none tracking-tight ${className}`}>
      u.
    </span>
  );
}
