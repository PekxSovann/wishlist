import { getFormatter } from "$lib/server/i18n";
import { Role } from "$lib/schema";
import { requireLoginOrError, requireRole } from "$lib/server/auth";
import { tryDeleteImage } from "$lib/server/image-util";
import { client } from "$lib/server/prisma";
import { Prisma } from "$lib/generated/prisma/client";
import { type RequestHandler, error } from "@sveltejs/kit";

export const DELETE: RequestHandler = async ({ params }) => {
    const authUser = await requireLoginOrError();
    const $t = await getFormatter();
    if (authUser.roleId !== Role.ADMIN) error(401, $t("errors.not-authorized"));

    if (!params.userId) {
        error(400, $t("errors.must-specify-an-item-to-delete"));
    }

    const user = await client.user.findUnique({
        where: {
            id: params.userId
        },
        select: {
            id: true
        }
    });

    if (!user) {
        error(404, $t("errors.user-not-found"));
    }

    if (user.id === authUser.id) {
        error(400, $t("errors.cannot-delete-yourself"));
    }

    try {
        const deletedUser = await client.user.delete({
            where: {
                id: user.id
            }
        });
        if (deletedUser && deletedUser.picture) {
            await tryDeleteImage(deletedUser.picture);
        }

        return new Response(JSON.stringify(deletedUser), { status: 200 });
    } catch {
        error(404, $t("errors.user-not-found"));
    }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
    await requireRole(Role.ADMIN);
    const $t = await getFormatter();

    if (!params.userId) {
        error(400, $t("errors.user-not-found"));
    }

    const body = (await request.json()) as { roleId?: number };
    if (
        !body ||
        typeof body.roleId !== "number" ||
        ![Role.USER, Role.BUYER, Role.ADMIN].includes(body.roleId as Role)
    ) {
        error(400, "Invalid role");
    }

    const roleName = Role[body.roleId as Role];
    if (roleName) {
        await client.role.upsert({
            where: { id: body.roleId },
            update: {},
            create: {
                id: body.roleId,
                name: roleName
            }
        });
    }

    let updated: { id: string; roleId: number };
    try {
        updated = await client.user.update({
            where: {
                id: params.userId
            },
            data: {
                roleId: body.roleId
            },
            select: {
                id: true,
                roleId: true
            }
        });
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
            error(404, $t("errors.user-not-found"));
        }
        error(500, $t("general.oops"));
    }

    return new Response(JSON.stringify(updated), { status: 200 });
};
