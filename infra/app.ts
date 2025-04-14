import { templateUrl } from "./connect"
import { postgres } from "./postgres"
import { auth, router, vpc } from "./shared"
import { subdomain } from "./stage"
import { zero } from "./zero"
import { WebhookEndpoint } from "pulumi-stripe"

export const secret = {
  AnthropicApiKey: new sst.Secret("AnthropicApiKey"),
  StripeSecretKey: new sst.Secret(
    "StripeSecretKey",
    process.env.STRIPE_SECRET_KEY!,
  ),
}
const AllSecrets = Object.values(secret)

/*
const opencontrol = new sst.aws.OpenControl("OpenControl", {
  server: {
    handler: "app/function/src/opencontrol.handler",
    link: [...AllSecrets, postgres],
    policies: ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
  },
})
router.route("opencontrol-" + domain, opencontrol.url)
*/

export const api = new sst.aws.Function("Api", {
  vpc,
  handler: "app/function/src/api.handler",
  link: [auth, postgres, ...AllSecrets],
  permissions: [{ actions: ["sts:*"], resources: ["*"] }],
  url: {
    route: {
      router,
      domain: subdomain("api"),
    },
  },
})

const docs = new sst.aws.Astro("Docs", {
  route: {
    router,
    path: "/docs",
  },
  path: "www",
  dev: {
    url: "http://localhost:4321/docs",
  },
})

new sst.aws.StaticSite("Web", {
  route: {
    router,
  },
  errorPage: "fallback.html",
  build: {
    command: "bun run build",
    output: "dist/client",
  },
  environment: {
    VITE_DOCS_URL: docs.url,
    VITE_API_URL: api.url,
    VITE_AUTH_URL: auth.properties.url,
    VITE_ZERO_URL: zero.url,
    VITE_TEMPLATE_URL: templateUrl,
  },
  path: "app/web",
})

const stripeWebhook = new WebhookEndpoint("StripeWebhook", {
  url: $interpolate`${api.url}/stripe/webhook`,
  enabledEvents: [
    "checkout.session.async_payment_failed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.completed",
    "checkout.session.expired",
    "customer.created",
    "customer.deleted",
    "customer.updated",
    "customer.discount.created",
    "customer.discount.deleted",
    "customer.discount.updated",
    "customer.source.created",
    "customer.source.deleted",
    "customer.source.expiring",
    "customer.source.updated",
    "customer.subscription.created",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.pending_update_applied",
    "customer.subscription.pending_update_expired",
    "customer.subscription.resumed",
    "customer.subscription.trial_will_end",
    "customer.subscription.updated",
    "customer.tax_id.created",
    "customer.tax_id.deleted",
    "customer.tax_id.updated",
  ],
})
api.addEnvironment({
  STRIPE_WEBHOOK_SECRET: stripeWebhook.secret,
})
