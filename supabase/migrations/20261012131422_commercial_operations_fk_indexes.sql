-- OPT-010 Phase 01: cover the commercial Price FK introduced on Checkout.
-- Supabase performance advisor reports composite foreign keys without a
-- matching leading index, so keep Offer and Price attribution independently indexed.

create index billing_checkout_commercial_price_idx
  on public.billing_checkout_intents(platform_id, commercial_price_id, created_at desc)
  where commercial_price_id is not null;
