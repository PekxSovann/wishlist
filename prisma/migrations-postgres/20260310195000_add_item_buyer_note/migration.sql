CREATE TABLE "item_buyer_note" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "item_buyer_note_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "item_buyer_note_itemId_userId_key" ON "item_buyer_note"("itemId", "userId");
CREATE INDEX "item_buyer_note_itemId_idx" ON "item_buyer_note"("itemId");

ALTER TABLE "item_buyer_note" ADD CONSTRAINT "item_buyer_note_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_buyer_note" ADD CONSTRAINT "item_buyer_note_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
