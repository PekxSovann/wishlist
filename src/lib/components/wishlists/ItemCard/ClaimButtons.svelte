<script lang="ts">
    import type { InternalItemCardProps } from "./ItemCard.svelte";
    import { getFormatter } from "$lib/i18n";
    import { getClaimedName, shouldShowName } from "../util";
    import ClaimItemModal from "$lib/components/modals/ClaimItemModal.svelte";
    import BuyerNoteModal from "$lib/components/modals/BuyerNoteModal.svelte";
    import { ClaimAPI } from "$lib/api/claims";
    import { toaster } from "$lib/components/toaster";

    type Props = Pick<
        InternalItemCardProps,
        | "item"
        | "user"
        | "showClaimedName"
        | "showNameAcrossGroups"
        | "showClaimForOwner"
        | "onPublicList"
        | "groupId"
        | "requireClaimEmail"
    >;

    let {
        item,
        user,
        showClaimedName = false,
        showNameAcrossGroups = false,
        showClaimForOwner = false,
        onPublicList = false,
        groupId,
        requireClaimEmail
    }: Props = $props();

    const t = getFormatter();

    const userClaim = $derived(item.claims.find((claim) => claim.claimedBy && claim.claimedBy.id === user?.id));
    const userBuyerNote = $derived(item.buyerNotes?.find((buyerNote) => buyerNote.userId === user?.id));
    const isClaimOnList = $derived(userClaim?.listId === item.listId);
    const canClaimAnother = $derived(
        Boolean(
            userClaim &&
                isClaimOnList &&
                item.quantity !== null &&
                item.quantity > 1 &&
                item.remainingQuantity > 0
        )
    );

    const handlePurchased = async (purchased: boolean) => {
        if (userClaim && isClaimOnList) {
            const claimAPI = new ClaimAPI(userClaim?.claimId);
            const resp = await (purchased ? claimAPI.purchase() : claimAPI.unpurchase());
            if (resp.ok) {
                toaster.info({ description: $t("wishes.purchased-toast", { values: { purchased } }) });
                userClaim.purchased = purchased;
            }
        }
    };

    const onBuyerNoteSaved = (note: string | null) => {
        if (!item.buyerNotes) {
            item.buyerNotes = [];
        }
        const existing = item.buyerNotes.find((buyerNote) => buyerNote.userId === user?.id);
        if (note) {
            if (existing) {
                existing.note = note;
            } else if (user?.id && user.username) {
                item.buyerNotes.push({ id: crypto.randomUUID(), userId: user.id, userName: user.username, note });
            }
        } else if (existing) {
            item.buyerNotes = item.buyerNotes.filter((buyerNote) => buyerNote.userId !== user?.id);
        }
    };
</script>

{#if !onPublicList && item.userId === user?.id && !showClaimForOwner}
    <div></div>
{:else if userClaim}
    {#if isClaimOnList}
        <div class="flex flex-wrap items-center gap-1.5">
            <ClaimItemModal claimId={userClaim.claimId} {groupId} {item} {requireClaimEmail} userId={user?.id}>
                {#snippet trigger(props)}
                    <button
                        {...props}
                        class="preset-tonal-secondary inset-ring-secondary-500 btn btn-xs md:btn-sm inset-ring"
                    >
                        <span class="md:hidden">
                            <iconify-icon icon="ion:create-outline"></iconify-icon>
                        </span>
                        <span class="hidden md:inline">
                            {item.quantity === 1 && userClaim.quantity === 1
                                ? $t("wishes.unclaim")
                                : $t("wishes.update-claim")}
                        </span>
                    </button>
                {/snippet}
            </ClaimItemModal>
            {#if canClaimAnother}
                <ClaimItemModal
                    standaloneClaim
                    {groupId}
                    {item}
                    {requireClaimEmail}
                    userId={user?.id}
                >
                    {#snippet trigger(props)}
                        <button {...props} class="btn btn-xs md:btn-sm inset-ring-secondary-500 inset-ring">
                            <span class="md:hidden">+1</span>
                            <span class="hidden md:inline">Claim another one</span>
                        </button>
                    {/snippet}
                </ClaimItemModal>
            {/if}
            <BuyerNoteModal itemId={item.id} note={userBuyerNote?.note} onSaved={onBuyerNoteSaved}>
                {#snippet trigger(props)}
                    <button {...props} class="btn btn-xs md:btn-sm inset-ring-secondary-500 inset-ring">
                        <span class="md:hidden">
                            <iconify-icon icon="ion:document-text-outline"></iconify-icon>
                        </span>
                        <span class="hidden md:inline">{userBuyerNote?.note ? "Edit note" : "Add note"}</span>
                    </button>
                {/snippet}
            </BuyerNoteModal>
            <button
                class={[
                    "btn btn-icon btn-icon-sm",
                    userClaim.purchased && "preset-tonal-secondary inset-ring-secondary-500 inset-ring",
                    !userClaim.purchased && "inset-ring-secondary-500 inset-ring"
                ]}
                aria-label={userClaim.purchased ? $t("a11y.unpurchase") : $t("wishes.purchase")}
                onclick={(e) => {
                    e.stopPropagation();
                    handlePurchased?.(!userClaim.purchased);
                }}
                title={userClaim.purchased ? $t("a11y.unpurchase") : $t("wishes.purchase")}
            >
                <iconify-icon icon={userClaim.purchased ? "ion:bag-check" : "ion:bag"}></iconify-icon>
            </button>
        </div>
    {:else}
        <span class="text-subtle text-wrap">{$t("wishes.claimed-by-you-on-another-list")}</span>
    {/if}
{:else if item.isClaimable && item.userId !== user?.id}
    <div class="flex flex-row items-center gap-x-2">
        <ClaimItemModal {groupId} {item} {requireClaimEmail} userId={user?.id}>
            {#snippet trigger(props)}
                <button {...props} class="btn btn-sm md:btn preset-filled-secondary-300-700">
                    {$t("wishes.claim")}
                </button>
            {/snippet}
        </ClaimItemModal>
        <BuyerNoteModal itemId={item.id} note={userBuyerNote?.note} onSaved={onBuyerNoteSaved}>
            {#snippet trigger(props)}
                <button {...props} class="btn btn-xs md:btn-sm inset-ring-secondary-500 inset-ring">
                    <span class="md:hidden">
                        <iconify-icon icon="ion:document-text-outline"></iconify-icon>
                    </span>
                    <span class="hidden md:inline">{userBuyerNote?.note ? "Edit note" : "Add note"}</span>
                </button>
            {/snippet}
        </BuyerNoteModal>
    </div>
{:else if item.claims.length === 0 || (item.userId === user?.id && item.isClaimable)}
    <div></div>
{:else if item.claims.length === 1 && shouldShowName(item, showClaimedName, showNameAcrossGroups, showClaimForOwner, user, item.claims[0])}
    <span class="text-subtle line-clamp-2 truncate text-wrap">
        {$t("wishes.claimed-by", {
            values: {
                name: getClaimedName(item.claims[0])
            }
        })}
    </span>
{:else if item.claims.length > 1 && shouldShowName(item, showClaimedName, showNameAcrossGroups, showClaimForOwner, user)}
    <span class="text-subtle line-clamp-2 truncate text-wrap">{$t("wishes.claimed-by-multiple-users")}</span>
{:else}
    <span class="text-subtle line-clamp-2 truncate text-wrap">{$t("wishes.claimed")}</span>
{/if}
