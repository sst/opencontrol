import { templateUrl } from "./connect"
import { postgres } from "./postgres"
import { auth, router, vpc } from "./shared"
import { domain, subdomain } from "./stage"
import { zero } from "./zero"

export const secret = {
  AnthropicApiKey: new sst.Secret("AnthropicApiKey"),
  StripeSecretKey: new sst.Secret("StripeSecretKey"),
  StripeWebhookSecret: new sst.Secret("StripeWebhookSecret"),
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
