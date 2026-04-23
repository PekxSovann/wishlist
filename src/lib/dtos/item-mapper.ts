import type { ItemOnListDTO } from "$lib/dtos/item-dto";
import type {
    Item,
    ItemBuyerNote as PrismaItemBuyerNote,
    ListItem as PrismaListItem,
    ItemClaim as PrismaItemClaim,
    ItemPrice,
    User,
    SystemUser,
    UserGroupMembership
} from "$lib/generated/prisma/client";

type MinimalUser = Pick<User, "id" | "name" | "username">;

interface UserWithGroups extends MinimalUser {
    UserGroupMembership: Pick<UserGroupMembership, "groupId">[];
}

interface ItemClaim
    extends Pick<
        PrismaItemClaim,
        "id" | "purchased" | "quantity" | "listId" | "claimedPrice" | "claimedCurrency" | "claimedNote"
    > {
    claimedBy: UserWithGroups | null;
    publicClaimedBy: Pick<SystemUser, "id" | "name"> | null;
}

interface ListItem extends Pick<PrismaListItem, "listId" | "approved" | "displayOrder"> {
    addedBy: MinimalUser;
}

interface BuyerNote extends Pick<PrismaItemBuyerNote, "id" | "userId" | "note"> {
    user: MinimalUser;
}

interface ItemCount {
    lists: number;
}

export interface FullItem extends Item {
    itemPrice: ItemPrice | null;
    user: MinimalUser;
    lists: ListItem[];
    claims: ItemClaim[];
    buyerNotes: BuyerNote[];
    _count: ItemCount;
}

export const toItemOnListDTO = (item: FullItem, listId: string) => {
    const { lists, claims, _count, ...restOfItem } = item;
    const list = lists.find((l) => l.listId === listId);
    if (!list) {
        throw new Error(`Couldn't find related list with id=${listId} on item with id=${item.id}`);
    }
    return {
        ...restOfItem,
        ...list,
        buyerNotes: item.buyerNotes.map((buyerNote) => ({
            id: buyerNote.id,
            userId: buyerNote.userId,
            userName: buyerNote.user.username,
            note: buyerNote.note
        })),
        claims: claims.map((claim) => {
            if (claim.claimedBy) {
                const { UserGroupMembership, ...user } = claim.claimedBy;
                const claimedBy = {
                    ...user,
                    groups: UserGroupMembership.map(({ groupId }) => groupId)
                };
                return {
                    claimId: claim.id,
                    quantity: claim.quantity,
                    claimedBy,
                    purchased: claim.purchased,
                    listId: claim.listId,
                    claimedNote: claim.claimedNote || undefined,
                    claimedPrice:
                        claim.claimedPrice !== null && claim.claimedCurrency
                            ? { value: claim.claimedPrice, currency: claim.claimedCurrency }
                            : undefined
                };
            }
            return {
                claimId: claim.id,
                quantity: claim.quantity,
                publicClaimedBy: claim.publicClaimedBy!,
                listId: claim.listId,
                claimedNote: claim.claimedNote || undefined,
                claimedPrice:
                    claim.claimedPrice !== null && claim.claimedCurrency
                        ? { value: claim.claimedPrice, currency: claim.claimedCurrency }
                        : undefined
            };
        }),
        listCount: _count.lists,
        get claimedQuantity(): number {
            return this.claims.map(({ quantity }) => quantity).reduce((a, b) => a + b, 0);
        },
        get remainingQuantity(): number {
            return this.quantity === null ? Infinity : this.quantity - this.claimedQuantity;
        },
        get isClaimable(): boolean {
            return this.quantity === null || this.quantity > this.claimedQuantity;
        }
    } satisfies ItemOnListDTO;
};
