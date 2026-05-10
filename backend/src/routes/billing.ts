import { Router } from "express";
import Stripe from "stripe";
import { createServerSupabase } from "../lib/supabase";
import { authMiddleware } from "../middleware/auth";

interface CheckoutResponse {
  url: string;
}

interface PortalResponse {
  url: string;
}

interface BillingProfile {
  id: string;
  email: string;
  stripe_customer_id: string | null;
}

type StripeClient = InstanceType<typeof Stripe>;

const billingRouter = Router();

billingRouter.post("/checkout", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ data: null, error: "Du må logge inn." });
      return;
    }

    const stripe = createStripeClient();
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    const frontendUrl = process.env.FRONTEND_URL;

    if (!priceId || !frontendUrl) {
      res
        .status(500)
        .json({ data: null, error: "Betaling er ikke konfigurert." });
      return;
    }

    const supabase = createServerSupabase();
    // SECURITY: billing profile lookup is scoped to the authenticated JWT user only.
    console.log("[billing/checkout] fetching profile for user:", userId);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, stripe_customer_id")
      .eq("id", userId)
      .single();
    console.log("[billing/checkout] profile result:", { profile, profileError });

    if (profileError || !profile) {
      console.error("[billing/checkout] profile fetch failed:", {
        userId,
        code: profileError?.code,
        message: profileError?.message,
      });
      res
        .status(500)
        .json({ data: null, error: "Kunne ikke hente brukerprofil." });
      return;
    }

    const customerId = await getOrCreateCustomer(
      stripe,
      profile as BillingProfile,
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/settings?billing=success`,
      cancel_url: `${frontendUrl}/settings?billing=cancelled`,
      allow_promotion_codes: true,
      metadata: {
        userId,
      },
      subscription_data: {
        metadata: {
          userId,
        },
      },
    });

    if (!session.url) {
      res
        .status(500)
        .json({ data: null, error: "Kunne ikke opprette betalingslenke." });
      return;
    }

    const response: CheckoutResponse = { url: session.url };
    res.json({ data: response, error: null });
  } catch (error) {
    console.error("Stripe checkout failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    res
      .status(500)
      .json({ data: null, error: "Kunne ikke opprette betalingslenke." });
  }
});

billingRouter.post("/portal", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ data: null, error: "Du må logge inn." });
      return;
    }

    const stripe = createStripeClient();
    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      res
        .status(500)
        .json({ data: null, error: "Betaling er ikke konfigurert." });
      return;
    }

    const supabase = createServerSupabase();
    // SECURITY: portal access is only created for the authenticated user's stored Stripe customer.
    console.log("[billing/portal] fetching profile for user:", userId);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();
    console.log("[billing/portal] profile result:", { profile, profileError });

    if (profileError || !profile) {
      console.error("[billing/portal] profile fetch failed:", {
        userId,
        code: profileError?.code,
        message: profileError?.message,
      });
      res
        .status(500)
        .json({ data: null, error: "Kunne ikke hente brukerprofil." });
      return;
    }

    if (!profile.stripe_customer_id) {
      res.status(400).json({
        data: null,
        error: "Du har ikke et aktivt Stripe-kundeforhold ennå.",
      });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${frontendUrl}/settings`,
    });

    const response: PortalResponse = { url: session.url };
    res.json({ data: response, error: null });
  } catch (error) {
    console.error("Stripe portal failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    res
      .status(500)
      .json({ data: null, error: "Kunne ikke åpne abonnementssiden." });
  }
});

async function getOrCreateCustomer(
  stripe: StripeClient,
  profile: BillingProfile,
): Promise<string> {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: profile.email,
    metadata: {
      userId: profile.id,
    },
  });

  const supabase = createServerSupabase();
  // SECURITY: Stripe customer id is written only to the authenticated user's profile.
  const { error } = await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", profile.id);

  if (error) {
    throw error;
  }

  return customer.id;
}

function createStripeClient(): StripeClient {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY must be set");
  }

  // SECURITY: Stripe secret key is used only in backend routes.
  return new Stripe(secretKey);
}

export default billingRouter;
