-- Add optional claim price fields for tracking what claimer expects to pay
ALTER TABLE "list_item_claim" ADD COLUMN "claimedPrice" INTEGER;
ALTER TABLE "list_item_claim" ADD COLUMN "claimedCurrency" TEXT;
