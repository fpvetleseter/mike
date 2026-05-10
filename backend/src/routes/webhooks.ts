import { Router } from "express";
import Stripe from "stripe";
import { createServerSupabase } from "../lib/supabase";

interface StripeWebhookEvent {
  type: string;
  data: {
    object: unknown;
  };
}

type StripeCustomerReference = string | { id: string } | null;
type StripeClient = InstanceType<typeof Stripe>;

const stripeWebhookRouter = Router();

stripeWebhookRouter.post("/", (req, res) => {
  const stripe = createStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];

  if (!webhookSecret || typeof signature !== "string") {
    res.status(400).json({ data: null, error: "Ugyldig webhook." });
    return;
  }

  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ data: null, error: "Ugyldig webhook-body." });
    return;
  }

  let event: StripeWebhookEvent;
  try {
    // SECURITY: Stripe signature is verified before any database write.
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret,
    ) as StripeWebhookEvent;
  } catch {
    res.status(400).json({ data: null, error: "Ugyldig webhook-signatur." });
    return;
  }

  res.status(200).json({ data: { received: true }, error: null });

  void processStripeEvent(event).catch((error: unknown) => {
    console.error("Stripe webhook processing failed", {
      error: error instanceof Error ? error.message : String(error),
      eventType: event.type,
    });
  });
});

async function processStripeEvent(event: StripeWebhookEvent): Promise<void> {
  if (event.type === "customer.subscription.created") {
    const customerId = getStripeObjectIdFromPayload(event.data.object);
    if (!customerId) return;

    await updateTierByCustomer(customerId, "pro");
    return;
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    if (
      !subscription ||
      typeof subscription !== "object" ||
      (subscription as { status?: unknown }).status !== "active"
    ) {
      return;
    }

    const customerId = getStripeObjectIdFromPayload(subscription);
    if (!customerId) return;

    await updateTierByCustomer(customerId, "pro");
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    const customerId = getStripeObjectIdFromPayload(event.data.object);
    if (!customerId) return;

    await updateTierByCustomer(customerId, "free");
  }
}

async function updateTierByCustomer(
  stripeCustomerId: string,
  tier: "free" | "pro",
): Promise<void> {
  const supabase = createServerSupabase();
  // SECURITY: entitlement changes are keyed from verified Stripe customer ids only.
  const { error } = await supabase
    .from("profiles")
    .update({ tier })
    .eq("stripe_customer_id", stripeCustomerId);

  if (error) {
    throw error;
  }
}

function getStripeObjectIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const customer = (payload as { customer?: StripeCustomerReference }).customer;
  return getStripeObjectId(customer ?? null);
}

function getStripeObjectId(value: StripeCustomerReference): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

function createStripeClient(): StripeClient {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY must be set");
  }

  // SECURITY: Stripe secret key is used only in backend webhook handling.
  return new Stripe(secretKey);
}

export default stripeWebhookRouter;
