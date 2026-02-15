import type { FC } from "react";
import type { Coord, PlayerView } from "rules";
import { Board } from "../../components/Board";

interface BoardStageProps {
  view: PlayerView;
  selectedCell: Coord | null;
  onCellClick: (cell: Coord) => void;
}

export const BoardStage: FC<BoardStageProps> = ({ view, selectedCell, onCellClick }) => {
  return <Board view={view} selectedCell={selectedCell} onCellClick={onCellClick} />;
};
