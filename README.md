<p align="center">
  <a href="/">
    <picture>
      <source srcset="https://raw.githubusercontent.com/toolbeam/identity/main/opencontrol/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/toolbeam/identity/main/opencontrol/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/toolbeam/identity/main/opencontrol/logo-light.svg" alt="OpenControl logo">
    </picture>
  </a>
</p>
<p align="center">
  <a href="https://sst.dev/discord"><img alt="Discord" src="https://img.shields.io/discord/983865673656705025?style=flat-square&label=Discord" /></a>
  <a href="https://www.npmjs.com/package/opencontrol"><img alt="npm" src="https://img.shields.io/npm/v/opencontrol?style=flat-square" /></a>
  <a href="https://github.com/sst/opencontrol/actions/workflows/release.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/sst/opencontrol/release.yml?style=flat-square&branch=master" /></a>
</p>

---

OpenControl lets you control your infrastructure with AI.

- **Self-hosted**: Runs in your infrastructure with access to internal resources and functions from your codebase; deploys to AWS Lambda, Cloudflare Workers, or containers.
- **Unified gateway**: Generates a single HTTP endpoint that you can chat with or register with your AI client and it exposes all your tools.
- **Universal**: Works with any model that supports tool calling. Like the models from Anthropic, OpenAI, or Google.
- **Secure**: Supports authentication through any OAuth provider.

![OpenControl screenshot](www/src/assets/screenshot.png)

## Get started

1. **Install dependencies**

   ```bash
   npm install opencontrol hono @ai-sdk/anthropic
   ```

   Here are we are going to use Anthropic's Claude.

2. **Create the server**

   ```bash
   touch src/opencontrol.ts
   ```

   ```ts title=src/opencontrol.ts
   import { create } from "opencontrol"
   import { handle } from "hono/aws-lambda"

   const app = create({
     // model: ...,
     // tools: [ ]
   })

   export const handler = handle(app)
   ```

3. **Pick the model**

   ```diff lang=ts title=src/opencontrol.ts
   + import { Resource } from "sst"
   + import { createAnthropic } from "@ai-sdk/anthropic"

   const app = create({
   +  model: createAnthropic({
   +    apiKey: Resource.AnthropicKey.value,
   +  })("claude-3-7-sonnet-20250219")
   })
   ```

4. **Define your tools**

   ```diff lang=ts title=src/opencontrol.ts
   + import { tool } from "opencontrol/tool"
   + import { Inventory } from "@acme/core/inventory/index"

   + const inventory = tool({
   +   name: "inventory_record",
   +   description: "Record new inventory event to track in or out amounts",
   +   args: Inventory.record.schema,
   +   async run(input) {
   +     return Inventory.record(input)
   +   }
   + })

   const app = create({
     tools: [
   +    inventory
     ]
   })
   ```

5. **Infrastructure**

   We are using SST here, but since **OpenControl is just a Hono app, you can deploy it however you want**.

   ```bash
   touch sst.config.ts
   ```

   ```ts title="sst.config.ts" {1,6}
   const anthropicKey = new sst.Secret("AnthropicKey")

   const server = new sst.aws.OpenControl("MyServer", {
     server: {
       handler: "src/opencontrol.handler",
       link: [anthropicKey],
     },
   })
   ```

   We are defining a secret for the Anthropic API key and linking it to our OpenControl server.

6. **Link any resources**

   ```ts title="sst.config.ts" {6}
   const bucket = new sst.aws.Bucket("MyBucket")

   const server = new sst.aws.OpenControl("MyServer", {
     server: {
       handler: "src/opencontrol.handler",
       link: [bucket],
     },
   })
   ```

   If your tools need to access to your resources, you can link them as well.

7. **Grant permissions**

   If you are using the AWS tool, you'll need to give your OpenControl server permissions to access your AWS account.

   ```ts title="sst.config.ts" {4-6}
   const server = new sst.aws.OpenControl("MyServer", {
     server: {
       handler: "src/opencontrol.handler",
       policies: $dev
         ? ["arn:aws:iam::aws:policy/AdministratorAccess"]
         : ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
     },
   })
   ```

   Here we are giving it admin access in dev but read-only access in prod.

8. **Deploy**

   Currently, OpenControl uses basic auth but we'll be adding support for OAuth soon.

   ```ts title="sst.config.ts"
   return {
     OpenControlUrl: server.url,
     OpenControlPassword: server.password,
   }
   ```

   You can print out the URL of your server and it's password and deploy.

   ```bash
   sst deploy
   ```

Now head over to the URL, login with the password, and you can use AI to talk to your infrastructure.

## Examples

Check out how [Terminal](https://www.terminal.shop/) uses OpenControl.

- [Server](https://github.com/terminaldotshop/terminal/blob/dev/packages/functions/src/opencontrol.ts)
- [Infrastructure](https://github.com/terminaldotshop/terminal/blob/dev/infra/opencontrol.ts)

## Tools

Here are some examples of the tools you can use with OpenControl.

- **AWS**

  ```ts title=src/opencontrol.ts
  import { z } from "zod"
  import AWS from "aws-sdk"
  import { tool } from "opencontrol/tool"

  const aws = tool({
    name: "aws",
    description: "Make a call to the AWS SDK for JavaScript v2",
    args: z.object({
      client: z.string().describe("Class name of the client to use"),
      command: z.string().describe("Command to call on the client"),
      args: z
        .record(z.string(), z.any())
        .optional()
        .describe("Arguments to pass to the command"),
    }),
    async run(input) {
      // @ts-ignore
      const client = new AWS[input.client]()
      return await client[input.command](input.args).promise()
    },
  })
  ```

- **Stripe**

  ```ts title=src/opencontrol.ts
  import { z } from "zod"
  import { tool } from "opencontrol/tool"

  const stripe = tool({
    name: "stripe",
    description: "make a call to the stripe api",
    args: z.object({
      method: z.string().describe("HTTP method to use"),
      path: z.string().describe("Path to call"),
      query: z.record(z.string()).optional().describe("Query params"),
      contentType: z.string().optional().describe("HTTP content type to use"),
      body: z.string().optional().describe("HTTP body to use if it is not GET"),
    }),
    async run(input) {
      const url = new URL("https://api.stripe.com" + input.path)
      if (input.query) url.search = new URLSearchParams(input.query).toString()
      const response = await fetch(url.toString(), {
        method: input.method,
        headers: {
          Authorization: `Bearer ${Resource.StripeSecret.value}`,
          "Content-Type": input.contentType,
        },
        body: input.body ? input.body : undefined,
      })
      if (!response.ok) throw new Error(await response.text())
      return response.text()
    },
  })
  ```

- **SQL Database**

  ```ts title=src/opencontrol.ts
  import { z } from "zod"
  import { tool } from "opencontrol/tool"
  import { db } from "@acme/core/drizzle/index"

  const databaseRead = tool({
    name: "database_query_readonly",
    description:
      "Readonly database query for MySQL, use this if there are no direct tools",
    args: z.object({ query: z.string() }),
    async run(input) {
      return db.transaction(async (tx) => tx.execute(input.query), {
        accessMode: "read only",
        isolationLevel: "read committed",
      })
    },
  })

  const databaseWrite = tool({
    name: "database_query_write",
    description:
      "DANGEROUS operation that writes to the database. You MUST triple check with the user before using this tool - show them the query you are about to run.",
    args: z.object({ query: z.string() }),
    async run(input) {
      return db.transaction(async (tx) => tx.execute(input.query), {
        isolationLevel: "read committed",
      })
    },
  })
  ```

---

OpenControl is created by the maintainers of [SST](https://sst.dev).

**Join our community** [Discord](https://sst.dev/discord) | [YouTube](https://www.youtube.com/c/sst-dev) | [X.com](https://x.com/SST_dev)
