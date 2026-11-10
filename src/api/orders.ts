/** Purchase orders, sales-order service lines and the till customer. */

import type {
    InvenTreeCompany,
    PurchaseOrderLine,
    PurchaseOrderSummary,
} from './types';
import type { ServiceLine } from '../lib/services';
import { hasVolunteerSession } from '../auth/session';
import { CatalogApi } from './catalog';

/** Name of the InvenTree customer that till sales are booked on. */
export const TILL_CUSTOMER = 'Walk-in customer';

export class OrdersApi extends CatalogApi {
    private tillCustomerPk: number | null = null;

    /** The InvenTree customer every till sale is booked on. Creating it needs a volunteer. */
    async getTillCustomer(): Promise<number> {
        if (this.tillCustomerPk) return this.tillCustomerPk;
        const found = await this.request<InvenTreeCompany[] | { results: InvenTreeCompany[] }>(
            `/company/?is_customer=true&search=${encodeURIComponent(TILL_CUSTOMER)}`, 'GET', undefined, false, false
        );
        const list = Array.isArray(found) ? found : found.results;
        const existing = list.find(c => c.name === TILL_CUSTOMER);
        if (existing) return (this.tillCustomerPk = existing.pk);

        try {
            const created = await this.request<InvenTreeCompany>('/company/', 'POST', {
                name: TILL_CUSTOMER,
                description: 'Sales at the self-service till of the stock app',
                is_customer: true,
                is_supplier: false,
                is_manufacturer: false,
            }, false, false);
            return (this.tillCustomerPk = created.pk);
        } catch (err) {
            if (!hasVolunteerSession()) {
                throw new Error(`InvenTree has no "${TILL_CUSTOMER}" customer yet. A volunteer has to sign in once to set it up.`);
            }
            throw err;
        }
    }

    async getPurchaseOrders(): Promise<PurchaseOrderSummary[]> {
        const result = await this.request<{ results: Awaited<ReturnType<OrdersApi['getPurchaseOrders']>> }>(
            '/order/po/?limit=100&ordering=-creation_date',
            'GET',
            undefined,
            false,
            false
        );
        return result.results;
    }

    async createPurchaseOrder(payload: { supplier: number; reference?: string; description?: string }): Promise<{ pk: number; reference: string }> {
        return this.request('/order/po/', 'POST', payload, false, false);
    }

    async addPurchaseOrderLine(payload: { order: number; part: number; quantity: number; purchase_price?: string; purchase_price_currency?: string }): Promise<{ pk: number }> {
        return this.request('/order/po-line/', 'POST', payload, false, false);
    }

    async issuePurchaseOrder(poPk: number): Promise<void> {
        await this.request(`/order/po/${poPk}/issue/`, 'POST', {}, false, false);
    }

    async cancelPurchaseOrder(poPk: number): Promise<void> {
        await this.request(`/order/po/${poPk}/cancel/`, 'POST', {}, false, false);
    }

    /**
     * Line items on an order. `quantity` and `received` are both counted in
     * supplier packs, not in single units — multiply by the supplier part's
     * pack_quantity to show units.
     */
    async getPurchaseOrderLines(poPk: number): Promise<PurchaseOrderLine[]> {
        const result = await this.request<{ results: PurchaseOrderLine[] }>(
            `/order/po-line/?order=${poPk}&part_detail=true&limit=100`,
            'GET',
            undefined,
            false,
            false
        );
        return result.results;
    }

    /**
     * Book received goods in against the order.
     *
     * Quantities are in packs, matching the line items. InvenTree creates the
     * stock itself, applying pack_quantity, and bumps each line's `received`.
     */
    async receivePurchaseOrderItems(
        poPk: number,
        items: { line_item: number; quantity: number; location: number; batch_code?: string }[],
        locationPk: number
    ): Promise<void> {
        await this.request(
            `/order/po/${poPk}/receive/`,
            'POST',
            {
                items: items.map(i => ({
                    line_item: i.line_item,
                    quantity: i.quantity,
                    location: i.location,
                    batch_code: i.batch_code ?? '',
                    status: 10, // StockStatus.OK
                })),
                location: locationPk,
            },
            false,
            false
        );
    }

    /**
     * Close the order. InvenTree refuses to close an order with outstanding
     * lines unless accept_incomplete is set, which is the "we are not getting
     * the rest" case.
     */
    async completePurchaseOrder(poPk: number, acceptIncomplete: boolean = false): Promise<void> {
        await this.request(
            `/order/po/${poPk}/complete/`,
            'POST',
            { accept_incomplete: acceptIncomplete },
            false,
            false
        );
    }

    /**
     * Every extra line on sales orders (Lasertime, CNC time, 3D printing), with
     * its order's status and dates. Pages through the API like the tracking log.
     */
    async getAllServiceLines(pageSize: number = 500): Promise<ServiceLine[]> {
        const all: ServiceLine[] = [];
        for (let offset = 0; ; offset += pageSize) {
            const page = await this.serviceLinePage(pageSize, offset);
            all.push(...page.lines);
            if (page.lines.length < pageSize || all.length >= page.count) return all;
        }
    }

    /** The newest extra lines, newest first. The endpoint ignores ?ordering, so read the last page. */
    async getRecentServiceLines(limit: number = 10): Promise<ServiceLine[]> {
        const { count } = await this.serviceLinePage(1, 0);
        const { lines } = await this.serviceLinePage(limit, Math.max(0, count - limit));
        return lines.reverse();
    }

    private async serviceLinePage(limit: number, offset: number): Promise<{ count: number; lines: ServiceLine[] }> {
        type Row = {
            reference: string; description: string; quantity: number | string; price: number | string | null;
            order_detail?: { reference?: string; status: number; creation_date?: string | null; issue_date?: string | null; shipment_date?: string | null };
        };
        const path = `/order/so-extra-line/?limit=${limit}&offset=${offset}&order_detail=true`;
        const page = await this.request<{ count: number; results: Row[] }>(path, 'GET', undefined, false, false);
        return {
            count: page.count,
            lines: page.results.map(r => {
                const o = r.order_detail;
                return {
                    reference: r.reference,
                    description: r.description ?? '',
                    quantity: Number(r.quantity) || 0,
                    price: Number(r.price) || 0,
                    date: o?.shipment_date || o?.issue_date || o?.creation_date || '',
                    orderStatus: o?.status ?? 0,
                    order: o?.reference ?? '',
                };
            }),
        };
    }
}
