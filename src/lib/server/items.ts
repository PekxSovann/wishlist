import type { Prisma } from "$lib/generated/prisma/client";

export const getItemInclusions = (listId?: string) => {
    return {
        lists: {
            select: {
                listId: true,
                approved: true,
                displayOrder: true,
                addedBy: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            where: {
                listId
            }
        },
        claims: {
            select: {
                id: true,
                quantity: true,
                purchased: true,
                listId: true,
                claimedPrice: true,
                claimedCurrency: true,
                claimedNote: true,
                claimedBy: {
                    select: {
                        id: true,
                        name: true,
                        UserGroupMembership: {
                            select: {
                                groupId: true
                            }
                        }
                    }
                },
                publicClaimedBy: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        },
        buyerNotes: {
            select: {
                id: true,
                note: true,
                userId: true,
                user: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        },
        user: {
            select: {
                id: true,
                name: true
            }
        },
        itemPrice: true,
        _count: {
            select: {
                lists: true
            }
        }
    } satisfies Prisma.ItemInclude;
};
