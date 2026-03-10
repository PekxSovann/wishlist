import type { PageServerLoad } from "./$types";
import { client } from "$lib/server/prisma";
import { getActiveMembership } from "$lib/server/group-membership";
import { toItemOnListDTO } from "$lib/dtos/item-mapper";
import { requireLogin } from "$lib/server/auth";
import { decodeMultiValueFilter } from "$lib/server/sort-filter-util";
import { getConfig } from "$lib/server/config";
import { redirect } from "@sveltejs/kit";
import { Role } from "$lib/schema";

export const load: PageServerLoad = async ({ url, cookies }) => {
    const user = requireLogin();
    if (user.roleId === Role.USER) {
        redirect(302, `/lists?users=${user.id}`);
    }
    const activeMembership = await getActiveMembership(user);
    const config = await getConfig(activeMembership.groupId);

    const userIdFilter = decodeMultiValueFilter(url.searchParams.get("users"));

    const items = await client.item.findMany({
        where: {
            lists: {
                some: {
                    approved: true,
                    list: {
                        groupId: activeMembership.groupId,
                        ownerId: userIdFilter.length > 0 ? { in: userIdFilter } : undefined
                    }
                }
            }
        },
        include: {
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
                        groupId: activeMembership.groupId,
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
                        groupId: activeMembership.groupId
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
        }
    });

    const itemDTOs = items.flatMap((item) => item.lists.map((list) => toItemOnListDTO(item, list.listId)));
    const viewPreference = cookies.get("listViewPreference") as "list" | "tile" | undefined;

    return {
        user: {
            ...user,
            activeGroupId: activeMembership.groupId
        },
        items: itemDTOs,
        showClaimedName: config.claims.showName,
        showNameAcrossGroups: config.claims.showNameAcrossGroups,
        showClaimForOwner: config.claims.showForOwner,
        requireClaimEmail: config.claims.requireEmail,
        initialViewPreference: viewPreference || "list"
    };
};
