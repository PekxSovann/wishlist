<script lang="ts">
    import type { PageProps } from "./$types";
    import { fade, scale } from "svelte/transition";
    import { flip } from "svelte/animate";
    import ItemCard from "$lib/components/wishlists/ItemCard/ItemCard.svelte";
    import noWishes from "$lib/assets/no_wishes.svg";
    import type { ItemOnListDTO } from "$lib/dtos/item-dto";
    import { getFormatter } from "$lib/i18n";
    import { getListViewPreference, initListViewPreference } from "$lib/stores/list-view-preference.svelte";
    import ListViewModeChip from "$lib/components/wishlists/chips/ListViewModeChip.svelte";
    import ListFilterChip from "$lib/components/wishlists/chips/ListFilterChip.svelte";
    import { SegmentedControl } from "@skeletonlabs/skeleton-svelte";
    import { goto, invalidateAll } from "$app/navigation";
    import { page } from "$app/state";
    import { formatPrice } from "$lib/price-formatter";
    import { resolve } from "$app/paths";
    import Image from "$lib/components/Image.svelte";
    import { ListItemAPI } from "$lib/api/lists";
    import { ItemsAPI } from "$lib/api/items";
    import { toaster } from "$lib/components/toaster";

    const { data }: PageProps = $props();
    const t = getFormatter();
    const itemsApi = new ItemsAPI();

    let items: ItemOnListDTO[] = $state(data.items);
    let loadedItemCount = $state(data.loadedItemCount);
    let hasMoreItems = $state(data.hasMoreItems);
    let loadingMoreItems = $state(false);

    $effect(() => {
        items = data.items;
        loadedItemCount = data.loadedItemCount;
        hasMoreItems = data.hasMoreItems;
        loadingMoreItems = false;
        selectedItemKeys = new Set();
        paidPriceByKey = {};
        quantityByKey = {};
    });

    initListViewPreference(data.initialViewPreference);
    let isTileView = $derived(getListViewPreference() === "tile");
    let users = $derived(data.filterUsers);
    let groupBy = $state<"all" | "left-to-buy">("left-to-buy");
    let visibleItems = $derived(groupBy === "left-to-buy" ? items.filter((item) => item.remainingQuantity > 0) : items);
    let selectMultiple = $state(false);
    let selectedItemKeys = $state<Set<string>>(new Set());
    let paidPriceByKey = $state<Record<string, number>>({});
    let quantityByKey = $state<Record<string, number>>({});
    let claimingMultiple = $state(false);
    let multiSelectMode = $derived(groupBy === "left-to-buy" && selectMultiple);
    const itemKey = (item: ItemOnListDTO) => `${item.id}-${item.listId}`;

    $effect(() => {
        if (groupBy !== "left-to-buy" && selectMultiple) {
            selectMultiple = false;
        }
    });

    const toggleSelected = (key: string, selected: boolean) => {
        const next = new Set(selectedItemKeys);
        if (selected) {
            next.add(key);
        } else {
            next.delete(key);
        }
        selectedItemKeys = next;
    };

    const editItem = async (itemId: string) => {
        const redirectTo = encodeURIComponent(page.url.pathname + page.url.search);
        await goto(`/items/${itemId}/edit?redirectTo=${redirectTo}`);
    };
    const loadMoreItems = async () => {
        if (loadingMoreItems || !hasMoreItems) return;

        loadingMoreItems = true;

        try {
            const response = await itemsApi.getAllItemsPage({
                offset: loadedItemCount,
                users: page.url.searchParams.get("users")
            });

            if (!response.ok) {
                throw new Error("Unable to load more items");
            }

            const nextPage = (await response.json()) as {
                items: ItemOnListDTO[];
                loadedItemCount: number;
                hasMore: boolean;
            };

            items = [...items, ...nextPage.items];
            loadedItemCount = nextPage.loadedItemCount;
            hasMoreItems = nextPage.hasMore;
        } catch {
            toaster.error({ description: "Unable to load more items" });
        } finally {
            loadingMoreItems = false;
        }
    };
    const getItemImageUrl = (item: ItemOnListDTO): string | undefined => {
        if (!item.imageUrl) return;
        try {
            new URL(item.imageUrl);
            return item.imageUrl;
        } catch {
            if (item.imageUrl.startsWith("/") || item.imageUrl.endsWith("/")) {
                return;
            }
            return resolve("/api/assets/[id]", { id: item.imageUrl });
        }
    };
    const getDesiredPriceBaseValue = (item: ItemOnListDTO): number | string => {
        const directPrice = Number(item.price);
        if (Number.isFinite(directPrice) && directPrice >= 0) {
            return directPrice;
        }

        if (item.itemPrice) {
            const fractionDigits = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: item.itemPrice.currency
            }).resolvedOptions().maximumFractionDigits ?? 2;

            // Backward compatibility for legacy rows where zero-decimal currencies were persisted as x100.
            if (fractionDigits === 0 && item.itemPrice.value >= 100000 && item.itemPrice.value % 100 === 0) {
                return item.itemPrice.value / 100;
            }

            return item.itemPrice.value / Math.pow(10, fractionDigits);
        }

        return "";
    };
    const claimMultipleItems = async () => {
        if (claimingMultiple) return;
        if (selectedItemKeys.size === 0) {
            toaster.error({ description: "Select at least one item" });
            return;
        }

        const targets = visibleItems.filter((item) => selectedItemKeys.has(itemKey(item)));
        claimingMultiple = true;
        const results = await Promise.all(
            targets.map(async (item) => {
                const key = itemKey(item);
                const qtyInput = Number(quantityByKey[key] ?? item.remainingQuantity);
                const qty = Math.max(1, Math.min(Math.round(qtyInput), item.remainingQuantity));
                const paidInput = Number(paidPriceByKey[key] ?? getDesiredPriceBaseValue(item));
                const claimedCurrency = item.itemPrice?.currency?.toUpperCase() ?? null;
                const claimedPrice = Number.isFinite(paidInput) && paidInput >= 0 ? Math.round(paidInput) : null;

                const api = new ListItemAPI(item.listId, item.id);
                const resp = await api.claim(data.user.id, qty, claimedPrice, claimedCurrency);
                return { ok: resp.ok };
            })
        );
        claimingMultiple = false;

        const failures = results.filter((result) => !result.ok).length;
        if (failures > 0) {
            toaster.error({ description: `Claimed ${results.length - failures}/${results.length} items` });
            return;
        }

        toaster.info({ description: "Claimed selected items" });
        selectedItemKeys = new Set();
        paidPriceByKey = {};
        quantityByKey = {};
        await invalidateAll();
    };
</script>

<div class="flex flex-wrap items-end justify-between gap-2 pb-4 print:hidden">
    <div class="flex items-end gap-2">
        <ListFilterChip {users} />
        <SegmentedControl class="z-5 gap-1" onValueChange={(e) => (groupBy = e.value as "all" | "left-to-buy")} value={groupBy}>
            <SegmentedControl.Label>
                {#snippet element(props)}
                    <span {...props} class="text-xs">Group by</span>
                {/snippet}
            </SegmentedControl.Label>
            <SegmentedControl.Control class="h-6.5 gap-1 rounded p-0.5">
                <SegmentedControl.Indicator class="preset-filled-primary-500 rounded" />
                <SegmentedControl.Item value="left-to-buy">
                    <SegmentedControl.ItemText class="text-xs">Left to Buy</SegmentedControl.ItemText>
                    <SegmentedControl.ItemHiddenInput />
                </SegmentedControl.Item>
                <SegmentedControl.Item value="all">
                    <SegmentedControl.ItemText class="text-xs">All</SegmentedControl.ItemText>
                    <SegmentedControl.ItemHiddenInput />
                </SegmentedControl.Item>
            </SegmentedControl.Control>
        </SegmentedControl>
        {#if groupBy === "left-to-buy"}
            <label class="checkbox-label">
                <input class="checkbox" type="checkbox" bind:checked={selectMultiple} />
                <span class="text-sm">Select multiple items</span>
            </label>
            {#if multiSelectMode}
                <button
                    class="btn btn-sm preset-filled hidden md:inline-flex"
                    disabled={claimingMultiple}
                    onclick={claimMultipleItems}
                    type="button"
                >
                    {claimingMultiple ? "Claiming..." : "Claim multiple items"}
                </button>
            {/if}
        {/if}
    </div>
    <ListViewModeChip {isTileView} />
</div>

{#if visibleItems.length === 0}
    <div class="flex flex-col items-center justify-center space-y-4 pt-4">
        <img class="w-3/4 md:w-1/3" alt={$t("a11y.two-people-looking-in-an-empty-box")} src={noWishes} />
        <p class="text-2xl">No items found</p>
    </div>
{:else}
    <div class={["flex flex-col space-y-4", multiSelectMode && "pb-20 md:pb-4"]} data-testid="all-items-container">
        <div
            class={[
                isTileView
                    ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                    : "flex flex-col space-y-4"
            ]}
            data-testid="category"
            transition:scale
        >
            {#each visibleItems as item (item.id + item.listId)}
                <div transition:fade animate:flip={{ duration: 200 }}>
                    {#if multiSelectMode}
                        {@const key = itemKey(item)}
                        <div class="card preset-filled-surface-100-900 inset-ring-surface-200-800 flex flex-col gap-3 p-4 inset-ring">
                            <div class="flex items-start justify-between gap-2">
                                <div class="flex items-start gap-3">
                                    <Image
                                        alt={item.name}
                                        class="bg-surface-300-700 size-16 rounded object-cover"
                                        loading="lazy"
                                        referrerpolicy="no-referrer"
                                        src={getItemImageUrl(item)}
                                    >
                                        <div class="bg-surface-300-700 grid size-16 place-items-center rounded" role="img">
                                            <iconify-icon class="text-xl" icon="ion:gift"></iconify-icon>
                                        </div>
                                    </Image>
                                    <div class="flex flex-col">
                                        <span class="font-semibold">{item.name}</span>
                                        <span class="subtext">{item.user.username}</span>
                                        {#if item.itemPrice || item.price}
                                            <span class="subtext">Desired: {formatPrice(item)}</span>
                                        {/if}
                                        <span class="subtext">Left to buy: {item.remainingQuantity}</span>
                                    </div>
                                </div>
                                <label class="checkbox-label">
                                    <input
                                        class="checkbox"
                                        type="checkbox"
                                        checked={selectedItemKeys.has(key)}
                                        onchange={(e) => toggleSelected(key, e.currentTarget.checked)}
                                    />
                                    <span>Select</span>
                                </label>
                            </div>
                            <div class="flex flex-wrap items-end gap-3">
                                <label class="flex flex-col gap-1">
                                    <span class="subtext">Qty</span>
                                    <input
                                        class="input w-20"
                                        inputmode="numeric"
                                        min="1"
                                        step="1"
                                        type="number"
                                        value={quantityByKey[key] ?? item.remainingQuantity}
                                        oninput={(e) => {
                                            quantityByKey[key] = Number((e.currentTarget as HTMLInputElement).value);
                                        }}
                                    />
                                </label>
                                <label class="flex flex-col gap-1">
                                    <span class="subtext">Price paid</span>
                                    <input
                                        class="input w-44"
                                        inputmode="decimal"
                                        min="0"
                                        step="0.01"
                                        type="number"
                                        value={paidPriceByKey[key] ?? getDesiredPriceBaseValue(item)}
                                        oninput={(e) => {
                                            paidPriceByKey[key] = Number((e.currentTarget as HTMLInputElement).value);
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    {:else}
                        <div class="relative">
                            <ItemCard
                                groupId={data.user.activeGroupId}
                                {isTileView}
                                {item}
                                requireClaimEmail={data.requireClaimEmail}
                                showClaimForOwner={data.showClaimForOwner}
                                showClaimedName={data.showClaimedName}
                                showNameAcrossGroups={data.showNameAcrossGroups}
                                showFor
                                user={data.user}
                            />
                            {#if item.userId === data.user.id}
                                <button
                                    class="btn btn-xs preset-tonal-secondary border-secondary-500 absolute top-3 right-3 border"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        editItem(item.id);
                                    }}
                                >
                                    Edit
                                </button>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
        {#if hasMoreItems}
            <div class="flex justify-center pt-2">
                <button class="btn preset-tonal" disabled={loadingMoreItems} onclick={loadMoreItems} type="button">
                    {loadingMoreItems ? "Loading..." : "Load more items"}
                </button>
            </div>
        {/if}
    </div>
{/if}

{#if multiSelectMode}
    <div class="fixed right-4 bottom-4 left-4 z-10 md:hidden print:hidden">
        <button class="btn preset-filled w-full" disabled={claimingMultiple} onclick={claimMultipleItems} type="button">
            {claimingMultiple ? "Claiming..." : "Claim multiple items"}
        </button>
    </div>
{/if}

<svelte:head>
    <title>{$t("app.all-items")}</title>
</svelte:head>
