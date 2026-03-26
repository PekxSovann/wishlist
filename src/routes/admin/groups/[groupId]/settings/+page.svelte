<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/state";
    import { General } from "$lib/components/admin/Settings";
    import TokenCopy from "$lib/components/TokenCopy.svelte";
    import type { PageProps } from "./$types";
    import { getFormatter } from "$lib/i18n";
    import { toaster } from "$lib/components/toaster";

    const { data }: PageProps = $props();
    const t = getFormatter();

    const config = $state(data.config);
    const inviteUrl = $derived.by(() => {
        const url = new URL("/signup", page.url);
        url.searchParams.set("groupId", data.groupId);
        return url.href;
    });

    let inviteVisible = $state(false);
    let saving = $state(false);
</script>

<div class="card preset-filled-surface-100-900 mb-6 flex flex-col gap-3 p-4">
    <div class="flex flex-col gap-1">
        <h2 class="h6">Create permanent invite</h2>
        <p class="subtext">This link can be reused and only stops working if this group is deleted.</p>
    </div>
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button class="preset-filled-primary-500 btn w-fit" type="button" onclick={() => (inviteVisible = true)}>
            <span>Create permanent invite</span>
        </button>
        {#if inviteVisible}
            <TokenCopy url={inviteUrl} onCopied={() => toaster.info({ description: $t("general.copied") })}>
                {$t("general.invite-link")}
            </TokenCopy>
        {/if}
    </div>
</div>

<form
    method="POST"
    use:enhance={({ formData }) => {
        saving = true;
        if (!config.enableDefaultListCreation) {
            formData.append("enableDefaultListCreation", "");
        }

        return ({ result }) => {
            saving = false;
            if (result.type === "success") {
                toaster.info({ description: $t("admin.settings-saved-toast") });
            }
        };
    }}
>
    <General
        {config}
        forGroup
        groupUserCount={data.membershipCount}
        groups={[]}
        hidden={false}
        listCount={data.listCount}
    />

    {#if page.form?.error}
        <span>{page.form.error}</span>
    {/if}

    <div class="flex w-full flex-row justify-end pt-6">
        <button class="preset-filled-primary-500 btn" disabled={saving} type="submit">
            {#if saving}
                <span class="loading loading-spinner loading-xs"></span>
            {/if}
            <span>{$t("general.save")}</span>
        </button>
    </div>
</form>
