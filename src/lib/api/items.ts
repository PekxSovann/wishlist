export class ItemAPI {
    itemId: string;
    constructor(itemId: string) {
        this.itemId = itemId;
    }

    _makeRequest = async (method: string, body?: Record<string, unknown>) => {
        const options: RequestInit = {
            method,
            headers: {
                "content-type": "application/json",
                accept: "application/json"
            }
        };

        if (body) options.body = JSON.stringify(body);

        return await fetch(`/api/items/${this.itemId}`, options);
    };

    delete = async () => {
        return await this._makeRequest("DELETE");
    };

    updateBuyerNote = async (note?: string | null) => {
        const options: RequestInit = {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                accept: "application/json"
            },
            body: JSON.stringify({ note })
        };
        return await fetch(`/api/items/${this.itemId}/note`, options);
    };
}

export class ItemsAPI {
    _makeRequest = async (method: string, path: string, body?: any) => {
        const options: RequestInit = {
            method,
            headers: {
                "content-type": "application/json",
                accept: "application/json"
            }
        };

        if (body) options.body = JSON.stringify(body);

        return await fetch(`/api/items${path}`, options);
    };

    clearItemsFromLists = async (groupId?: string, claimed?: boolean) => {
        const searchParams = new URLSearchParams();
        if (groupId) searchParams.append("groupId", groupId);
        if (claimed) searchParams.append("claimed", `${claimed}`);
        return await this._makeRequest("DELETE", "?" + searchParams.toString());
    };

    updateMany = async (items: (Record<string, unknown> & { id: string })[]) => {
        return await this._makeRequest("PATCH", "", items);
    };
}
