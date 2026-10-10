/**
 * Ambient gradient behind the dashboard. Purely decorative and kept out of the
 * accessibility tree; the colours are drawn from the theme's own tokens so the
 * light and dark palettes stay in step, and the motion is switched off under
 * prefers-reduced-motion.
 */
export function LuxuryBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="backdrop-blob backdrop-a h-[38rem] w-[38rem] -left-24 -top-32"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.16), transparent 65%)',
        }}
      />
      <div
        className="backdrop-blob backdrop-b h-[34rem] w-[34rem] -right-32 top-10"
        style={{
          background:
            'radial-gradient(circle at 60% 40%, hsl(190 85% 45% / 0.13), transparent 65%)',
        }}
      />
      <div
        className="backdrop-blob backdrop-c h-[30rem] w-[30rem] bottom-[-12rem] left-1/3"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, hsl(280 70% 55% / 0.11), transparent 68%)',
        }}
      />
      {/* Light mode needs a lighter touch: the blobs would otherwise tint a white
          page noticeably, so they are dialled back rather than recoloured. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/70 dark:to-background/40" />
    </div>
  );
}