import { ItemEvent } from "$lib/events";
import { itemEmitter } from "$lib/server/events/emitters";
import { requireLoginOrError } from "$lib/server/auth";
import { getFormatter } from "$lib/server/i18n";
import { tryDeleteImage } from "$lib/server/image-util";
import { logger } from "$lib/server/logger";
import { getNextDisplayOrderForLists } from "$lib/server/list";
import { client } from "$lib/server/prisma";
import { bulkListItemUpdateSchema } from "$lib/server/validations";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, params }) => {
    const user = await requireLoginOrError();
    const $t = await getFormatter();
    const body = await request.json().then(bulkListItemUpdateSchema.safeParse);

    if (!body.success) {
        error(422, body.error.message);
    }

    const sourceList = await client.list.findUnique({
        select: {
            ownerId: true,
            managers: {
                select: {
                    userId: true
                }
            }
        },
        where: {
            id: params.listId
        }
    });

    if (!sourceList) {
        error(404, $t("errors.list-not-found"));
    }

    const canManageSource = sourceList.ownerId === user.id || sourceList.managers.some(({ userId }) => userId === user.id);
    if (!canManageSource) {
        error(401, $t("errors.not-authorized"));
    }

    const itemIds = [...new Set(body.data.itemIds)];

    try {
        if (body.data.action === "delete") {
            await deleteItemsFromList(params.listId, itemIds, user.id);
        } else {
            await moveItemsToList(params.listId, body.data.targetListId, itemIds, sourceList.ownerId);
        }

        itemEmitter.emit(ItemEvent.ITEMS_UPDATE);
        return new Response(null, { status: 200 });
    } catch (err) {
        logger.error({ err }, "Error bulk updating list items");
        error(500, $t("general.oops"));
    }
};

async function deleteItemsFromList(listId: string, itemIds: string[], userId: string) {
    await client.$transaction(async (tx) => {
        const listItems = await tx.listItem.findMany({
            select: {
                id: true,
                itemId: true,
                item: {
                    select: {
                        id: true,
                        createdById: true,
                        userId: true,
                        imageUrl: true,
                        lists: {
                            select: {
                                id: true
                            }
                        }
                    }
                }
            },
            where: {
                listId,
                itemId: {
                    in: itemIds
                }
            }
        });

        if (listItems.length !== itemIds.length) {
            throw new Error("One or more items were not found on the list");
        }

        await tx.itemClaim.deleteMany({
            where: {
                listId,
                itemId: {
                    in: itemIds
                }
            }
        });

        await tx.listItem.deleteMany({
            where: {
                id: {
                    in: listItems.map(({ id }) => id)
                }
            }
        });

        const orphanedItems = listItems
            .map(({ item }) => item)
            .filter((item) => item.lists.length === 1 && (item.createdById === userId || item.userId === userId));

        await tx.item.deleteMany({
            where: {
                id: {
                    in: orphanedItems.map(({ id }) => id)
                }
            }
        });

        for (const item of orphanedItems) {
            if (item.imageUrl) tryDeleteImage(item.imageUrl);
        }
    });
}

async function moveItemsToList(sourceListId: string, targetListId: string, itemIds: string[], ownerId: string) {
    if (sourceListId === targetListId) {
        throw new Error("Target list must be different from source list");
    }

    const targetList = await client.list.findUnique({
        select: {
            id: true,
            ownerId: true
        },
        where: {
            id: targetListId
        }
    });

    if (!targetList || targetList.ownerId !== ownerId) {
        throw new Error("Target list was not found");
    }

    const nextDisplayOrderByList = await getNextDisplayOrderForLists([targetListId]);

    await client.$transaction(async (tx) => {
        const sourceItems = await tx.listItem.findMany({
            select: {
                id: true,
                itemId: true,
                addedById: true,
                approved: true
            },
            where: {
                listId: sourceListId,
                itemId: {
                    in: itemIds
                }
            }
        });

        if (sourceItems.length !== itemIds.length) {
            throw new Error("One or more items were not found on the list");
        }

        const existingTargetItems = await tx.listItem.findMany({
            select: {
                itemId: true
            },
            where: {
                listId: targetListId,
                itemId: {
                    in: itemIds
                }
            }
        });
        const existingTargetItemIds = new Set(existingTargetItems.map(({ itemId }) => itemId));

        await tx.itemClaim.deleteMany({
            where: {
                listId: sourceListId,
                itemId: {
                    in: itemIds
                }
            }
        });

        await tx.listItem.deleteMany({
            where: {
                id: {
                    in: sourceItems.map(({ id }) => id)
                }
            }
        });

        let displayOrder = nextDisplayOrderByList[targetListId] || 0;
        await tx.listItem.createMany({
            data: sourceItems
                .filter(({ itemId }) => !existingTargetItemIds.has(itemId))
                .map(({ itemId, addedById, approved }) => ({
                    itemId,
                    listId: targetListId,
                    addedById,
                    approved,
                    displayOrder: displayOrder++
                }))
        });
    });
}
