import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { client } from "$lib/server/prisma";
import { getActiveMembership } from "$lib/server/group-membership";
import { getConfig } from "$lib/server/config";
import { decodeMultiValueFilter } from "$lib/server/sort-filter-util";
import { requireLogin } from "$lib/server/auth";
import { Role } from "$lib/schema";

export const load = (async ({ url }) => {
    const user = requireLogin();

    const activeMembership = await getActiveMembership(user);
    const config = await getConfig(activeMembership.groupId);
    if (config.listMode === "registry") {
        const list = await client.list.findFirst({
            select: {
                id: true
            },
            where: {
                ownerId: user.id,
                groupId: activeMembership.groupId
            }
        });
        if (list) {
            redirect(302, `/lists/${list.id}`);
        }
        return {
            myLists: [],
            otherLists: [],
            users: [
                {
                    id: user.id,
                    name: user.name,
                    picture: user.picture || null
                }
            ]
        };
    }

    const userIdFilter = decodeMultiValueFilter(url.searchParams.get("users"));
    const effectiveUserIdFilter = user.roleId === Role.USER ? [user.id] : userIdFilter;

    const userListsQuery = client.list.findMany({
        where: {
            ownerId: user.id,
            groupId: activeMembership.groupId
        },
        orderBy: {
            name: "asc"
        },
        select: {
            id: true,
            name: true,
            icon: true,
            iconColor: true,
            owner: {
                select: {
                    id: true,
                    name: true,
                    username: true,
                    picture: true
                }
            },
            items: {
                select: {
                    id: true,
                    item: {
                        select: {
                            quantity: true,
                            claims: {
                                select: {
                                    listId: true,
                                    quantity: true,
                                    claimedPrice: true,
                                    claimedCurrency: true,
                                    claimedBy: {
                                        select: {
                                            name: true
                                        }
                                    },
                                    publicClaimedBy: {
                                        select: {
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                where: {
                    addedBy:
                        config.suggestions.enable && config.suggestions.method === "surprise"
                            ? { username: user.username }
                            : undefined
                }
            },
            _count: {
                select: {
                    items: {
                        where: {
                            approved: false
                        }
                    }
                }
            }
        }
    });

    const otherListsQuery = client.list.findMany({
        where: {
            ownerId: {
                not: user.id
            },
            groupId: activeMembership.groupId
        },
        orderBy: [
            {
                owner: {
                    name: "asc"
                }
            },
            {
                name: "asc"
            }
        ],
        select: {
            id: true,
            name: true,
            icon: true,
            iconColor: true,
            owner: {
                select: {
                    id: true,
                    name: true,
                    username: true,
                    picture: true
                }
            },
            items: {
                select: {
                    id: true,
                    approved: true,
                    item: {
                        select: {
                            id: true,
                            quantity: true,
                            claims: {
                                select: {
                                    id: true,
                                    listId: true,
                                    quantity: true,
                                    claimedPrice: true,
                                    claimedCurrency: true,
                                    claimedBy: {
                                        select: {
                                            name: true
                                        }
                                    },
                                    publicClaimedBy: {
                                        select: {
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const [myLists, otherLists] = await Promise.all([userListsQuery, otherListsQuery]);

    const users = [
        {
            id: user.id,
            name: user.name,
            picture: user.picture || null
        },
        ...new Set(
            otherLists.map((list) => ({
                id: list.owner.id,
                name: list.owner.name,
                picture: list.owner.picture || null
            }))
        )
    ];

    return {
        myLists: myLists
            .filter((list) => effectiveUserIdFilter.length === 0 || effectiveUserIdFilter.includes(list.owner.id))
            .map((list) => {
                const owedByClaimants = Object.values(
                    list.items
                        .flatMap(({ item }) => item.claims)
                        .filter((claim) => claim.listId === list.id && claim.claimedPrice !== null && claim.claimedCurrency)
                        .reduce(
                            (acc, claim) => {
                                const claimantName = claim.claimedBy?.name ?? claim.publicClaimedBy?.name ?? "Anonymous";
                                const key = `${claimantName}::${claim.claimedCurrency}`;
                                const amount = claim.claimedPrice! * claim.quantity;
                                if (!acc[key]) {
                                    acc[key] = { name: claimantName, currency: claim.claimedCurrency!, total: 0 };
                                }
                                acc[key].total += amount;
                                return acc;
                            },
                            {} as Record<string, { name: string; currency: string; total: number }>
                        )
                );
                return {
                    id: list.id,
                    name: list.name,
                    icon: list.icon,
                    iconColor: list.iconColor,
                    owner: list.owner,
                    claimedCount: undefined,
                    itemCount: list.items.reduce((accum, { item }) => accum + (item.quantity || 1), 0),
                    unapprovedCount: list._count.items,
                    owedByClaimants
                };
            }),
        otherLists: otherLists
            .filter((list) => effectiveUserIdFilter.length === 0 || effectiveUserIdFilter.includes(list.owner.id))
            .map((list) => {
                const claimedCount = list.items
                    .filter((it) => it.approved)
                    .filter(({ item }) => {
                        const claimedCount = item.claims.map(({ quantity }) => quantity).reduce((a, b) => a + b, 0);
                        return claimedCount === item.quantity;
                    }).length;
                const itemCount = list.items
                    .filter((it) => it.approved)
                    .reduce((accum, { item }) => accum + (item.quantity || 1), 0);
                const items = list.items.map((it) => ({ id: it.item.id }));
                const owedByClaimants = Object.values(
                    list.items
                        .flatMap(({ item }) => item.claims)
                        .filter((claim) => claim.listId === list.id && claim.claimedPrice !== null && claim.claimedCurrency)
                        .reduce(
                            (acc, claim) => {
                                const claimantName = claim.claimedBy?.name ?? claim.publicClaimedBy?.name ?? "Anonymous";
                                const key = `${claimantName}::${claim.claimedCurrency}`;
                                const amount = claim.claimedPrice! * claim.quantity;
                                if (!acc[key]) {
                                    acc[key] = { name: claimantName, currency: claim.claimedCurrency!, total: 0 };
                                }
                                acc[key].total += amount;
                                return acc;
                            },
                            {} as Record<string, { name: string; currency: string; total: number }>
                        )
                );
                return {
                    id: list.id,
                    name: list.name,
                    icon: list.icon,
                    iconColor: list.iconColor,
                    owner: list.owner,
                    claimedCount,
                    itemCount,
                    items,
                    owedByClaimants
                };
            }),
        users
    };
}) satisfies PageServerLoad;
