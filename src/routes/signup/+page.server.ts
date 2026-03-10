import { createSession, generateSessionToken, setSessionTokenCookie } from "$lib/server/auth";
import { client } from "$lib/server/prisma";
import { getSignupSchema } from "$lib/server/validations";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { hashToken } from "$lib/server/token";
import { getConfig } from "$lib/server/config";
import { env } from "$env/dynamic/private";
import { createUser } from "$lib/server/user";
import { Role } from "$lib/schema";
import { getFormatter } from "$lib/server/i18n";
import { logger } from "$lib/server/logger";
import { Prisma } from "$lib/generated/prisma/client";
import z from "zod";

export const load: PageServerLoad = async ({ locals, url }) => {
    if (locals.user) redirect(302, url.searchParams.get("redirectTo") ?? "/");

    const $t = await getFormatter();
    const config = await getConfig();

    const token = url.searchParams.get("token");
    if (token) {
        const signup = await client.signupToken.findFirst({
            where: {
                hashedToken: hashToken(token),
                redeemed: false
            },
            select: {
                id: true,
                createdAt: true,
                groupId: true
            }
        });

        if (!signup) error(400, $t("errors.reset-token-not-found"));
        const group = await client.group.findUnique({
            where: { id: signup.groupId },
            select: { id: true }
        });

        if (validateToken(signup.createdAt) && group) {
            return { valid: true, id: signup.id };
        }
        error(400, $t("errors.invite-code-invalid"));
    }
    if (!config.enableSignup) {
        error(401, $t("errors.this-instance-is-invite-only"));
    }
};

export const actions: Actions = {
    default: async ({ request, cookies }) => {
        const formData = Object.fromEntries(await request.formData());
        const signupSchema = await getSignupSchema();
        const signupData = signupSchema.safeParse(formData);
        const $t = await getFormatter();

        // check for empty values
        if (!signupData.success) {
            return fail(400, { error: true, errors: z.flattenError(signupData.error).fieldErrors });
        }

        const config = await getConfig();

        if (!config.enableSignup) {
            if (!signupData.data.tokenId) {
                error(401, $t("errors.this-instance-is-invite-only"));
            }
            const signup = await client.signupToken.findUnique({
                where: {
                    id: signupData.data.tokenId
                },
                select: {
                    createdAt: true,
                    redeemed: true,
                    groupId: true
                }
            });
            const group = signup
                ? await client.group.findUnique({
                      where: { id: signup.groupId },
                      select: { id: true }
                  })
                : null;

            if (!signup || signup.redeemed || !validateToken(signup.createdAt) || !group) {
                error(400, $t("errors.invite-code-invalid"));
            }
        }

        const userCount = await client.user.count();
        try {
            const user = await createUser(
                {
                    username: signupData.data.username,
                    email: signupData.data.email,
                    name: signupData.data.name
                },
                userCount > 0 ? Role.USER : Role.ADMIN,
                signupData.data.password,
                signupData.data.tokenId
            );

            const sessionToken = generateSessionToken();
            const session = await createSession(sessionToken, user.id);
            setSessionTokenCookie(cookies, sessionToken, session.expiresAt);
            return { success: true };
        } catch (err) {
            logger.error({ err }, "Unable to create user");
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
                return fail(400, {
                    error: true,
                    message: $t("errors.user-already-exists")
                });
            }
            return fail(400, {
                error: true,
                message: $t("general.oops")
            });
        }
    }
};

function validateToken(createdAt: Date) {
    const expiresIn = (env.TOKEN_TIME ? Number.parseInt(env.TOKEN_TIME) : 72) * 3600000;
    const expiry = createdAt.getTime() + expiresIn;
    return Date.now() < expiry;
}
