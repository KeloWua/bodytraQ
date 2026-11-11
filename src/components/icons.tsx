type P = { className?: string };

function base(props: P, children: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className ?? "h-5 w-5"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconPlus = (p: P) => base(p, <path d="M12 5v14M5 12h14" />);
export const IconChevronL = (p: P) => base(p, <path d="m15 18-6-6 6-6" />);
export const IconChevronR = (p: P) => base(p, <path d="m9 18 6-6-6-6" />);
export const IconGear = (p: P) =>
  base(p, <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.6.86 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.65 0-1.27.4-1.51 1Z" />
  </>);
export const IconCamera = (p: P) =>
  base(p, <>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </>);
export const IconGuides = (p: P) =>
  base(p, <>
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </>);
export const IconDownload = (p: P) =>
  base(p, <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />);
export const IconUpload = (p: P) =>
  base(p, <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />);
export const IconUndo = (p: P) => base(p, <path d="M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13" />);
export const IconTrash = (p: P) =>
  base(p, <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />);
export const IconX = (p: P) => base(p, <path d="M18 6 6 18M6 6l12 12" />);
export const IconCheck = (p: P) => base(p, <path d="M20 6 9 17l-5-5" />);
export const IconRotate = (p: P) =>
  base(p, <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />);
export const IconLine = (p: P) => base(p, <path d="M5 19 19 5" />);
export const IconBrush = (p: P) =>
  base(p, <path d="m14 5 5 5L9 20H4v-5L14 5ZM4 20h16" />);
export const IconPhoto = (p: P) =>
  base(p, <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </>);
export const IconPencil = (p: P) =>
  base(p, <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />);

export function IconLock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <rect x={4} y={10} width={16} height={11} rx={2.5} />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
      <circle cx={12} cy={15.5} r={1.4} fill="currentColor" stroke="none" />
    </svg>
  );
}
