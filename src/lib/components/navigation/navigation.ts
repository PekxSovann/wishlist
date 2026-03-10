import { resolve } from "$app/paths";

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
