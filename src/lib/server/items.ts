import type { Prisma } from "$lib/generated/prisma/client";
import { client } from "$lib/server/prisma";
import { toItemOnListDTO, type FullItem } from "$lib/dtos/item-mapper";

export const ALL_ITEMS_PAGE_SIZE = 10;

export const getAllItemsFilter = (groupId: string, userIdFilter: string[], privateOnly = false) =>
    ({
        lists: {
            some: {
                approved: true,
                list: {
                    groupId,
                    isPrivate: privateOnly ? true : false,
                    ownerId: userIdFilter.length > 0 ? { in: userIdFilter } : undefined
                } as any
            }
        }
    }) satisfies Prisma.ItemWhereInput;

export const getAllItemsInclude = (groupId: string, userIdFilter: string[], privateOnly = false) =>
    ({
        lists: {
            select: {
                listId: true,
                approved: true,
                displayOrder: true,
                addedBy: {
                    select: {
                        id: true,
                        name: true,
                        username: true
                    }
                }
            },
            where: {
                approved: true,
                list: {
                    groupId,
                    isPrivate: privateOnly ? true : false,
                    ownerId: userIdFilter.length > 0 ? { in: userIdFilter } : undefined
                } as any
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
                        username: true,
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
                    groupId,
                    isPrivate: privateOnly ? true : false
                } as any
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
                        name: true,
                        username: true
                    }
                }
            }
        },
        user: {
            select: {
                id: true,
                name: true,
                username: true
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
    take = ALL_ITEMS_PAGE_SIZE,
    privateOnly = false
}: {
    groupId: string;
    userIdFilter: string[];
    offset: number;
    take?: number;
    privateOnly?: boolean;
}) => {
    const where = getAllItemsFilter(groupId, userIdFilter, privateOnly);
    const include = getAllItemsInclude(groupId, userIdFilter, privateOnly);

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

export const getAllItemsFilterUsers = async ({
    groupId,
    privateOnly = false
}: {
    groupId: string;
    privateOnly?: boolean;
}) => {
    return client.user.findMany({
        where: {
            lists: {
                some: {
                    groupId,
                    isPrivate: privateOnly,
                    items: {
                        some: {
                            approved: true
                        }
                    }
                }
            }
        },
        select: {
            id: true,
            name: true,
            username: true
        },
        orderBy: {
            username: "asc"
        }
    });
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
                        name: true,
                        username: true
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
                        username: true,
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
                        name: true,
                        username: true
                    }
                }
            }
        },
        user: {
            select: {
                id: true,
                name: true,
                username: true
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
