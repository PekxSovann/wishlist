<script lang="ts">
    import type { PageProps } from "./$types";
    import { getFormatter } from "$lib/i18n";
    import noClaims from "$lib/assets/no_claims.svg";
    import { ClaimAPI } from "$lib/api/claims";
    import { toaster } from "$lib/components/toaster";
    import { formatPlainNumber } from "$lib/price-formatter";

    const { data }: PageProps = $props();
    const t = getFormatter();
    const paymentStatusOrder = ["unpaid", "partial", "paid"] as const;
    const paymentStatusLabel = {
        unpaid: "Unpaid",
        partial: "Partially paid",
        paid: "Paid"
    } as const;
    let incomingPayments = $state(
        data.incomingPayments.map((p) => ({ ...p, draftReceivedAmount: p.receivedAmount, saving: false }))
    );
    const outgoingPayments = data.outgoingPayments;
    let bulkReceivedDraft = $state<Record<string, number>>({});
    let bulkSaving = $state<Record<string, boolean>>({});
    const groupedIncomingPayments = $derived.by(() =>
        paymentStatusOrder
            .map((status) => [status, incomingPayments.filter((p) => p.status === status)] as const)
            .filter(([, p]) => p.length > 0)
    );
    const groupedOutgoingPayments = $derived.by(() =>
        paymentStatusOrder
            .map((status) => [status, outgoingPayments.filter((p) => p.status === status)] as const)
            .filter(([, p]) => p.length > 0)
    );
    const incomingSummary = $derived.by(() => {
        const totals = incomingPayments
            .reduce(
                (acc, payment) => {
                    const key = `${payment.owesYouName}::${payment.currency}`;
                    if (!acc[key]) {
                        acc[key] = {
                            key,
                            name: payment.owesYouName,
                            currency: payment.currency,
                            totalOwed: 0,
                            totalPaid: 0,
                            remaining: 0
                        };
                    }
                    acc[key].totalOwed += payment.totalOwed;
                    acc[key].totalPaid += payment.receivedAmount;
                    acc[key].remaining += payment.remainingAmount;
                    return acc;
                },
                {} as Record<
                    string,
                    { key: string; name: string; currency: string; totalOwed: number; totalPaid: number; remaining: number }
                >
            );
        return Object.values(totals).toSorted((a, b) => b.remaining - a.remaining);
    });
    const outgoingSummary = $derived.by(() => {
        const totals = outgoingPayments.reduce(
            (acc, payment) => {
                const key = `${payment.payableToName}::${payment.currency}`;
                if (!acc[key]) {
                    acc[key] = {
                        name: payment.payableToName,
                        currency: payment.currency,
                        totalOwed: 0,
                        totalPaid: 0,
                        remaining: 0
                    };
                }
                acc[key].totalOwed += payment.totalOwed;
                acc[key].totalPaid += payment.amountPaid;
                acc[key].remaining += payment.remainingAmount;
                return acc;
            },
            {} as Record<
                string,
                { name: string; currency: string; totalOwed: number; totalPaid: number; remaining: number }
            >
        );
        return Object.values(totals).toSorted((a, b) => b.remaining - a.remaining);
    });
    const hasNoPayments = $derived(incomingPayments.length === 0 && outgoingPayments.length === 0);

    const saveReceivedAmount = async (claimId: string) => {
        const payment = incomingPayments.find((p) => p.claimId === claimId);
        if (!payment || payment.saving) return;
        const nextValue = Number(payment.draftReceivedAmount);
        if (!Number.isFinite(nextValue) || nextValue < 0) {
            toaster.error({ description: "Amount received must be a positive number" });
            return;
        }

        payment.saving = true;
        const claimAPI = new ClaimAPI(claimId);
        const resp = await claimAPI.updateReceivedAmount(Math.round(nextValue));
        payment.saving = false;

        if (!resp.ok) {
            toaster.error({ description: "Unable to update amount received" });
            return;
        }

        payment.receivedAmount = Math.round(nextValue);
        payment.remainingAmount = Math.max(payment.totalOwed - payment.receivedAmount, 0);
        payment.status = payment.receivedAmount <= 0 ? "unpaid" : payment.receivedAmount >= payment.totalOwed ? "paid" : "partial";
        toaster.info({ description: "Payment updated" });
    };

    const applyBulkReceived = async (summaryKey: string) => {
        if (bulkSaving[summaryKey]) return;
        const summaryRow = incomingSummary.find((row) => row.key === summaryKey);
        if (!summaryRow) return;
        const inputValue = Number(bulkReceivedDraft[summaryKey] ?? 0);
        if (!Number.isFinite(inputValue) || inputValue < 0) {
            toaster.error({ description: "Amount received must be a positive number" });
            return;
        }
        if (inputValue > summaryRow.remaining) {
            toaster.error({ description: "Amount exceeds remaining owed" });
            return;
        }

        const targetPayments = incomingPayments
            .filter((payment) => `${payment.owesYouName}::${payment.currency}` === summaryKey)
            .toSorted((a, b) => a.claimId.localeCompare(b.claimId));
        if (targetPayments.length === 0) return;

        const amountToAdd = Math.round(inputValue);
        const targetTotal = Math.min(summaryRow.totalPaid + amountToAdd, summaryRow.totalOwed);

        let remaining = targetTotal;
        const distribution = targetPayments.map((payment) => {
            const nextReceived = Math.min(payment.totalOwed, remaining);
            remaining -= nextReceived;
            return { payment, nextReceived };
        });
        const toUpdate = distribution.filter(({ payment, nextReceived }) => payment.receivedAmount !== nextReceived);
        if (toUpdate.length === 0) {
            toaster.info({ description: "No changes to apply" });
            return;
        }

        bulkSaving[summaryKey] = true;
        const results = await Promise.all(
            toUpdate.map(({ payment, nextReceived }) =>
                new ClaimAPI(payment.claimId).updateReceivedAmount(nextReceived).then((resp) => ({ payment, nextReceived, ok: resp.ok }))
            )
        );
        bulkSaving[summaryKey] = false;

        let failed = 0;
        for (const result of results) {
            if (!result.ok) {
                failed++;
                continue;
            }
            result.payment.receivedAmount = result.nextReceived;
            result.payment.remainingAmount = Math.max(result.payment.totalOwed - result.payment.receivedAmount, 0);
            result.payment.status =
                result.payment.receivedAmount <= 0
                    ? "unpaid"
                    : result.payment.receivedAmount >= result.payment.totalOwed
                      ? "paid"
                      : "partial";
            result.payment.draftReceivedAmount = result.nextReceived;
        }

        if (failed > 0) {
            toaster.error({ description: `Updated ${results.length - failed}/${results.length} claims` });
            return;
        }
        bulkReceivedDraft[summaryKey] = 0;
        toaster.info({ description: "Summary amount applied" });
    };
</script>

{#if hasNoPayments}
    <div class="flex flex-col items-center justify-center space-y-4 pt-4">
        <img class="w-3/4 md:w-1/3" alt={$t("a11y.a-person-looking-at-an-empty-board")} src={noClaims} />
        <p class="text-2xl">{$t("app.my-payments")}</p>
        <p class="text-subtle">No purchased claims found yet.</p>
    </div>
{:else}
    <div class="flex flex-col space-y-4" data-testid="payments-container">
        {#if incomingPayments.length > 0}
            <section class="flex flex-col gap-2">
                <h2 class="h2">Money To Receive</h2>
                {#if incomingSummary.length > 0}
                    <section class="card preset-filled-surface-100-900 inset-ring-surface-200-800 inset-ring p-4">
                        <h3 class="h3">Summary</h3>
                        <div class="mt-2 flex flex-col gap-1">
                            {#each incomingSummary as row}
                                <span>{row.name} owes you: {formatPlainNumber(row.remaining)} {row.currency}</span>
                                <span class="subtext">
                                    Total: {formatPlainNumber(row.totalOwed)} {row.currency} | Received: {formatPlainNumber(row.totalPaid)} {row.currency}
                                </span>
                                <span class="subtext">
                                    Already given: {formatPlainNumber(row.totalPaid)} {row.currency}
                                </span>
                                <div class="mt-1 flex flex-wrap items-end gap-2">
                                    <label class="flex flex-col gap-1">
                                        <span class="subtext">Add newly received amount</span>
                                        <input
                                            class="input w-48"
                                            inputmode="numeric"
                                            min="0"
                                            max={row.remaining}
                                            step="1"
                                            type="number"
                                            value={bulkReceivedDraft[row.key] ?? 0}
                                            oninput={(e) => {
                                                bulkReceivedDraft[row.key] = Number((e.currentTarget as HTMLInputElement).value);
                                            }}
                                        />
                                    </label>
                                    <button
                                        class="btn btn-sm preset-filled"
                                        disabled={bulkSaving[row.key]}
                                        onclick={() => applyBulkReceived(row.key)}
                                    >
                                        {bulkSaving[row.key] ? "Applying..." : "Apply"}
                                    </button>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}
            </section>
        {/if}
        {#if outgoingPayments.length > 0}
            <section class="flex flex-col gap-2">
                <h2 class="h2">Money You Owe</h2>
                {#if outgoingSummary.length > 0}
                    <section class="card preset-filled-surface-100-900 inset-ring-surface-200-800 inset-ring p-4">
                        <h3 class="h3">Summary</h3>
                        <div class="mt-2 flex flex-col gap-1">
                            {#each outgoingSummary as row}
                                <span>You paid {row.name}: {formatPlainNumber(row.totalPaid)} {row.currency}</span>
                                <span class="subtext">Remaining: {formatPlainNumber(row.remaining)} {row.currency}</span>
                            {/each}
                        </div>
                    </section>
                {/if}
            </section>
        {/if}
        {#each groupedIncomingPayments as [status, statusPayments] (status)}
            <section class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <h2 class="h3">{paymentStatusLabel[status]}</h2>
                    <span class="subtext">({statusPayments.length})</span>
                </div>
                {#each statusPayments as payment (payment.claimId)}
                    <div class="card preset-filled-surface-100-900 inset-ring-surface-200-800 inset-ring p-4">
                        <div class="flex flex-col gap-1">
                            <span class="font-bold">{payment.itemName}</span>
                            <span>{payment.owesYouName} owes you: {formatPlainNumber(payment.totalOwed)} {payment.currency}</span>
                            <span class="subtext">Remaining: {formatPlainNumber(payment.remainingAmount)} {payment.currency}</span>
                        </div>

                        <div class="mt-3 flex flex-wrap items-end gap-2">
                            <label class="flex flex-col gap-1">
                                <span class="subtext">Amount already received</span>
                                <input
                                    class="input w-48"
                                    inputmode="numeric"
                                    min="0"
                                    step="1"
                                    type="number"
                                    bind:value={payment.draftReceivedAmount}
                                />
                            </label>
                            <button
                                class="btn btn-sm preset-filled"
                                disabled={payment.saving}
                                onclick={() => saveReceivedAmount(payment.claimId)}
                            >
                                {payment.saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                {/each}
            </section>
        {/each}
        {#each groupedOutgoingPayments as [status, statusPayments] (status)}
            <section class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <h2 class="h3">{paymentStatusLabel[status]}</h2>
                    <span class="subtext">({statusPayments.length})</span>
                </div>
                {#each statusPayments as payment (payment.claimId)}
                    <div class="card preset-filled-surface-100-900 inset-ring-surface-200-800 inset-ring p-4">
                        <div class="flex flex-col gap-1">
                            <span class="font-bold">{payment.itemName}</span>
                            <span>You owe {payment.payableToName}: {formatPlainNumber(payment.totalOwed)} {payment.currency}</span>
                            <span class="subtext">Paid: {formatPlainNumber(payment.amountPaid)} {payment.currency}</span>
                            <span class="subtext">Remaining: {formatPlainNumber(payment.remainingAmount)} {payment.currency}</span>
                        </div>
                    </div>
                {/each}
            </section>
        {/each}
    </div>
{/if}

<svelte:head>
    <title>{$t("app.my-payments")}</title>
</svelte:head>
