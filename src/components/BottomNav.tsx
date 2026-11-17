"use client";

import { IconPhoto, IconCompare, IconChart, IconGear } from "./icons";

type TabId = "fotos" | "comparar" | "evolucion" | "ajustes";

const TABS: { id: TabId; label: string; icon: typeof IconPhoto }[] = [
  { id: "fotos", label: "Fotos", icon: IconPhoto },
  { id: "comparar", label: "Comparar", icon: IconCompare },
  { id: "evolucion", label: "Evolucion", icon: IconChart },
  { id: "ajustes", label: "Ajustes", icon: IconGear },
];

export default function BottomNav({
  tab,
  onTab,
  onOpenCompare,
  onOpenSettings,
  compareDisabled,
}: {
  tab: TabId;
  onTab: (t: TabId) => void;
  onOpenCompare: () => void;
  onOpenSettings: () => void;
  compareDisabled: boolean;
}) {
  function handleTap(t: TabId) {
    if (t === "comparar") {
      if (!compareDisabled) onOpenCompare();
      return;
    }
    if (t === "ajustes") {
      onOpenSettings();
      return;
    }
    onTab(t);
  }

  return (
    <div className="flex border-t border-white/5 bg-zinc-950/80 backdrop-blur-md">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        const disabled = id === "comparar" && compareDisabled;
        return (
          <button
            key={id}
            onClick={() => handleTap(id)}
            disabled={disabled}
            aria-label={label}
            className={`flex-1 flex flex-col items-center gap-0.5 min-h-11 py-2 transition ${
              active ? "text-lime-400" : "text-zinc-400"
            } ${disabled ? "opacity-30" : ""}`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
