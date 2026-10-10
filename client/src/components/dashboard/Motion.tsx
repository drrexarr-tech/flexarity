import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

/**
 * Staggered entrance for the dashboard. Items rise a little and fade in rather
 * than sliding across the screen, which reads as calm rather than busy, and the
 * delay is capped so the last tile is never more than a moment behind.
 */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 26 },
  },
};

export function RevealGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={className}
    >
      {value}
    </motion.span>
  );
}

export interface StatTileProps {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: string;
  hint?: string;
  onClick?: () => void;
}

export function StatTile({ label, value, icon: Icon, accent, hint, onClick }: StatTileProps) {
  const Wrapper = onClick ? motion.button : motion.div;

  return (
    <Wrapper
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      whileHover={onClick ? { y: -3 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className={[
        'group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border bg-card/70 p-3.5 text-left backdrop-blur-sm',
        'transition-colors hover:border-primary/40',
        onClick ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      {/* Sheen that sweeps across on hover; purely decorative. */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/[0.07] to-transparent transition-transform duration-700 group-hover:translate-x-full" />

      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
        style={{ background: accent ?? 'hsl(var(--primary))' }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <span className="min-w-0">
        <span className="block text-lg font-semibold leading-none tabular-nums">
          <CountUp value={value} />
        </span>
        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
          {hint ?? label}
        </span>
      </span>
    </Wrapper>
  );
}