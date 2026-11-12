import { paypalRequest, type PayPalResponse } from "./client";
import type { Link, Money } from "./disputes";

export type Order = {
  id: string;
  status: string; // CREATED, APPROVED, COMPLETED, ...
  links?: Link[];
  payer?: { email_address?: string; payer_id?: string };
  purchase_units?: {
    reference_id?: string;
    description?: string;
    amount?: Money;
    payments?: { captures?: { id: string; status: string; amount: Money }[] };
  }[];
};

/** Creates an immediate-capture order. Used to make sandbox payments that a buyer can then dispute. */
export async function createCaptureOrder(args: {
  amount: string;
  description: string;
  referenceId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<PayPalResponse<Order>> {
  return paypalRequest<Order>("POST", "/v2/checkout/orders", {
    json: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: args.referenceId,
          custom_id: args.referenceId,
          description: args.description,
          amount: { currency_code: "USD", value: args.amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: "PAY_NOW",
            shipping_preference: "GET_FROM_FILE",
            return_url: args.returnUrl,
            cancel_url: args.cancelUrl,
          },
        },
      },
    },
  });
}

export async function getOrder(id: string) {
  return (await paypalRequest<Order>("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`)).data;
}

export async function captureOrder(id: string) {
  return (await paypalRequest<Order>("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { json: {} }))
    .data;
}

export function approvalLink(order: Order): string | undefined {
  return order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
}
