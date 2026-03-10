<script lang="ts">
    import BaseModal, { type BaseModalProps } from "./BaseModal.svelte";
    import { getFormatter } from "$lib/i18n";
    import { ItemAPI } from "$lib/api/items";
    import { toaster } from "../toaster";

    interface Props extends Omit<BaseModalProps, "title" | "description" | "actions" | "children" | "element"> {
        itemId: string;
        note?: string;
        onSaved?: (note: string | null) => void;
    }

    let { itemId, note, onSaved, trigger: inputTrigger, ...rest }: Props = $props();
    const t = getFormatter();

    let open = $state(false);
    let value = $state("");
    let saving = $state(false);

    function openModal(e: MouseEvent) {
        e.stopPropagation();
        value = note ?? "";
        open = true;
    }

    async function submit() {
        if (saving) return;
        saving = true;
        const payload = value.trim() || null;
        const api = new ItemAPI(itemId);
        const resp = await api.updateBuyerNote(payload);
        saving = false;

        if (!resp.ok) {
            toaster.error({ description: t("general.oops") });
            return;
        }

        onSaved?.(payload);
        open = false;
        toaster.info({ description: t("general.save") });
    }
</script>

<BaseModal
    description={$t("wishes.before-you-can-claim-the-item-we-just-need-one-thing-from-you")}
    onOpenChange={(e) => (open = e.open)}
    {open}
    title={$t("wishes.notes")}
    {...rest}
>
    {#snippet trigger(props)}
        {@render inputTrigger({ ...props, onclick: openModal })}
    {/snippet}

    <label class="w-full">
        <span>{$t("wishes.notes")}</span>
        <textarea
            class="input min-h-24 w-full"
            maxlength="5000"
            placeholder={$t("wishes.note-placeholder")}
            bind:value={value}
        ></textarea>
    </label>

    {#snippet actions({ neutralStyle, positiveStyle })}
        <button class={neutralStyle} onclick={() => (open = false)} type="button">
            {$t("general.cancel")}
        </button>
        <button class={positiveStyle} disabled={saving} onclick={submit} type="button">
            {saving ? $t("general.loading") : $t("general.save")}
        </button>
    {/snippet}
</BaseModal>
