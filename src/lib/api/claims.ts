export class ClaimAPI {
    private claimId: string;
    constructor(claimId: string) {
        this.claimId = claimId;
    }

    _makeRequest = async (method: string, data?: Record<string, any>) => {
        const options: RequestInit = {
            method,
            headers: {
                "content-type": "application/json",
                accept: "application/json"
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const url = `/api/claims/${this.claimId}`;
        return await fetch(url, options);
    };

    purchase = async () => {
        return await this._makeRequest("PATCH", { purchased: true });
    };

    unpurchase = async () => {
        return await this._makeRequest("PATCH", { purchased: false });
    };

    updateQuantity = async (
        quantity: number,
        claimedPrice?: number | null,
        claimedCurrency?: string | null,
        claimedNote?: string | null
    ) => {
        return await this._makeRequest("PATCH", { quantity, claimedPrice, claimedCurrency, claimedNote });
    };

    updateReceivedAmount = async (receivedAmount: number) => {
        return await this._makeRequest("PATCH", { receivedAmount });
    };

    updateNote = async (claimedNote?: string | null) => {
        return await this._makeRequest("PATCH", { claimedNote });
    };

    unclaim = async () => {
        return await this._makeRequest("DELETE");
    };
}
