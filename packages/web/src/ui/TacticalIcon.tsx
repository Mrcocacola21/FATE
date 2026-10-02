const paths = {
  unit: "M12 3 20 12 12 21 4 12Z M12 8 16 12 12 16 8 12Z",
  actions: "m5 19 14-14 M12 5h7v7 M5 5l4 4 M5 12v7h7",
  rules: "M5 4h14v16H5Z M8 8h8 M8 12h8 M8 16h5",
  players:
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 20v-2a6 6 0 0 1 12 0v2 M17 6a3 3 0 0 1 0 6 M18 15a4 4 0 0 1 3 4v1",
  log: "M5 6h14 M5 12h14 M5 18h9",
} as const;

export function TacticalIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
