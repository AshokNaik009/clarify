# [BILLING-42] Add Stripe-backed subscription cancellation

## Goal
Allow customers on the Pro plan to cancel from the dashboard. The Stripe subscription is cancelled at period end; the local row's `status` flips to `pending_cancellation`.

## Acceptance Criteria
- POST /api/billing/cancel cancels the active subscription via Stripe API.
- Subscription status persists as `pending_cancellation` until the period ends.
- A toast confirms cancellation in the UI (`src/dashboard/Billing.tsx`).
- Webhook handler updates `status` to `cancelled` when Stripe sends the period-end event.

## Constraints
- Reuse existing Stripe client in `src/lib/stripe.ts`.
- No new top-level dependencies.
