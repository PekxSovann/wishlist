import type { PageServerLoad } from "./$types";
import { getActiveMembership } from "$lib/server/group-membership";
import { requireLogin } from "$lib/server/auth";
import { decodeMultiValueFilter } from "$lib/server/sort-filter-util";
import { getConfig } from "$lib/server/config";
import { redirect } from "@sveltejs/kit";
import { Role } from "$lib/schema";
import { getAllItemsPage } from "$lib/server/items";

export const load: PageServerLoad = async ({ url, cookies }) => {
    const user = requireLogin();
    if (user.roleId === Role.USER) {
        redirect(302, `/lists?users=${user.id}`);
    }
    const activeMembership = await getActiveMembership(user);
    const config = await getConfig(activeMembership.groupId);

    const userIdFilter = decodeMultiValueFilter(url.searchParams.get("users"));

    const allItemsPage = await getAllItemsPage({
        groupId: activeMembership.groupId,
        userIdFilter,
        offset: 0
    });
    const viewPreference = cookies.get("listViewPreference") as "list" | "tile" | undefined;

    return {
        user: {
            ...user,
            activeGroupId: activeMembership.groupId
        },
        items: allItemsPage.items,
        loadedItemCount: allItemsPage.loadedItemCount,
        hasMoreItems: allItemsPage.hasMore,
        totalItemCount: allItemsPage.totalCount,
        showClaimedName: config.claims.showName,
        showNameAcrossGroups: config.claims.showNameAcrossGroups,
        showClaimForOwner: config.claims.showForOwner,
        requireClaimEmail: config.claims.requireEmail,
        initialViewPreference: viewPreference || "list"
    };
};
