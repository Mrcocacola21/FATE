import { useMemo, useState } from "react";
import type { HeroMeta, PlayerId } from "rules";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

export function UnitSpawner({
  heroes,
  send,
}: {
  heroes: HeroMeta[];
  send: (command: TestRoomCommand) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [heroId, setHeroId] = useState("");
  const [owner, setOwner] = useState<PlayerId>("P1");
  const [col, setCol] = useState(4);
  const [row, setRow] = useState(4);
  const [stealthed, setStealthed] = useState(false);
  const [charges, setCharges] = useState<"empty" | "full">("empty");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return heroes;
    return heroes.filter((hero) =>
      [
        hero.name,
        hero.id,
        hero.mainClass,
        ...hero.abilities.map((ability) => ability.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [heroes, search]);

  const selectedHeroId =
    heroId && filtered.some((hero) => hero.id === heroId)
      ? heroId
      : filtered[0]?.id ?? "";

  return (
    <div className="space-y-3">
      <input
        className="field-control"
        placeholder={t("testRoom.searchCatalog")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <select
        className="field-control"
        value={selectedHeroId}
        onChange={(event) => setHeroId(event.target.value)}
      >
        {filtered.map((hero) => (
          <option key={hero.id} value={hero.id}>
            {hero.name} · {hero.mainClass} · {hero.id}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-2">
        <select
          className="field-control"
          value={owner}
          onChange={(event) => setOwner(event.target.value as PlayerId)}
        >
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>
        <input
          className="field-control"
          type="number"
          min={0}
          max={8}
          aria-label={t("testRoom.column")}
          value={col}
          onChange={(event) => setCol(Number(event.target.value))}
        />
        <input
          className="field-control"
          type="number"
          min={0}
          max={8}
          aria-label={t("testRoom.row")}
          value={row}
          onChange={(event) => setRow(Number(event.target.value))}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={stealthed}
            onChange={(event) => setStealthed(event.target.checked)}
          />
          {t("testRoom.stealthed")}
        </label>
        <label className="inline-flex items-center gap-2">
          {t("testRoom.charges")}
          <select
            className="rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
            value={charges}
            onChange={(event) =>
              setCharges(event.target.value as "empty" | "full")
            }
          >
            <option value="empty">{t("testRoom.empty")}</option>
            <option value="full">{t("testRoom.full")}</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={!selectedHeroId || col < 0 || row < 0 || col > 8 || row > 8}
        onClick={() =>
          send({
            type: "debugSpawnUnit",
            heroId: selectedHeroId,
            owner,
            coord: { col, row },
            options: { stealthed, charges },
          })
        }
      >
        {t("testRoom.spawnAt", { col, row })}
      </button>
    </div>
  );
}
