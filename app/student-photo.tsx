import Image from 'next/image';
import { UserRound } from 'lucide-react';

export function StudentPhoto({ src, name, size = 40, square = false, className = '' }: { src?: string | null; name: string; size?: number; square?: boolean; className?: string }) {
  const shape = square ? 'rounded-md' : 'rounded-full';
  if (src)
    return <Image unoptimized src={src} alt={`Foto de ${name}`} width={size} height={size} style={{ width: size, height: size }} className={`shrink-0 ${shape} border border-slate-200 object-cover ${className}`} />;
  return (
    <span title="Sem foto" style={{ width: size, height: size }} className={`grid shrink-0 place-items-center ${shape} border border-dashed border-slate-300 bg-slate-50 text-slate-400 ${className}`}>
      <UserRound aria-hidden style={{ width: size * 0.45, height: size * 0.45 }} />
      <span className="sr-only">{name} sem foto</span>
    </span>
  );
}
