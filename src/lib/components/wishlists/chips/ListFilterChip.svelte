<script lang="ts">
    import type { User } from "$lib/generated/prisma/client";
    import BaseChip from "./BaseChip.svelte";
    import { defaultLang, getFormatter, getLocale } from "$lib/i18n";
    import type { ClassValue } from "svelte/elements";

    type PartialUser = Pick<User, "id"> & Partial<Pick<User, "name" | "username">>;

    interface Props {
        users: PartialUser[];
        class?: ClassValue;
    }

    let { users, class: clazz }: Props = $props();
    const t = getFormatter();
    const locale = getLocale();

    const label = $t("wishes.filter");
    const prefix = "ion:people";
    const searchParam = "users";
    const defaultOption: Option = {
        value: "",
        displayValue: $t("general.all")
    };
    let options: Option[] = $derived([defaultOption, ...getUniqueUsers(users)]);

    function getUniqueUsers(users: PartialUser[]) {
        const uniqueIds = new Set();
        return users
            .filter((u) => {
                const unique = !uniqueIds.has(u.id);
                if (unique) uniqueIds.add(u.id);
                return unique;
            })
            .map((user) => ({ value: user.id, displayValue: user.username ?? user.name ?? user.id }) as Option)
            .toSorted((a, b) => a.displayValue.localeCompare(b.displayValue, locale || defaultLang.code));
    }
</script>

<BaseChip
    class={clazz}
    {defaultOption}
    {label}
    multiselect
    {options}
    {prefix}
    {searchParam}
    testId="list-filter"
/>
