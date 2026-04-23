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
                    username: user.username,
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
            isPrivate: true,
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
                            itemPrice: true,
                            claims: {
                                select: {
                                    listId: true,
                                    quantity: true,
                                    claimedPrice: true,
                                    claimedCurrency: true,
                                    claimedBy: {
                                        select: {
                                            name: true,
                                            username: true
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
    } as any);

    const otherListsQuery = client.list.findMany({
        where: {
            ownerId: {
                not: user.id
            },
            groupId: activeMembership.groupId,
            isPrivate: user.roleId === Role.ADMIN ? undefined : false
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
            isPrivate: true,
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
                            itemPrice: true,
                            claims: {
                                select: {
                                    id: true,
                                    listId: true,
                                    quantity: true,
                                    claimedPrice: true,
                                    claimedCurrency: true,
                                    claimedBy: {
                                        select: {
                                            name: true,
                                            username: true
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
    } as any);

    const [myLists, otherLists] = (await Promise.all([userListsQuery, otherListsQuery])) as [any[], any[]];

    const usersById = new Map<string, { id: string; username: string; picture: string | null }>();
    usersById.set(user.id, {
        id: user.id,
        username: user.username,
        picture: user.picture || null
    });
    for (const list of otherLists) {
        usersById.set(list.owner.id, {
            id: list.owner.id,
            username: list.owner.username,
            picture: list.owner.picture || null
        });
    }
    const users = [...usersById.values()];

    return {
        myLists: myLists
            .filter((list: any) => effectiveUserIdFilter.length === 0 || effectiveUserIdFilter.includes(list.owner.id))
            .map((list: any) => {
                const owedByClaimants = Object.values(
                    list.items
                        .flatMap(({ item }: any) => item.claims)
                        .filter((claim: any) => claim.listId === list.id && claim.claimedPrice !== null && claim.claimedCurrency)
                        .reduce(
                            (acc: any, claim: any) => {
                                const claimantName =
                                    claim.claimedBy?.username ?? claim.claimedBy?.name ?? claim.publicClaimedBy?.name ?? "Anonymous";
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
                ) as { name: string; currency: string; total: number }[];
                const totalCostByCurrency = Object.entries(
                    list.items
                        .filter(({ item }: any) => item.itemPrice !== null)
                        .reduce(
                            (accum: any, { item }: any) => {
                                accum[item.itemPrice!.currency] =
                                    (accum[item.itemPrice!.currency] ||= 0) + item.itemPrice!.value * (item.quantity || 1);
                                return accum;
                            },
                            {} as Record<string, number>
                        )
                )
                    .map(([currency, total]) => ({ currency, total: Number(total) }))
                    .toSorted((a, b) => b.total - a.total);
                return {
                    id: list.id,
                    name: list.name,
                    icon: list.icon,
                    iconColor: list.iconColor,
                    isPrivate: list.isPrivate,
                    owner: list.owner,
                    claimedCount: undefined,
                    itemCount: list.items.reduce((accum: any, { item }: any) => accum + (item.quantity || 1), 0),
                    unapprovedCount: list._count.items,
                    totalCostByCurrency,
                    owedByClaimants
                };
            }),
        otherLists: otherLists
            .filter((list: any) => effectiveUserIdFilter.length === 0 || effectiveUserIdFilter.includes(list.owner.id))
            .map((list: any) => {
                const claimedCount = list.items
                    .filter((it: any) => it.approved)
                    .filter(({ item }: any) => {
                        const claimedCount = item.claims.map(({ quantity }: any) => quantity).reduce((a: any, b: any) => a + b, 0);
                        return claimedCount === item.quantity;
                    }).length;
                const itemCount = list.items
                    .filter((it: any) => it.approved)
                    .reduce((accum: any, { item }: any) => accum + (item.quantity || 1), 0);
                const items = list.items.map((it: any) => ({ id: it.item.id }));
                const owedByClaimants = Object.values(
                    list.items
                        .flatMap(({ item }: any) => item.claims)
                        .filter((claim: any) => claim.listId === list.id && claim.claimedPrice !== null && claim.claimedCurrency)
                        .reduce(
                            (acc: any, claim: any) => {
                                const claimantName =
                                    claim.claimedBy?.username ?? claim.claimedBy?.name ?? claim.publicClaimedBy?.name ?? "Anonymous";
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
                ) as { name: string; currency: string; total: number }[];
                const totalCostByCurrency = Object.entries(
                    list.items
                        .filter((it: any) => it.approved && it.item.itemPrice !== null)
                        .reduce(
                            (accum: any, { item }: any) => {
                                accum[item.itemPrice!.currency] =
                                    (accum[item.itemPrice!.currency] ||= 0) + item.itemPrice!.value * (item.quantity || 1);
                                return accum;
                            },
                            {} as Record<string, number>
                        )
                )
                    .map(([currency, total]) => ({ currency, total: Number(total) }))
                    .toSorted((a, b) => b.total - a.total);
                return {
                    id: list.id,
                    name: list.name,
                    icon: list.icon,
                    iconColor: list.iconColor,
                    isPrivate: list.isPrivate,
                    owner: list.owner,
                    claimedCount,
                    itemCount,
                    items,
                    totalCostByCurrency,
                    owedByClaimants
                };
            }),
        users,
        canCreatePrivate: [Role.BUYER, Role.ADMIN].includes(user.roleId)
    };
}) satisfies PageServerLoad;
