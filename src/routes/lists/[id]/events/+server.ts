import { itemEmitter } from "$lib/server/events/emitters";
import { createSSE } from "$lib/server/events/sse";
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { getConfig } from "$lib/server/config";
import { getFormatter } from "$lib/server/i18n";
import { getById } from "$lib/server/list";
import { getActiveMembership } from "$lib/server/group-membership";
import { ItemCreateHandler, ItemDeleteHandler, ItemsUpdateHandler, ItemUpdateHandler } from "$lib/events";
import { Role } from "$lib/schema";

export const GET = (async ({ locals, params }) => {
    const $t = await getFormatter();

    const list: any = await getById(params.id);
    const config = await getConfig(list?.groupId);
    if (!locals.user) {
        // Unauthenticated users can only view public lists
        if (!list || !list.public || list.isPrivate) {
            // Redirect to login so we don't expose details if the list does exist
            return new Response();
        }
    } else {
        // Logged in users must be in the correct group, or viewing a public list
        const activeMembership = await getActiveMembership(locals.user);
        if (!list) {
            error(404, $t("errors.list-not-found"));
        }
        if (list.isPrivate) {
            if (list.groupId !== activeMembership.groupId) {
                error(404, $t("errors.list-not-found"));
            }
            if (list.owner.id !== locals.user.id && locals.user.roleId !== Role.ADMIN) {
                error(404, $t("errors.list-not-found"));
            }
        } else if (!list.public && list.groupId !== activeMembership.groupId) {
            error(404, $t("errors.list-not-found"));
        }
    }

    // don't do updates on the list owners page for surprise mode since an item could be added that the owner shouldn't see
    if (
        config.suggestions.enable &&
        config.suggestions.method === "surprise" &&
        locals.user &&
        (list.owner.id === locals.user.id || list.managers.find(({ userId }: any) => userId === locals.user!.id))
    ) {
        return new Response();
    }

    const { readable, subscribeToEvent } = createSSE();

    subscribeToEvent(itemEmitter, new ItemUpdateHandler(params.id));
    subscribeToEvent(itemEmitter, new ItemCreateHandler(params.id));
    subscribeToEvent(itemEmitter, new ItemDeleteHandler(params.id));
    subscribeToEvent(itemEmitter, new ItemsUpdateHandler(params.id));

    return new Response(readable, {
        headers: {
            "Cache-Control": "no-cache",
            "Content-Type": "text/event-stream",
            "X-Accel-Buffering": "no"
        }
    });
}) satisfies RequestHandler;
