import { resolve } from "$app/paths";
import { Role } from "$lib/schema";

export const navItems = [
    {
        labelKey: "app.home",
        href: () => resolve("/lists"),
        icon: "ion:home"
    },
    {
        labelKey: "wishes.my-lists",
        href: (user) => resolve("/lists") + (user ? "?" + new URLSearchParams({ users: user.id }).toString() : ""),
        icon: "ion:gift"
    },
    {
        labelKey: "app.all-items",
        href: () => resolve("/all-items"),
        icon: "ion:grid"
    },
    {
        labelKey: "app.private-catalog",
        href: () => resolve("/admin/private-catalog"),
        icon: "ion:lock-closed",
        roles: [Role.ADMIN]
    },
    {
        labelKey: "app.my-claims",
        href: () => resolve("/claims"),
        icon: "ion:albums"
    },
    {
        labelKey: "app.my-payments",
        href: () => resolve("/payments"),
        icon: "ion:wallet"
    }
] satisfies NavItem[];
