-- The army each player started with, written when a match finishes. Older rows stay NULL:
-- hero statistics only cover matches finished after this migration.
ALTER TABLE "MatchParticipant" ADD COLUMN "squad" JSONB;
