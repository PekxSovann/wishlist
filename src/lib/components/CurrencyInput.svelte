<script lang="ts">
    import { Combobox, Portal, useListCollection, type ComboboxRootProps } from "@skeletonlabs/skeleton-svelte";
    import { getFormatter as getPriceFormatter, getLocaleConfig } from "$lib/price-formatter";
    import type { KeyboardEventHandler } from "svelte/elements";
    import { onMount } from "svelte";
    import { getFormatter } from "$lib/i18n";
    import { toaster } from "./toaster";

    interface Props {
        value?: number | null;
        currency?: string;
        name: string;
        id: string;
        disabled?: boolean;
        zIndex?: string;
    }

    let { value = $bindable(null), currency = $bindable("JPY"), name, id, disabled = false, zIndex = "z-30!" }: Props = $props();
    const t = getFormatter();

    let formatter = $derived(getPriceFormatter(currency));
    let localeConfig = $derived(getLocaleConfig(formatter));
    let maximumFractionDigits = $derived(formatter.resolvedOptions().maximumFractionDigits || 2);
    let inputtedValue = value !== null ? value.toString() : "";
    let displayValue = $state(inputtedValue);
    let inputElement: HTMLInputElement | undefined = $state();
    let isMounted = $state(false);
    let previousCurrency = currency;
    let currencySearch = $state(currency);
    const availableCurrencies = (
        "supportedValuesOf" in Intl ? Intl.supportedValuesOf("currency") : ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"]
    )
        .map((c) => c.toUpperCase())
        .toSorted();
    const collection = $derived(
        useListCollection({
            items: availableCurrencies
        })
    );
    let filteredCurrencies: string[] = $state(availableCurrencies);

    onMount(() => {
        isMounted = true;
    });

    $effect(() => {
        if (isMounted && document.activeElement !== inputElement && value !== null)
            displayValue = formatter.format(value);
    });

    // Checks if the key pressed is allowed
    const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
        const isDeletion = event.key === "Backspace" || event.key === "Delete";
        const isModifier = event.metaKey || event.altKey || event.ctrlKey;
        const isArrowKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
        const isTab = event.key === "Tab";
        const isInvalidCharacter = !/^\d|,|\.|-$/g.test(event.key); // Keys that are not a digit, comma, period or minus sign

        // If there is already a decimal point, don't allow more than one
        const isPunctuationDuplicated = () => {
            if (event.key !== "," && event.key !== ".") return false; // Is `false` because it's not a punctuation key
            if (localeConfig.decimalSeparator) return displayValue.split(localeConfig.decimalSeparator).length > 1;
            return false;
        };

        if (isPunctuationDuplicated() || (!isDeletion && !isModifier && !isArrowKey && isInvalidCharacter && !isTab)) {
            event.preventDefault();
            return;
        }
    };

    const handleBlur = () => {
        if (displayValue === "") {
            value = null;
            inputtedValue = "";
            displayValue = "";
            return;
        }
        let stringValue = displayValue;
        if (localeConfig.groupSeparator === ".") {
            stringValue = stringValue.replace(".", "");
        } else if (localeConfig.groupSeparator === ",") {
            stringValue = stringValue.replace(",", "");
        }
        if (localeConfig.decimalSeparator === ",") {
            stringValue = stringValue.replace(",", ".");
        }
        value = parseFloat(stringValue);
        inputtedValue = displayValue;
        displayValue = formatter.format(value);
    };

    const handleFocus = () => {
        displayValue = inputtedValue;
    };

    const getCurrencyMatches = (query: string) => {
        const q = query.trim().toUpperCase();
        return q ? availableCurrencies.filter((currencyCode) => currencyCode.includes(q)) : availableCurrencies;
    };

    const setCurrency = (input: string, notify = true) => {
        const nextCurrency = input.trim().toUpperCase();
        if (!nextCurrency) {
            currency = previousCurrency;
            currencySearch = previousCurrency;
            if (notify) {
                toaster.info({
                    description: $t("errors.price-must-have-a-currency")
                });
            }
            return;
        }
        try {
            Intl.NumberFormat(undefined, { style: "currency", currency: nextCurrency });
            currency = nextCurrency;
            currencySearch = nextCurrency;
        } catch {
            currencySearch = previousCurrency;
            if (notify) {
                toaster.warning({
                    description: $t("errors.invalid-currency-code")
                });
            }
            return;
        }
        previousCurrency = currency;
    };

    const onInputValueChange: ComboboxRootProps["onInputValueChange"] = (event) => {
        const next = event.inputValue.toUpperCase();
        currencySearch = next;
        filteredCurrencies = getCurrencyMatches(next);
        if (event.reason === "item-select") {
            setCurrency(event.inputValue);
        }
    };

    const onOpenChange: ComboboxRootProps["onOpenChange"] = (event) => {
        if (event.open) {
            currencySearch = "";
            filteredCurrencies = availableCurrencies;
        }
    };
</script>

<div class="flex gap-2">
    <div class="input-group grid grow grid-cols-[auto_1fr]">
        <div class="ig-cell preset-tonal">
            <iconify-icon icon="ion:pricetag"></iconify-icon>
        </div>
        <input
            bind:this={inputElement}
            id={`formatted-${id}`}
            name={`formatted-${name}`}
            class="ig-input"
            autocomplete="off"
            {disabled}
            inputmode={maximumFractionDigits > 0 ? "decimal" : "numeric"}
            onblur={handleBlur}
            onfocus={handleFocus}
            onkeydown={handleKeyDown}
            placeholder={formatter.format(0)}
            type="text"
            bind:value={displayValue}
        />
    </div>
    <Combobox
        class="w-[9ch] shrink-0 gap-0"
        {collection}
        inputBehavior="autohighlight"
        {onInputValueChange}
        {onOpenChange}
        openOnClick
        placeholder={currency}
    >
        <Combobox.Control>
            <Combobox.Input>
                {#snippet element(props)}
                    <input
                        {...props}
                        class="input h-full w-full rounded uppercase"
                        data-testid="currency"
                        maxlength="3"
                        onblur={() => setCurrency(currencySearch, false)}
                        spellcheck={false}
                    />
                {/snippet}
            </Combobox.Input>
            <Combobox.Trigger />
        </Combobox.Control>
        <Portal>
            <Combobox.Positioner class={zIndex}>
                <Combobox.Content class="h-64 w-[10ch] overflow-auto">
                    {#if filteredCurrencies.length === 0}
                        <div class="px-2 py-1 text-xs opacity-70">No matches</div>
                    {:else}
                        {#each filteredCurrencies as item (item)}
                            <Combobox.Item class="list-option w-full uppercase" {item}>
                                <Combobox.ItemText>{item}</Combobox.ItemText>
                            </Combobox.Item>
                        {/each}
                    {/if}
                </Combobox.Content>
            </Combobox.Positioner>
        </Portal>
    </Combobox>
</div>

<input {id} {name} {disabled} type="hidden" bind:value />
<input id="currency" name="currency" type="hidden" bind:value={currency} />
