INSERT INTO "role" ("id", "name")
VALUES (4, 'BUYER')
ON CONFLICT ("id") DO NOTHING;

UPDATE "user"
SET "roleId" = 4
WHERE "roleId" = 1;
