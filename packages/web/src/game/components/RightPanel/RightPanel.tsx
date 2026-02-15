import type { FC } from "react";
import { RightPanelContent, type RightPanelProps } from "./RightPanelContent";

export const RightPanel: FC<RightPanelProps> = (props) => {
  return <RightPanelContent {...props} />;
};
