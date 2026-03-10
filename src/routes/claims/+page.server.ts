import type { PageServerLoad } from "./$types";
import { client } from "$lib/server/prisma";
import { getActiveMembership } from "$lib/server/group-membership";
import { toItemOnListDTO } from "$lib/dtos/item-mapper";
import { requireLogin } from "$lib/server/auth";
import { decodeMultiValueFilter } from "$lib/server/sort-filter-util";
import { redirect } from "@sveltejs/kit";
import { Role } from "$lib/schema";

export const load: PageServerLoad = async ({ url, cookies }) => {
    const user = requireLogin();
    if (user.roleId === Role.USER) {
        redirect(302, `/lists?users=${user.id}`);
    }

    const activeMembership = await getActiveMembership(user);

    // Read view preference from cookie (for SSR to prevent flicker)
    const viewPreference = cookies.get("listViewPreference") as "list" | "tile" | undefined;

    const userIdFilter = decodeMultiValueFilter(url.searchParams.get("users"));
    const items = await client.item.findMany({
        where: {
            claims: {
                some: {
                    claimedById: user.id,
                    list: {
                        groupId: activeMembership.groupId
                    }
                }
            },
            lists: {
                some: {
                    list: {
                        groupId: activeMembership.groupId
                    }
                }
            },
            userId: {
                in: userIdFilter.length > 0 ? userIdFilter : undefined
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
                    list: {
                        groupId: activeMembership.groupId
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
                    claimedById: user.id,
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

    const itemDTOs = items.map((item) => {
        const claim = item.claims[0];
        return toItemOnListDTO(item, claim.listId);
    });

    return {
        user: {
            ...user,
            activeGroupId: activeMembership.groupId
        },
        items: itemDTOs,
        initialViewPreference: viewPreference || "list"
    };
};
