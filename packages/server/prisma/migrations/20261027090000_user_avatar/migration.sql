-- Uploaded profile pictures. Profile.avatarUrl keeps pointing at either an external URL or
-- /api/avatars/<userId>?v=<hash> for a row here; the checks mirror the upload validation.
CREATE TABLE "UserAvatar" (
    "userId" UUID NOT NULL,
    "contentType" VARCHAR(32) NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "UserAvatar_contentType_check" CHECK ("contentType" IN ('image/png', 'image/jpeg', 'image/webp')),
    CONSTRAINT "UserAvatar_data_size_check" CHECK (octet_length("data") BETWEEN 1 AND 262144)
);

ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
