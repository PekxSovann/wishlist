<script lang="ts">
    import type { ItemOnListDTO } from "$lib/dtos/item-dto";
    import { getFormatter } from "$lib/i18n";
    import { formatNumberAsPrice, formatPlainNumber } from "$lib/price-formatter";

    interface Props {
        items: ItemOnListDTO[];
    }

    const { items }: Props = $props();
    const t = getFormatter();

    const itemCount = $derived(items.reduce((accum, item) => accum + (item.quantity || 1), 0));
    const totalCostByCurrency = $derived.by(() => {
        const totalCostByCurrency = items
            .filter((i) => i.itemPrice !== null)
            .reduce(
                (accum, item) => {
                    accum[item.itemPrice!.currency] =
                        (accum[item.itemPrice!.currency] ||= 0) + item.itemPrice!.value * (item.quantity || 1);
                    return accum;
                },
                {} as Record<string, number>
            );
        return Object.entries(totalCostByCurrency)
            .map(([currency, total]) => ({ currency, total }))
            .toSorted((a, b) => b.total - a.total);
    });
    const highestTotal = $derived(totalCostByCurrency[0]);
    const owedByClaimants = $derived.by(() => {
        const totals = items
            .flatMap((item) =>
                item.claims
                    .filter((claim) => claim.listId === item.listId && claim.claimedPrice)
                    .map((claim) => ({
                        name: claim.claimedBy?.username ?? claim.claimedBy?.name ?? claim.publicClaimedBy?.name ?? "Anonymous",
                        currency: claim.claimedPrice!.currency,
                        amount: claim.claimedPrice!.value * claim.quantity
                    }))
            )
            .reduce(
                (acc, row) => {
                    const key = `${row.name}::${row.currency}`;
                    if (!acc[key]) {
                        acc[key] = { name: row.name, currency: row.currency, total: 0 };
                    }
                    acc[key].total += row.amount;
                    return acc;
                },
                {} as Record<string, { name: string; currency: string; total: number }>
            );

        return Object.values(totals);
    });

    let seePrices = $state(false);
</script>

<div>
    <div class="flex flex-row items-baseline gap-1">
        <span>{$t("wishes.count-items", { values: { itemCount } })}</span>
        {#if totalCostByCurrency.length > 0}
            <span>·</span>
            <span>{formatNumberAsPrice(highestTotal.currency, highestTotal.total)}</span>
            {#if totalCostByCurrency.length > 1 && !seePrices}
                <button onclick={() => (seePrices = !seePrices)}>
                    <span class="text-surface-900/70 dark:text-surface-50/50 text-xs">
                        {$t("wishes.show-all-currencies")}
                    </span>
                </button>
            {/if}
        {/if}
    </div>
    {#if seePrices}
        <div class="flex flex-col gap-1 pt-1">
            <ul class="list">
                {#each totalCostByCurrency as { currency, total }}
                    <li>
                        <span
                            class="preset-tonal-primary border-primary-500 rounded-base w-fit min-w-12 border px-2 py-0.5 text-center text-sm"
                        >
                            {currency}
                        </span>
                        <span>{formatNumberAsPrice(currency, total)}</span>
                    </li>
                {/each}
            </ul>
            <button class="w-fit" onclick={() => (seePrices = !seePrices)}>
                <span class="text-surface-900/70 dark:text-surface-50/50 text-xs">
                    {$t("wishes.hide-all-currencies")}
                </span>
            </button>
        </div>
    {/if}
    {#if owedByClaimants.length > 0}
        <div class="mt-1 flex flex-col">
            <span class="subtext font-medium">Current owed</span>
            {#each owedByClaimants as owed}
                <span class="subtext">{owed.name}: {formatPlainNumber(owed.total)} {owed.currency}</span>
            {/each}
        </div>
    {/if}
</div>
