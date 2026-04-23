<script lang="ts">
    import type { PageProps } from "./$types";
    import ItemCard from "$lib/components/wishlists/ItemCard/ItemCard.svelte";
    import ClaimFilterChip from "$lib/components/wishlists/chips/ClaimFilter.svelte";
    import { goto, invalidate, invalidateAll } from "$app/navigation";
    import { page } from "$app/state";
    import { onMount } from "svelte";
    import { flip } from "svelte/animate";
    import { quintOut } from "svelte/easing";
    import { crossfade } from "svelte/transition";
    import { isInstalled } from "$lib/stores/is-installed";
    import empty from "$lib/assets/no_wishes.svg";
    import SortBy from "$lib/components/wishlists/chips/SortBy.svelte";
    import { hash, hashItems, viewedItems } from "$lib/stores/viewed-items";
    import { getListViewPreference, initListViewPreference } from "$lib/stores/list-view-preference.svelte";
    import { ListAPI } from "$lib/api/lists";
    import TokenCopy from "$lib/components/TokenCopy.svelte";
    import { dragHandleZone, type DndZoneAttributes, type Item, type Options } from "svelte-dnd-action";
    import ReorderChip from "$lib/components/wishlists/chips/ReorderChip.svelte";
    import ManageListChip from "$lib/components/wishlists/chips/ManageListChip.svelte";
    import ListViewModeChip from "$lib/components/wishlists/chips/ListViewModeChip.svelte";
    import type { ItemOnListDTO } from "$lib/dtos/item-dto";
    import { ItemCreateHandler, ItemDeleteHandler, ItemsUpdateHandler, ItemUpdateHandler } from "$lib/events";
    import { getFormatter } from "$lib/i18n";
    import Markdown from "$lib/components/Markdown.svelte";
    import ListStatistics from "$lib/components/wishlists/ListStatistics.svelte";
    import type { ActionReturn } from "svelte/action";
    import { toaster } from "$lib/components/toaster";
    import ConfirmModal from "$lib/components/modals/ConfirmModal.svelte";

    const { data }: PageProps = $props();
    const t = getFormatter();

    // svelte-ignore state_referenced_locally
    let allItems: ItemOnListDTO[] = $state(data.list.items);
    let reordering = $state(false);
    let selectMode = $state(false);
    let selectedItemIds = $state(new Set<string>());
    let targetListId = $state("");
    let publicListUrl: URL | undefined = $state();
    let approvals = $derived(allItems.filter((item) => !item.approved));
    let items = $derived(allItems.filter((item) => item.approved));
    let selectedItems = $derived(items.filter((item) => selectedItemIds.has(item.id)));
    let listName = $derived.by(() => {
        if (data.list.name) {
            return data.list.name;
        } else if (data.list.owner.isMe) {
            return $t("wishes.my-wishes");
        } else {
            return $t("wishes.wishes-for", { values: { listOwner: data.list.owner.name } });
        }
    });
    let hideDescription = $state(false);

    // Initialize from server data (cookie) to prevent flicker
    // This value comes from the server, so SSR renders the correct view
    // svelte-ignore state_referenced_locally
    initListViewPreference(data.initialViewPreference);
    let isTileView = $derived(getListViewPreference() === "tile");

    const flipDurationMs = 200;
    const listAPI = $derived(new ListAPI(data.list.id));

    const [send, receive] = crossfade({
        duration: (d) => Math.sqrt(d * 200),

        fallback(node) {
            const style = getComputedStyle(node);
            const transform = style.transform === "none" ? "" : style.transform;

            return {
                duration: 600,
                easing: quintOut,
                css: (t) => `
					transform: ${transform} scale(${t});
					opacity: ${t}
				`
            };
        }
    });

    onMount(async () => {
        await updateHash();
    });

    onMount(() => {
        const eventSource = subscribeToEvents();
        return () => eventSource.close();
    });

    $effect(() => {
        allItems = data.list.items;
    });

    $effect(() => {
        const validSelectedItemIds = [...selectedItemIds].filter((itemId) => items.some((item) => item.id === itemId));
        if (validSelectedItemIds.length !== selectedItemIds.size) {
            selectedItemIds = new Set(validSelectedItemIds);
        }
    });

    const updateDisplayOrder = (items: ItemOnListDTO[]) => {
        items.forEach((it, idx) => (it.displayOrder = idx));
    };

    const groupItems = (items: ItemOnListDTO[]) => {
        // When on own list, don't separate out claimed vs un-claimed
        if (data.list.owner.isMe) {
            return [items, []];
        }
        return items.reduce(
            (g, v) => {
                const userHasClaimed = v.claims.find((c) => data.user?.id && c.claimedBy?.id === data.user.id);
                if (v.isClaimable && !userHasClaimed) {
                    g[0].push(v);
                } else {
                    g[1].push(v);
                }
                return g;
            },
            [[], []] as ItemOnListDTO[][]
        );
    };

    const updateHash = async () => {
        const userHash = await hash(data.list.id);
        viewedItems.current[userHash] = await hashItems(allItems);
    };

    const subscribeToEvents = () => {
        const eventSource = new EventSource(`${page.url.pathname}/events`);
        ItemUpdateHandler.listen(eventSource, (data) => {
            updateItem(data);
            updateHash();
        });
        ItemCreateHandler.listen(eventSource, (data) => {
            addItem(data);
            updateHash();
        });
        ItemDeleteHandler.listen(eventSource, (data) => {
            removeItem(data);
            updateHash();
        });
        ItemsUpdateHandler.listen(eventSource, () => {
            if (!data.list.owner.isMe) {
                invalidate("data:items");
                updateHash();
            }
        });
        return eventSource;
    };

    const updateItem = (updatedItem: ItemOnListDTO) => {
        // for when an item gets approved
        if (!allItems.find((item) => item.id === updatedItem.id)) {
            addItem(updatedItem);
        }
        allItems = allItems.map((item) => {
            if (item.id === updatedItem.id) {
                return { ...item, ...updatedItem };
            }
            return item;
        });
    };

    const removeItem = (removedItem: { id: string }) => {
        allItems = allItems.filter((item) => item.id !== removedItem.id);
    };

    const addItem = (addedItem: ItemOnListDTO) => {
        if (!(addedItem.approved || data.list.owner.isMe)) {
            return;
        }
        allItems = [...allItems, addedItem];
    };

    const getOrCreatePublicList = async () => {
        if (!data.list.public) {
            const listApi = new ListAPI(data.list.id);
            const resp = await listApi.makePublic();
            if (!resp.ok) {
                const description = await resp.text();
                toaster.error({ description });
                return;
            }
        }
        publicListUrl = new URL(`/lists/${data.list.id}`, window.location as unknown as URL);
    };

    const makeListPrivate = async () => {
        const response = await listAPI.makePrivate();
        if (!response.ok) {
            const description = await response.text();
            toaster.error({ description });
            return;
        }

        toaster.info({ description: $t("wishes.list-was-made-private") });
        await invalidateAll();
    };

    const makeListPublic = async () => {
        const response = await listAPI.makePublic();
        if (!response.ok) {
            const description = await response.text();
            toaster.error({ description });
            return;
        }

        toaster.info({ description: $t("wishes.list-was-made-public") });
        await invalidateAll();
    };

    const toggleSelectMode = () => {
        selectMode = !selectMode;
        reordering = false;
        if (!selectMode) {
            selectedItemIds = new Set();
            targetListId = "";
        }
    };

    const toggleItemSelection = (itemId: string) => {
        const next = new Set(selectedItemIds);
        if (next.has(itemId)) {
            next.delete(itemId);
        } else {
            next.add(itemId);
        }
        selectedItemIds = next;
    };

    const setItemSelection = (itemId: string, selected: boolean) => {
        const next = new Set(selectedItemIds);
        if (selected) {
            next.add(itemId);
        } else {
            next.delete(itemId);
        }
        selectedItemIds = next;
    };

    const selectAllItems = () => {
        selectedItemIds = new Set(items.map((item) => item.id));
    };

    const clearSelection = () => {
        selectedItemIds = new Set();
    };

    const bulkDeleteSelected = async () => {
        const itemIds = [...selectedItemIds];
        if (itemIds.length === 0) return;

        const response = await listAPI.bulkDeleteItems(itemIds);
        if (!response.ok) {
            const description = await response.text();
            toaster.error({ description });
            return;
        }

        toaster.info({ description: $t("wishes.selected-items-deleted", { values: { count: itemIds.length } }) });
        selectedItemIds = new Set();
        selectMode = false;
        await invalidateAll();
    };

    const bulkMoveSelected = async () => {
        const itemIds = [...selectedItemIds];
        if (itemIds.length === 0 || !targetListId) return;

        const response = await listAPI.bulkMoveItems(itemIds, targetListId);
        if (!response.ok) {
            const description = await response.text();
            toaster.error({ description });
            return;
        }

        toaster.info({ description: $t("wishes.selected-items-moved", { values: { count: itemIds.length } }) });
        selectedItemIds = new Set();
        targetListId = "";
        selectMode = false;
        await invalidateAll();
    };

    // custom dnd action to remove the aria disabled flag
    function dndZone<T extends Item>(
        node: HTMLElement,
        options: Options<T>
    ): ActionReturn<Options<T>, DndZoneAttributes<T>> {
        const zone = dragHandleZone(node, options);
        node.setAttribute("aria-disabled", "false");
        return {
            update(newOptions) {
                zone.update?.(newOptions);
                node.setAttribute("aria-disabled", "false");
            },
            destroy: zone.destroy
        };
    }
    const handleDnd = (e: CustomEvent) => {
        allItems = e.detail.items;
        updateDisplayOrder(allItems);
    };
    const swap = (arr: ItemOnListDTO[], a: number, b: number) => {
        const swapped = arr.with(a, arr[b]).with(b, arr[a]);
        updateDisplayOrder(swapped);
        return swapped;
    };
    const handleIncreasePriority = (itemId: string) => {
        const itemIdx = allItems.findIndex((item) => item.id === itemId);
        if (itemIdx > 0) {
            allItems = swap(allItems, itemIdx, itemIdx - 1);
        }
    };
    const handleDecreasePriority = (itemId: string) => {
        const itemIdx = allItems.findIndex((item) => item.id === itemId);
        if (itemIdx < allItems.length - 1) {
            allItems = swap(allItems, itemIdx, itemIdx + 1);
        }
    };
    const handlePriorityInput = (item: ItemOnListDTO, idxString: string) => {
        const targetIdx = Number.parseInt(idxString) - 1;
        const currentIdx = allItems.findIndex((it) => it.id === item.id);

        if (Number.isNaN(targetIdx) || targetIdx < 0 || targetIdx > allItems.length - 1) {
            toaster.error({
                description: $t("errors.display-order-invalid", { values: { min: 1, max: allItems.length } })
            });
            if (item.displayOrder) {
                const el = document.getElementById(`${item.id}-displayOrder`) as HTMLInputElement;
                el.value = (item.displayOrder + 1).toString();
            }
            return;
        }
        if (currentIdx !== targetIdx) {
            const resortedItems: ItemOnListDTO[] = [];
            let displayOrder = 0;
            for (let i = 0; i < allItems.length; i++) {
                if (i === currentIdx) {
                    continue;
                }
                if (i === targetIdx) {
                    if (targetIdx < currentIdx) {
                        resortedItems.push(allItems[currentIdx]);
                        resortedItems.push(allItems[i]);
                    } else {
                        resortedItems.push(allItems[i]);
                        resortedItems.push(allItems[currentIdx]);
                    }

                    resortedItems.at(-2)!.displayOrder = displayOrder++;
                } else {
                    resortedItems.push(allItems[i]);
                }
                resortedItems.at(-1)!.displayOrder = displayOrder++;
            }
            allItems = resortedItems;
        }
    };
    const handleReorderFinalize = async () => {
        reordering = false;
        const displayOrderUpdate = allItems.map((item, idx) => ({
            itemId: item.id,
            displayOrder: idx
        }));
        const response = await listAPI.updateItems(displayOrderUpdate);
        if (!response.ok) {
            toaster.error({ description: $t("wishes.unable-to-update-item-ordering") });
            allItems = data.list.items;
        }
    };
</script>

{#if data.list.description}
    <div class="w-full pb-4">
        {#if !hideDescription}
            <Markdown source={data.list.description} />
        {/if}
        <button
            class="text-primary-700 dark:text-primary-500 text-sm print:hidden"
            onclick={() => (hideDescription = !hideDescription)}
        >
            {hideDescription ? $t("wishes.show-description") : $t("wishes.hide-description")}
        </button>
    </div>
{/if}

<!-- chips -->
<div class="flex flex-wrap items-end justify-between gap-2 pb-4 print:hidden">
    <div class="flex flex-row flex-wrap items-end gap-2">
        {#if !data.list.owner.isMe}
            <ClaimFilterChip />
        {/if}
        <SortBy />
    </div>
    <div class="flex flex-row flex-wrap items-end gap-2">
        {#if !reordering}
            <ListViewModeChip {isTileView} />
        {/if}
        {#if data.list.owner.isMe || data.list.isManager}
            {#if data.list.owner.isMe}
                <button
                    class={["chip", selectMode ? "preset-tonal-secondary border-secondary-500 border" : "preset-filled-primary-500"]}
                    onclick={toggleSelectMode}
                    type="button"
                >
                    <iconify-icon icon="ion:checkbox"></iconify-icon>
                    <span>{selectMode ? $t("general.cancel") : $t("wishes.select")}</span>
                </button>
            {/if}
            {#if !selectMode}
                <ReorderChip onFinalize={handleReorderFinalize} bind:reordering />
                <ManageListChip onclick={() => goto(`${new URL(page.url).pathname}/manage`)} />
            {/if}
        {/if}
        {#if data.canMakePrivate}
            <button class="preset-filled-primary-500 chip" onclick={makeListPrivate} type="button">
                <iconify-icon icon="ion:lock-closed"></iconify-icon>
                <span>{$t("wishes.make-private")}</span>
            </button>
        {/if}
        {#if data.canMakePublic}
            <button class="preset-filled-primary-500 chip" onclick={makeListPublic} type="button">
                <iconify-icon icon="ion:lock-open"></iconify-icon>
                <span>{$t("wishes.make-public")}</span>
            </button>
        {/if}
    </div>
</div>

{#if selectMode}
    <div class="preset-tonal-surface inset-ring-surface-500 mb-4 flex flex-wrap items-center gap-2 rounded p-2 inset-ring print:hidden">
        <span class="text-sm font-medium">
            {$t("wishes.selected-items-count", { values: { count: selectedItemIds.size } })}
        </span>
        <button class="btn btn-sm preset-tonal" onclick={selectAllItems} type="button">
            {$t("general.select-all")}
        </button>
        <button class="btn btn-sm preset-tonal" disabled={selectedItemIds.size === 0} onclick={clearSelection} type="button">
            {$t("wishes.clear-selection")}
        </button>
        <select class="select w-full sm:w-56" bind:value={targetListId} aria-label={$t("wishes.move-to-list")}>
            <option value="">{$t("wishes.move-to-list")}</option>
            {#each data.availableLists as list (list.id)}
                <option value={list.id}>{list.name || $t("wishes.my-wishes")}</option>
            {/each}
        </select>
        <button
            class="btn btn-sm preset-filled-primary-500"
            disabled={selectedItemIds.size === 0 || !targetListId}
            onclick={bulkMoveSelected}
            type="button"
        >
            <iconify-icon icon="ion:arrow-forward"></iconify-icon>
            <span>{$t("wishes.move-selected")}</span>
        </button>
        <ConfirmModal
            description={$t("wishes.delete-selected-items-confirmation", { values: { count: selectedItemIds.size } })}
            onConfirm={bulkDeleteSelected}
        >
            {#snippet trigger(triggerProps)}
                <button
                    {...triggerProps}
                    class="btn btn-sm preset-tonal-error border-error-500 border"
                    disabled={selectedItemIds.size === 0}
                    type="button"
                >
                    <iconify-icon icon="ion:trash"></iconify-icon>
                    <span>{$t("wishes.delete-selected")}</span>
                </button>
            {/snippet}
        </ConfirmModal>
    </div>
{/if}

<div class="flex flex-wrap-reverse items-start justify-between gap-2 pb-4 print:hidden">
    <ListStatistics {items} />
    {#if data.list.owner.isMe || data.list.isManager}
        <div class="flex flex-row gap-x-2">
            {#if (data.list.owner.isMe || data.list.isManager) && (data.listMode === "registry" || data.list.public)}
                {#if publicListUrl}
                    <TokenCopy btnStyle="btn-xs" url={publicListUrl?.href}>
                        <span class="text-sm">{$t("wishes.public-url")}</span>
                    </TokenCopy>
                {:else}
                    <button class="btn btn-xs inset-ring-surface-500 inset-ring" onclick={getOrCreatePublicList}>
                        {$t("wishes.share")}
                    </button>
                {/if}
            {/if}
        </div>
    {/if}
</div>

{#if (data.list.owner.isMe || data.list.isManager) && approvals.length > 0}
    <div class="flex flex-col space-y-4 pb-4 print:hidden">
        <h2 class="h2">{$t("wishes.approvals")}</h2>
        <div
            class={isTileView
                ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                : "flex flex-col space-y-4"}
            data-testid="approvals-container"
        >
            {#each approvals as item (item.id)}
                <div in:receive={{ key: item.id }} out:send|local={{ key: item.id }} animate:flip={{ duration: 200 }}>
                    <ItemCard
                        groupId={data.list.groupId}
                        {isTileView}
                        {item}
                        onPublicList={!data.loggedInUser && data.list.public}
                        requireClaimEmail={data.requireClaimEmail}
                        showClaimForOwner={data.showClaimForOwner}
                        showClaimedName={data.showClaimedName}
                        showNameAcrossGroups={data.showNameAcrossGroups}
                        user={data.loggedInUser}
                        userCanManage={data.list.isManager}
                    />
                </div>
            {/each}
        </div>
        <hr class="hr" />
    </div>
{/if}

{#if items.length === 0}
    <div class="flex flex-col items-center justify-center space-y-4 pt-2">
        <img class="w-3/4 md:w-1/3" alt={$t("a11y.two-people-looking-in-an-empty-box")} src={empty} />
        <p class="text-2xl">{$t("wishes.no-wishes-yet")}</p>
    </div>
{:else}
    <!-- items -->
    <div
        class={isTileView
            ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
            : "flex flex-col space-y-4"}
        data-testid="items-container"
        onconsider={handleDnd}
        onfinalize={handleDnd}
        use:dndZone={{
            items,
            flipDurationMs,
            dragDisabled: false,
            dropTargetClasses: ["preset-outlined-primary-500"],
            dropTargetStyle: {}
        }}
    >
        <!-- Workaround for svelte-dnd not playing nicely with transitions -->
        {#if reordering}
            {#each items as item (item.id)}
                <div animate:flip={{ duration: flipDurationMs }}>
                    <ItemCard
                        groupId={data.list.groupId}
                        {isTileView}
                        {item}
                        onDecreasePriority={handleDecreasePriority}
                        onIncreasePriority={handleIncreasePriority}
                        onPriorityChange={handlePriorityInput}
                        onPublicList={!data.loggedInUser && data.list.public}
                        reorderActions
                        requireClaimEmail={data.requireClaimEmail}
                        showClaimForOwner={data.showClaimForOwner}
                        showClaimedName={data.showClaimedName}
                        showNameAcrossGroups={data.showNameAcrossGroups}
                        user={data.loggedInUser}
                        userCanManage={data.list.isManager}
                    />
                </div>
            {/each}
        {:else}
            {#each groupItems(items) as groupedItems}
                {#each groupedItems as item (item.id)}
                    <div
                        class="relative"
                        in:receive={{ key: item.id }}
                        out:send|local={{ key: item.id }}
                        animate:flip={{ duration: flipDurationMs }}
                    >
                        {#if selectMode}
                            <input
                                class="checkbox preset-filled-primary-500 absolute top-3 right-3 z-10"
                                aria-label={$t("wishes.select-item")}
                                checked={selectedItemIds.has(item.id)}
                                onchange={(event) => {
                                    event.stopPropagation();
                                    setItemSelection(item.id, event.currentTarget.checked);
                                }}
                                onclick={(event) => event.stopPropagation()}
                                type="checkbox"
                            />
                        {/if}
                        <ItemCard
                            groupId={data.list.groupId}
                            {isTileView}
                            {item}
                            onPublicList={!data.loggedInUser && data.list.public}
                            requireClaimEmail={data.requireClaimEmail}
                            showClaimForOwner={data.showClaimForOwner}
                            showClaimedName={data.showClaimedName}
                            showNameAcrossGroups={data.showNameAcrossGroups}
                            user={data.loggedInUser}
                            userCanManage={data.list.isManager}
                            selectable={selectMode}
                            selected={selectedItemIds.has(item.id)}
                            onSelect={toggleItemSelection}
                        />
                    </div>
                {/each}
            {/each}
        {/if}
    </div>

    <!-- spacer -->
    <footer class="print:hidden">
        <div class="h-16"></div>
    </footer>
{/if}

<!-- Add Item button -->
{#if data.loggedInUser && (data.list.owner.isMe || data.suggestionsEnabled)}
    <button
        class="preset-tonal btn btn-icon btn-icon-sm md:btn-icon-base inset-ring-surface-200-800 fixed right-4 z-30 h-16 w-16 p-0! inset-ring md:right-10 md:bottom-10 md:h-20 md:w-20 print:hidden"
        class:bottom-24={$isInstalled}
        class:bottom-4={!$isInstalled}
        aria-label="add item"
        onclick={() => goto(`${page.url.pathname}/create-item?redirectTo=${page.url.pathname}`, { replaceState: true })}
    >
        <iconify-icon class="text-xl md:text-2xl" icon="ion:add"></iconify-icon>
    </button>
{/if}

<svelte:head>
    <title>{listName}</title>
</svelte:head>
