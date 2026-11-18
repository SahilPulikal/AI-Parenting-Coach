// Small inline icons. Decorative, so they are hidden from screen readers; buttons carry the text.

const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function PlusIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function TrashIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" />
    </svg>
  );
}

export function GearIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </svg>
  );
}

export function SunIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
    </svg>
  );
}

export function MoonIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M16.5 11.5A6.5 6.5 0 0 1 8.5 3.5a6.5 6.5 0 1 0 8 8Z" />
    </svg>
  );
}

export function MonitorIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
      <path d="M7 17h6M10 13.5V17" />
    </svg>
  );
}
