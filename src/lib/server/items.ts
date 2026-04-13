import type { Prisma } from "$lib/generated/prisma/client";
import { client } from "$lib/server/prisma";
import { toItemOnListDTO, type FullItem } from "$lib/dtos/item-mapper";

export const ALL_ITEMS_PAGE_SIZE = 10;

export const getAllItemsFilter = (groupId: string, userIdFilter: string[]) =>
    ({
        lists: {
            some: {
                approved: true,
                list: {
                    groupId,
                    ownerId: userIdFilter.length > 0 ? { in: userIdFilter } : undefined
                }
            }
        }
    }) satisfies Prisma.ItemWhereInput;

export const getAllItemsInclude = (groupId: string, userIdFilter: string[]) =>
    ({
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
                approved: true,
                list: {
                    groupId,
                    ownerId: userIdFilter.length > 0 ? { in: userIdFilter } : undefined
                }
            }
        },
        claims: {
            select: {
                id: true,
                listId: true,
                purchased: true,
                quantity: true,
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
            },
            where: {
                list: {
                    groupId
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
    }) satisfies Prisma.ItemInclude;

export const getAllItemsPage = async ({
    groupId,
    userIdFilter,
    offset,
    take = ALL_ITEMS_PAGE_SIZE
}: {
    groupId: string;
    userIdFilter: string[];
    offset: number;
    take?: number;
}) => {
    const where = getAllItemsFilter(groupId, userIdFilter);
    const include = getAllItemsInclude(groupId, userIdFilter);

    const [totalCount, items] = await Promise.all([
        client.item.count({ where }),
        client.item.findMany({
            where,
            include,
            orderBy: {
                id: "desc"
            },
            skip: offset,
            take
        }) as Promise<FullItem[]>
    ]);

    return {
        items: items.flatMap((item) => item.lists.map((list) => toItemOnListDTO(item, list.listId))),
        loadedItemCount: offset + items.length,
        hasMore: offset + items.length < totalCount,
        totalCount
    };
};

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
