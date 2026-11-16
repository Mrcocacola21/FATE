-- The frame a player's figures wear on the board, and the frame each participant wore in a match.
ALTER TABLE "Profile" ADD COLUMN "figureFrame" VARCHAR(32);

ALTER TABLE "MatchParticipant" ADD COLUMN "figureFrame" VARCHAR(32);
