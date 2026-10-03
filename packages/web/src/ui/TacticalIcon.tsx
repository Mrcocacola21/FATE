const paths = {
  leaderboard: "M4 20h16 M6 20v-8h4v8 M10 20V4h4v16 M14 20V9h4v11",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "m6 6 12 12 M18 6 6 18",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  logout: "M10 4H4v16h6 M10 12h10 M16 8l4 4-4 4",
  heart: "M12 20 4 12a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z M12 6l-2 5 4 2-2 7",
  plus: "M12 5v14 M5 12h14",
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
