const WAVE_DELAYS = ["-0.48s", "-0.36s", "-0.24s", "-0.12s", "0s"];

export default function MatterTabLoadingState({ label = "Loading data…" }) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="relative isolate flex w-full justify-center overflow-hidden rounded-2xl border border-[#d7e4de] bg-white px-6 pb-16 pt-20 text-center shadow-sm sm:pt-24"
      style={{
        minHeight:
          "max(32rem, calc(100vh - var(--matter-header-height, 0px) - 4rem))",
      }}
    >
      <div
        aria-hidden="true"
        className="matter-tab-loading-surface absolute inset-0 -z-10 bg-gradient-to-br from-white via-[#f3f9f6] to-[#e8f3ee]"
      />
      <div>
        <div
          aria-hidden="true"
          className="flex h-12 items-center justify-center gap-2"
        >
          {WAVE_DELAYS.map((delay, index) => (
            <span
              key={delay}
              className="matter-tab-loading-wave block h-10 w-2.5 rounded-full bg-[#4F726B]"
              style={{
                "--matter-wave-delay": delay,
                opacity: 0.55 + index * 0.1,
              }}
            />
          ))}
        </div>
        <p className="mt-5 text-lg font-semibold text-[#17372e]">{label}</p>
        <p className="mt-2 text-sm text-[#60786f]">
          Please wait while we get the latest information.
        </p>
      </div>
    </section>
  );
}
