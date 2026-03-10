<script lang="ts">
    import { invalidateAll } from "$app/navigation";
    import { page } from "$app/state";
    import { GroupAPI } from "$lib/api/groups";
    import type { PageData, PageProps } from "./$types";
    import InviteUser from "$lib/components/admin/InviteUser.svelte";
    import ClearListsButton from "$lib/components/admin/Actions/ClearListsButton.svelte";
    import { enhance } from "$app/forms";
    import Alert from "$lib/components/Alert.svelte";
    import { getFormatter } from "$lib/i18n";
    import DeleteGroupModal from "$lib/components/modals/DeleteGroupModal.svelte";
    import ConfirmModal from "$lib/components/modals/ConfirmModal.svelte";
    import AddUserModal from "$lib/components/modals/AddUserModal.svelte";
    import { UserAPI } from "$lib/api/users";
    import { toaster } from "$lib/components/toaster";
    import { Role } from "$lib/schema";

    const { data }: PageProps = $props();
    const t = getFormatter();

    type UserData = PageData["group"]["users"][number];

    const groupAPI = $derived(new GroupAPI(data.group.id));
    const head = [$t("auth.name"), $t("auth.username"), $t("auth.email")];
    const dataKeys = ["name", "username", "email"] as (keyof UserData)[];
    const roleOptions = [
        { id: Role.USER, label: "User" },
        { id: Role.BUYER, label: "Buyer" },
        { id: Role.ADMIN, label: "Admin" }
    ];
    let roleByUserId = $state<Record<string, string>>({});
    let roleSavingByUserId = $state<Record<string, boolean>>({});
    let selectedUserIds = $state<Set<string>>(new Set());
    let bulkRoleId = $state<string>(String(Role.USER));
    let bulkSaving = $state(false);

    $effect(() => {
        roleByUserId = Object.fromEntries(data.group.users.map((user) => [user.id, String(user.role.id)]));
    });

    const roleLabel = (roleId: number) => roleOptions.find((o) => o.id === roleId)?.label ?? "Unknown";
    const allSelected = $derived(data.group.users.length > 0 && data.group.users.every((u) => selectedUserIds.has(u.id)));

    const toggleManager = async (userId: string, isManager: boolean) => {
        if (isManager) await groupAPI.makeManager(userId);
        else await groupAPI.removeManager(userId);

        await invalidateAll();
    };

    const removeMember = async (userId: string) => {
        await groupAPI.removeMember(userId);
        await invalidateAll();
    };

    const updateUserRole = async (userId: string) => {
        if (!data.canEditRoles || roleSavingByUserId[userId]) return;
        const roleId = Number(roleByUserId[userId]);
        if (!Number.isFinite(roleId)) return;

        roleSavingByUserId[userId] = true;
        const resp = await new UserAPI(userId).setRole(roleId);
        roleSavingByUserId[userId] = false;

        if (!resp.ok) {
            toaster.error({ description: $t("general.oops") });
            return;
        }

        toaster.info({ description: "Role updated" });
        await invalidateAll();
    };

    const toggleSelected = (userId: string, selected: boolean) => {
        const next = new Set(selectedUserIds);
        if (selected) next.add(userId);
        else next.delete(userId);
        selectedUserIds = next;
    };

    const toggleSelectAll = (selected: boolean) => {
        selectedUserIds = selected ? new Set(data.group.users.map((u) => u.id)) : new Set();
    };

    const updateSelectedRoles = async () => {
        if (!data.canEditRoles || bulkSaving || selectedUserIds.size === 0) return;
        const nextRoleId = Number(bulkRoleId);
        if (!Number.isFinite(nextRoleId)) return;
        bulkSaving = true;
        const ids = [...selectedUserIds];
        const results = await Promise.all(ids.map((userId) => new UserAPI(userId).setRole(nextRoleId)));
        bulkSaving = false;

        const failed = results.filter((resp) => !resp.ok).length;
        if (failed > 0) {
            toaster.error({ description: `Updated ${results.length - failed}/${results.length} roles` });
            return;
        }

        selectedUserIds = new Set();
        toaster.info({ description: "Roles updated" });
        await invalidateAll();
    };
</script>

{#if data.config.listMode !== "registry"}
    <div class="flex flex-wrap gap-2 py-4">
        <AddUserModal excludedUserIds={data.group.users.map(({ id }) => id)} groupId={data.group.id}>
            {#snippet trigger(props)}
                <button class="preset-filled-primary-500 btn" type="button" {...props}>
                    <iconify-icon icon="ion:person-add"></iconify-icon>
                    <span>{$t("admin.add-member")}</span>
                </button>
            {/snippet}
        </AddUserModal>

        <form method="POST" use:enhance>
            <InviteUser config={data.config} defaultGroup={data.group} />
        </form>
    </div>
{:else}
    <Alert type="info">
        {@html $t("admin.registry-mode-alert-text")}
    </Alert>
{/if}

<div class="flex flex-col space-y-2">
    {#if data.canEditRoles}
        <div class="card flex flex-wrap items-end gap-2 p-3">
            <span class="font-medium">Bulk role update</span>
            <span class="subtext">{selectedUserIds.size} selected</span>
            <select class="select" bind:value={bulkRoleId}>
                {#each roleOptions as roleOption}
                    <option value={String(roleOption.id)}>{roleOption.label}</option>
                {/each}
            </select>
            <button
                class="btn btn-sm preset-filled"
                disabled={bulkSaving || selectedUserIds.size === 0}
                onclick={updateSelectedRoles}
                type="button"
            >
                {bulkSaving ? "Updating..." : "Update selected roles"}
            </button>
        </div>
    {/if}
    <div class="table-wrap preset-outlined-surface-200-800 rounded-container">
        <table class="table">
            <thead>
                <tr>
                    {#if data.canEditRoles}
                        <th>
                            <input class="checkbox" checked={allSelected} onchange={(e) => toggleSelectAll(e.currentTarget.checked)} type="checkbox" />
                        </th>
                    {/if}
                    {#each head as label}
                        <th>
                            {label}
                        </th>
                    {/each}
                    <th>Role</th>
                    <th>{$t("admin.manager")}</th>
                    <th>{$t("general.remove")}</th>
                </tr>
            </thead>
            <tbody>
                {#each data.group.users as user, row}
                    {@const isManager = !user.isGroupManager}
                    <tr aria-rowindex={row}>
                        {#if data.canEditRoles}
                            <td>
                                <input
                                    class="checkbox"
                                    checked={selectedUserIds.has(user.id)}
                                    onchange={(e) => toggleSelected(user.id, e.currentTarget.checked)}
                                    type="checkbox"
                                />
                            </td>
                        {/if}
                        {#each dataKeys as key, col}
                            <td aria-colindex={col} tabindex={col === 0 ? 0 : -1}>
                                {user[key]}
                            </td>
                        {/each}
                        <td>
                            <div class="flex flex-col gap-1">
                                <span class="subtext">Current: {roleLabel(user.role.id)}</span>
                                {#if data.canEditRoles}
                                    <div class="flex items-center gap-2">
                                        <select
                                            class="select"
                                            bind:value={roleByUserId[user.id]}
                                        >
                                            {#each roleOptions as roleOption}
                                                <option value={String(roleOption.id)}>{roleOption.label}</option>
                                            {/each}
                                        </select>
                                        <button
                                            class="btn btn-sm preset-filled"
                                            disabled={roleSavingByUserId[user.id]}
                                            onclick={() => updateUserRole(user.id)}
                                            type="button"
                                        >
                                            {roleSavingByUserId[user.id] ? "Saving..." : "Save"}
                                        </button>
                                    </div>
                                {/if}
                            </div>
                        </td>
                        <td>
                            <ConfirmModal
                                onConfirm={() => toggleManager(user.id, isManager)}
                                title={$t("admin.add-remove-manager-title", { values: { isManager } })}
                            >
                                {#snippet description()}
                                    {$t("admin.add-remove-manager-message", { values: { isManager } })}
                                {/snippet}
                                {#snippet trigger(props)}
                                    <button class="btn-icon" {...props}>
                                        <iconify-icon
                                            class="text-primary-500"
                                            icon="ion:sparkles{!isManager ? '' : '-outline'}"
                                        ></iconify-icon>
                                    </button>
                                {/snippet}
                            </ConfirmModal>
                        </td>
                        <td aria-colindex={dataKeys.length} tabindex={-1}>
                            <ConfirmModal
                                onConfirm={() => removeMember(user.id)}
                                title={$t("admin.remove-member-title")}
                            >
                                {#snippet description()}
                                    {@html $t("admin.remove-member-message")}
                                {/snippet}
                                {#snippet trigger(props)}
                                    <button
                                        class="btn-icon"
                                        aria-label={$t("a11y.remove-user-from-group", { values: { user: user.name } })}
                                        {...props}
                                    >
                                        <iconify-icon class="text-error-500" icon="ion:person-remove"></iconify-icon>
                                    </button>
                                {/snippet}
                            </ConfirmModal>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <div class="flex flex-wrap gap-2">
        <DeleteGroupModal defaultGroup={data.config.defaultGroup} groupId={data.group.id} />
        <ClearListsButton groupId={page.params.groupId} />
        <ClearListsButton claimed groupId={page.params.groupId} />
    </div>
</div>
