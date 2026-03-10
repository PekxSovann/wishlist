<script lang="ts">
    import { invalidateAll } from "$app/navigation";
    import { SystemUsersAPI } from "$lib/api/users";
    import type { ItemOnListDTO } from "$lib/dtos/item-dto";
    import { ListItemAPI } from "$lib/api/lists";
    import { ClaimAPI } from "$lib/api/claims";
    import { getFormatter } from "$lib/i18n";
    import { toaster } from "../toaster";
    import BaseModal, { type BaseModalProps } from "./BaseModal.svelte";
    import { Dialog } from "@skeletonlabs/skeleton-svelte";
    import { formatPlainNumber, formatPrice, getPriceValue } from "$lib/price-formatter";

    interface Props extends Omit<BaseModalProps, "title" | "description" | "actions" | "children" | "element"> {
        item: ItemOnListDTO;
        userId: string | undefined;
        groupId: string;
        requireClaimEmail: boolean;
        defaultQuantity?: number;
        standaloneClaim?: boolean;
        claimId?: string;
        onSuccess?: VoidFunction;
        onFailure?: VoidFunction;
    }

    let {
        item,
        userId,
        groupId,
        claimId,
        requireClaimEmail,
        defaultQuantity,
        standaloneClaim = false,
        onSuccess,
        onFailure,
        trigger: inputTrigger,
        ...rest
    }: Props = $props();

    const t = getFormatter();
    let open = $state(false);

    const claim = $derived(item.claims.find((claim) => claim.claimId === claimId));

    let username: string | undefined = $state();
    let name: string | undefined = $state();
    let quantity = $state(1);
    let error: string | undefined = $state();
    const desiredPrice = $derived(getPriceValue(item));
    const currentClaimPrice = $derived.by(() => {
        if (!claim?.claimedPrice) {
            return desiredPrice;
        }
        return claim.claimedPrice.value;
    });
    let claimPrice = $state<number | null>(desiredPrice);
    let priceMismatchConfirmOpen = $state(false);
    let skipMismatchCheck = $state(false);
    let confirmedMismatchPrice = $state<number | null>(null);
    let submitting = $state(false);
    const claimCurrency = $derived(item.itemPrice?.currency ?? null);
    const previewTotal = $derived.by(() => {
        if (claimPrice === null || !claimCurrency || !Number.isFinite(quantity)) {
            return null;
        }
        return claimPrice * quantity;
    });
    const currentTotal = $derived.by(() => {
        if (!claim?.claimedPrice || !Number.isFinite(claim.quantity)) {
            return null;
        }
        return claim.claimedPrice.value * claim.quantity;
    });

    $effect(() => {
        if (
            confirmedMismatchPrice !== null &&
            claimPrice !== null &&
            Math.abs(confirmedMismatchPrice - claimPrice) > Number.EPSILON
        ) {
            confirmedMismatchPrice = null;
        }
    });

    $effect(() => {
        quantity = claim?.quantity || 1;
    });

    async function handleTrigger(e: MouseEvent) {
        e.stopPropagation();
        claimPrice = currentClaimPrice;
        if (standaloneClaim) {
            quantity = 1;
        } else if (defaultQuantity !== undefined) {
            const maxQuantity = item.remainingQuantity + (claim?.quantity || 0);
            quantity = Math.max(0, Math.min(defaultQuantity, maxQuantity));
        } else {
            quantity = claim?.quantity || 1;
        }
        skipMismatchCheck = false;
        confirmedMismatchPrice = null;
        if (!userId) {
            open = true;
            return;
        }
        open = true;
    }

    async function onUnclaim() {
        quantity = 0;
        return onFormSubmit();
    }

    async function onFormSubmit() {
        if (submitting) {
            return;
        }
        error = undefined;

        const effectiveClaimPrice = claimPrice ?? desiredPrice;

        if (!Number.isFinite(quantity) || quantity < 0) {
            error = $t("general.oops");
            return;
        }
        if (effectiveClaimPrice !== null && (!Number.isFinite(effectiveClaimPrice) || effectiveClaimPrice < 0)) {
            error = $t("general.oops");
            return;
        }

        const mismatchAlreadyConfirmed =
            effectiveClaimPrice !== null &&
            confirmedMismatchPrice !== null &&
            Math.abs(effectiveClaimPrice - confirmedMismatchPrice) <= Number.EPSILON;
        if (
            !skipMismatchCheck &&
            !mismatchAlreadyConfirmed &&
            desiredPrice !== null &&
            effectiveClaimPrice !== null &&
            Math.abs(effectiveClaimPrice - desiredPrice) > Number.EPSILON
        ) {
            priceMismatchConfirmOpen = true;
            return;
        }
        skipMismatchCheck = false;

        if (quantity > item.remainingQuantity + (claim?.quantity || 0)) {
            error = $t("errors.could-not-claim-quantity-items", {
                values: { quantity, availableQuantity: item.remainingQuantity }
            });
            return;
        }

        try {
            submitting = true;
            if (userId) {
                if (claim) {
                    await handleUpdateClaim(claim.claimId);
                } else {
                    await handleUserClaim(userId);
                }
            } else {
                await handlePublicClaim();
            }
        } catch (err) {
            console.error("Claim submit failed", err);
            onFailure?.();
            const description = err instanceof Error && err.message ? err.message : $t("general.oops");
            toaster.error({ description });
        } finally {
            submitting = false;
        }
    }

    async function getResponseError(resp: Response) {
        try {
            const data = await resp.clone().json();
            if (typeof data?.message === "string" && data.message.length > 0) return data.message;
        } catch {
            // Ignore JSON parse errors, try text next
        }
        const text = await resp.text();
        return text || $t("general.oops");
    }

    function getClaimPricePayload() {
        const rawCurrency = item.itemPrice?.currency ?? claim?.claimedPrice?.currency;
        const rawPrice = claimPrice ?? currentClaimPrice ?? desiredPrice;
        if (rawPrice === null || !rawCurrency) {
            return { claimedPrice: null, claimedCurrency: null };
        }

        const claimedCurrency = rawCurrency.toUpperCase();
        try {
            const claimedPrice = Math.round(rawPrice);
            return { claimedPrice, claimedCurrency };
        } catch (err) {
            console.error("Failed to build claim price payload", err);
            return { claimedPrice: null, claimedCurrency: null };
        }
    }

    async function handleUpdateClaim(claimId: string) {
        const claimAPI = new ClaimAPI(claimId);
        const { claimedPrice, claimedCurrency } = getClaimPricePayload();
        const resp = await claimAPI.updateQuantity(quantity, claimedPrice, claimedCurrency);
        if (resp.ok) {
            if (claim) {
                claim.quantity = quantity;
                if (claimedPrice !== null && claimedCurrency) {
                    claim.claimedPrice = { value: claimedPrice, currency: claimedCurrency };
                } else {
                    claim.claimedPrice = undefined;
                }
            }
            let description;
            if (quantity === 0) {
                description = $t("wishes.claimed-item", { values: { claimed: false } });
            } else {
                description = $t("wishes.updated-claim");
            }
            await closeAndToast(description);
        } else {
            onFailure?.();
            toaster.error({ description: await getResponseError(resp) });
        }
    }

    async function handleUserClaim(userId: string) {
        const listItemAPI = new ListItemAPI(item.listId, item.id);
        const { claimedPrice, claimedCurrency } = getClaimPricePayload();
        const resp = await listItemAPI.claim(userId, quantity, claimedPrice, claimedCurrency);

        if (resp.ok) {
            await closeAndToast($t("wishes.claimed-item", { values: { claimed: true } }));
        } else {
            onFailure?.();
            toaster.error({ description: await getResponseError(resp) });
        }
    }

    async function handlePublicClaim() {
        const systemUsersAPI = new SystemUsersAPI(groupId);
        const userResp = await systemUsersAPI.create(username, name);
        if (!userResp.ok) {
            const responseData = await userResp.json();

            onFailure?.();
            toaster.error({ description: responseData.message || $t("general.oops") });
            return;
        }
        const { id: publicUserId } = await userResp.json();

        const listItemAPI = new ListItemAPI(item.listId, item.id);
        const { claimedPrice, claimedCurrency } = getClaimPricePayload();
        const resp = await listItemAPI.claimPublic(publicUserId, quantity, claimedPrice, claimedCurrency);

        if (resp.ok) {
            await closeAndToast($t("wishes.claimed-item", { values: { claimed: true } }));
        } else {
            onFailure?.();
            toaster.error({ description: await getResponseError(resp) });
        }
    }

    async function closeAndToast(description: string) {
        open = false;
        priceMismatchConfirmOpen = false;
        await invalidateAll();
        // wait for transition to finish before triggering toast
        setTimeout(() => toaster.info({ description }), 250);
        onSuccess?.();
    }
</script>

<BaseModal
    description={$t("wishes.before-you-can-claim-the-item-we-just-need-one-thing-from-you")}
    onOpenChange={(e) => (open = e.open)}
    {open}
    title={$t("wishes.claim-details")}
    {...rest}
>
    {#snippet trigger(props)}
        {@render inputTrigger({ ...props, onclick: handleTrigger })}
    {/snippet}

    {#if !userId}
        <span>{$t("wishes.before-you-can-claim-the-item-we-just-need-one-thing-from-you")}</span>
        <label class="w-fit">
            <span>{$t("general.name-optional")}</span>
            <div class="input-group grid-cols-[auto_1fr_auto]">
                <div class="ig-cell preset-tonal">
                    <iconify-icon class="text-lg" icon="ion:person"></iconify-icon>
                </div>
                <input class="ig-input" type="text" bind:value={name} />
            </div>
        </label>

        {#if requireClaimEmail}
            <label class="w-fit">
                <span>{$t("auth.email")}</span>
                <div class="input-group grid-cols-[auto_1fr_auto]">
                    <div class="ig-cell preset-tonal">
                        <iconify-icon class="text-lg" icon="ion:person"></iconify-icon>
                    </div>
                    <input class="ig-input" required type="email" bind:value={username} />
                </div>
            </label>
        {/if}
    {/if}

    {#if (item.remainingQuantity > 1 || claim) && !standaloneClaim}
        <div class="flex flex-col gap-1">
            <label class="w-fit">
                <span>{$t("wishes.enter-the-quantity-to-claim")}</span>
                <input
                    class={["input", error && "input-invalid"]}
                    inputmode="numeric"
                    max={item.remainingQuantity + (claim?.quantity || 0)}
                    min={claim ? 0 : 1}
                    required
                    step="1"
                    type="number"
                    bind:value={quantity}
                />
            </label>
            {#if error}
                <span class="text-invalid">{error}</span>
            {/if}
            {#if claim}
                <span class="subtext">
                    {$t("wishes.claimed-info-text", {
                        values: { claimedQuantity: claim.quantity }
                    })}
                    {#if item.quantity}
                        {$t("wishes.additional-items-requested", {
                            values: { remainingQuantity: item.remainingQuantity }
                        })}
                    {/if}
                </span>
            {/if}
        </div>
    {/if}

    {#if desiredPrice !== null}
        <label class="w-fit">
            <span>{$t("wishes.price")}</span>
            <input class="input" inputmode="decimal" min="0" step="0.01" type="number" bind:value={claimPrice} />
            <span class="subtext">Desired price: {formatPrice(item)}</span>
                <span class="subtext">
                    Preview total:
                    {#if previewTotal !== null && claimCurrency}
                        {formatPlainNumber(previewTotal)} {claimCurrency}
                    {:else}
                        -
                    {/if}
                </span>
                <span class="subtext">
                    Current total owed:
                    {#if currentTotal !== null && claim?.claimedPrice}
                        {formatPlainNumber(currentTotal)} {claim.claimedPrice.currency}
                    {:else}
                        -
                    {/if}
                </span>
        </label>
    {/if}

    {#snippet actions({ neutralStyle, negativeStyle, positiveStyle })}
        <Dialog.CloseTrigger class={neutralStyle} type="button">
            {$t("general.cancel")}
        </Dialog.CloseTrigger>

        <div class="flex flex-wrap gap-2">
            {#if claim}
                <button class={negativeStyle} onclick={() => onUnclaim()} type="button">
                    {$t("wishes.unclaim")}
                </button>
            {/if}
            <button class={positiveStyle} disabled={submitting} onclick={() => onFormSubmit()} type="button">
                {$t("wishes.claim")}
            </button>
        </div>
    {/snippet}
</BaseModal>

<BaseModal
    description="The price you entered is different from the desired price. Continue with this claim price?"
    onOpenChange={(e) => (priceMismatchConfirmOpen = e.open)}
    open={priceMismatchConfirmOpen}
    title={$t("general.please-confirm")}
>
    {#snippet trigger(props)}
        <button {...props} class="hidden" aria-hidden="true" tabindex="-1" type="button"></button>
    {/snippet}

    {#snippet actions({ neutralStyle, positiveStyle })}
        <Dialog.CloseTrigger class={neutralStyle} type="button">
            {$t("general.cancel")}
        </Dialog.CloseTrigger>
        <button
            class={positiveStyle}
            onclick={async () => {
                priceMismatchConfirmOpen = false;
                confirmedMismatchPrice = claimPrice;
                skipMismatchCheck = true;
                await onFormSubmit();
            }}
            type="button"
        >
            {$t("general.confirm")}
        </button>
    {/snippet}
</BaseModal>
