import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { Client } from "pg";

const sqlitePath = process.argv[2] ?? "dev.db";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
}

if (!existsSync(sqlitePath)) {
    console.error(`SQLite file not found: ${sqlitePath}`);
    process.exit(1);
}

const orderedTables = [
    "role",
    "group",
    "user",
    "system_user",
    "session",
    "user_group_membership",
    "item_price",
    "list",
    "list_manager",
    "items",
    "list_item",
    "list_item_claim",
    "password_resets",
    "signup_tokens",
    "system_config",
    "patch"
];

const boolColumnsByTable = {
    user_group_membership: new Set(["active"]),
    list: new Set(["public"]),
    items: new Set(["mostWanted"]),
    list_item: new Set(["approved"]),
    list_item_claim: new Set(["purchased"]),
    password_resets: new Set(["redeemed"]),
    signup_tokens: new Set(["redeemed"])
};

const quoteIdent = (s) => `"${s.replaceAll('"', '""')}"`;

function readSqliteRows(table) {
    const out = execFileSync(
        "sqlite3",
        ["-json", sqlitePath, `SELECT * FROM ${quoteIdent(table)};`],
        { encoding: "utf8" }
    ).trim();

    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [];
}

function normalizeValue(table, col, val) {
    if (val === undefined) return null;
    if (val === null) return null;

    if (boolColumnsByTable[table]?.has(col)) {
        if (val === 1 || val === "1") return true;
        if (val === 0 || val === "0") return false;
    }

    return val;
}

async function insertRows(client, table, rows) {
    if (rows.length === 0) return 0;

    const cols = Object.keys(rows[0]);
    const colSql = cols.map(quoteIdent).join(", ");

    const chunkSize = 500;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];

        for (let r = 0; r < chunk.length; r++) {
            const row = chunk[r];
            const rowPlaceholders = [];

            for (let c = 0; c < cols.length; c++) {
                const col = cols[c];
                values.push(normalizeValue(table, col, row[col]));
                rowPlaceholders.push(`$${values.length}`);
            }

            placeholders.push(`(${rowPlaceholders.join(", ")})`);
        }

        const sql = `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES ${placeholders.join(", ")}`;
        await client.query(sql, values);
        inserted += chunk.length;
    }

    return inserted;
}

async function main() {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    console.log(`Migrating SQLite (${sqlitePath}) -> Postgres`);

    try {
        await client.query("BEGIN");

        const truncateSql = `TRUNCATE TABLE ${orderedTables.map(quoteIdent).join(", ")} CASCADE`;
        await client.query(truncateSql);

        for (const table of orderedTables) {
            const rows = readSqliteRows(table);
            const count = await insertRows(client, table, rows);
            console.log(`  ${table}: ${count}`);
        }

        await client.query("COMMIT");
        console.log("Migration completed.");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Migration failed:", err?.message ?? err);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

await main();
