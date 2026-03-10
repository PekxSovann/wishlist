import { env } from "$env/dynamic/private";
import { PrismaClient } from "$lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

export const client = new PrismaClient({
    // log: ["query", "info", "warn", "error"]
    log: ["warn", "error"],
    adapter: new PrismaPg(
        new Pool({
            connectionString: env.DATABASE_URL
        })
    )
});
