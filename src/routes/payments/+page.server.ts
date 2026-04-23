import type { PageServerLoad } from "./$types";
import { getActiveMembership } from "$lib/server/group-membership";
import { requireLogin } from "$lib/server/auth";
import { client } from "$lib/server/prisma";

export const load: PageServerLoad = async () => {
    const user = requireLogin();
    const activeMembership = await getActiveMembership(user);
    const incomingClaims = await client.itemClaim.findMany({
        where: {
            claimedById: user.id,
            list: {
                groupId: activeMembership.groupId
            }
        },
        orderBy: {
            itemId: "desc"
        },
        select: {
            id: true,
            quantity: true,
            claimedPrice: true,
            claimedCurrency: true,
            receivedAmount: true,
            item: {
                select: {
                    name: true,
                    itemPrice: {
                        select: {
                            value: true,
                            currency: true
                        }
                    },
                    user: {
                        select: {
                            name: true,
                            username: true
                        }
                    }
                }
            }
        }
    });

    const outgoingClaims = await client.itemClaim.findMany({
        where: {
            item: {
                userId: user.id
            },
            list: {
                groupId: activeMembership.groupId
            }
        },
        orderBy: {
            itemId: "desc"
        },
        select: {
            id: true,
            quantity: true,
            claimedPrice: true,
            claimedCurrency: true,
            receivedAmount: true,
            claimedBy: {
                select: {
                    name: true,
                    username: true
                }
            },
            publicClaimedBy: {
                select: {
                    name: true
                }
            },
            item: {
                select: {
                    name: true,
                    itemPrice: {
                        select: {
                            value: true,
                            currency: true
                        }
                    }
                }
            }
        }
    });

    const incomingPayments = incomingClaims
        .map((claim) => {
            const currency = claim.claimedCurrency ?? claim.item.itemPrice?.currency ?? "N/A";
            const unitAmount = claim.claimedPrice ?? claim.item.itemPrice?.value ?? 0;

            const totalOwed = unitAmount * claim.quantity;
            const receivedAmount = claim.receivedAmount;
            const status = receivedAmount <= 0 ? "unpaid" : receivedAmount >= totalOwed ? "paid" : "partial";
            return {
                claimId: claim.id,
                itemName: claim.item.name,
                owesYouName: claim.item.user.username,
                quantity: claim.quantity,
                currency,
                unitAmount,
                totalOwed,
                receivedAmount,
                remainingAmount: Math.max(totalOwed - receivedAmount, 0),
                status
            };
        })
        .filter((p) => p !== null);

    const outgoingPayments = outgoingClaims
        .map((claim) => {
            const currency = claim.claimedCurrency ?? claim.item.itemPrice?.currency ?? "N/A";
            const unitAmount = claim.claimedPrice ?? claim.item.itemPrice?.value ?? 0;

            const totalOwed = unitAmount * claim.quantity;
            const amountPaid = claim.receivedAmount;
            const status = amountPaid <= 0 ? "unpaid" : amountPaid >= totalOwed ? "paid" : "partial";
            const payableToName = claim.claimedBy?.username ?? claim.claimedBy?.name ?? claim.publicClaimedBy?.name ?? "Anonymous";
            return {
                claimId: claim.id,
                itemName: claim.item.name,
                payableToName,
                quantity: claim.quantity,
                currency,
                unitAmount,
                totalOwed,
                amountPaid,
                remainingAmount: Math.max(totalOwed - amountPaid, 0),
                status
            };
        })
        .filter((p) => p !== null);

    return {
        user: {
            ...user,
            activeGroupId: activeMembership.groupId
        },
        incomingPayments,
        outgoingPayments
    };
};
