import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { client } from "$lib/server/prisma";
import { requireLoginOrError } from "$lib/server/auth";
import { getFormatter } from "$lib/server/i18n";
import { logger } from "$lib/server/logger";
import { itemEmitter } from "$lib/server/events/emitters";
import { ItemEvent } from "$lib/events";
import { getItemInclusions } from "$lib/server/items";
import z from "zod";

const schema = z.object({
    note: z.string().max(5000).nullish()
});

export const PATCH: RequestHandler = async ({ params, request }) => {
    const user = await requireLoginOrError();
    const $t = await getFormatter();

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
        error(422, $t("general.oops"));
    }

    const note = parsed.data.note?.trim() || null;

    const membershipGroupIds = await client.userGroupMembership.findMany({
        select: { groupId: true },
        where: { userId: user.id }
    });
    const groupIds = membershipGroupIds.map((m) => m.groupId);

    const item = await client.item.findFirst({
        select: { id: true },
        where: {
            id: params.itemId,
            lists: {
                some: {
                    list: {
                        groupId: { in: groupIds }
                    }
                }
            }
        }
    });
    if (!item) {
        error(404, $t("errors.item-not-found"));
    }

    try {
        if (note === null) {
            await client.itemBuyerNote.deleteMany({
                where: {
                    itemId: item.id,
                    userId: user.id
                }
            });
        } else {
            await client.itemBuyerNote.upsert({
                where: {
                    itemId_userId: {
                        itemId: item.id,
                        userId: user.id
                    }
                },
                update: {
                    note
                },
                create: {
                    itemId: item.id,
                    userId: user.id,
                    note
                }
            });
        }

        const updatedItem = await client.item.findUnique({
            where: { id: item.id },
            include: getItemInclusions()
        });
        if (updatedItem) itemEmitter.emit(ItemEvent.ITEM_UPDATE, updatedItem);

        return new Response(null, { status: 200 });
    } catch (err) {
        logger.error({ err }, "Unable to update buyer note");
        error(500, $t("general.oops"));
    }
};
