<script lang="ts">
    import { Avatar } from "@skeletonlabs/skeleton-svelte";
    import type { ClassValue } from "svelte/elements";

    interface Props {
        user?: {
            name: string;
            picture?: string | null;
        };
        class: ClassValue;
    }

    let { user, ...props }: Props = $props();

    const avatarSrc = $derived.by(() => {
        if (!user?.picture) return null;

        try {
            new URL(user.picture);
            return user.picture;
        } catch {
            return `/api/assets/${user.picture}`;
        }
    });
</script>

<Avatar {...props}>
    <Avatar.Image src={avatarSrc}></Avatar.Image>
    <Avatar.Fallback class="preset-filled-primary-500">
        {user?.name.split(" ").reduce((x, y) => x + y.at(0), "")}
    </Avatar.Fallback>
</Avatar>
