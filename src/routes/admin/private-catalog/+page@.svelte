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
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
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
    });

    initListViewPreference(data.initialViewPreference);
    let isTileView = $derived(getListViewPreference() === "tile");
    let users = $derived(items.map((item) => item.user));

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
                users: page.url.searchParams.get("users"),
                privateOnly: true
            });
            if (!response.ok) throw new Error("Unable to load more items");

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
</script>

<div class="flex flex-wrap items-end justify-between gap-2 pb-4 print:hidden">
    <ListFilterChip {users} />
    <ListViewModeChip {isTileView} />
</div>

{#if items.length === 0}
    <div class="flex flex-col items-center justify-center space-y-4 pt-4">
        <img class="w-3/4 md:w-1/3" alt={$t("a11y.two-people-looking-in-an-empty-box")} src={noWishes} />
        <p class="text-2xl">No private list items found</p>
    </div>
{:else}
    <div class="flex flex-col space-y-4" data-testid="private-catalog-container">
        <div
            class={[
                isTileView ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : "flex flex-col space-y-4"
            ]}
            data-testid="category"
            transition:scale
        >
            {#each items as item (item.id + item.listId)}
                <div transition:fade animate:flip={{ duration: 200 }} class="relative">
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

<svelte:head>
    <title>{$t("app.private-catalog")}</title>
</svelte:head>
