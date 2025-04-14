import AWS from "aws-sdk"
import { createClient } from "@openauthjs/openauth/client"
import { Actor } from "@opencontrol/core/actor.js"
import { Log } from "@opencontrol/core/util/log.js"
import { Workspace } from "@opencontrol/core/workspace/index.js"
import {
  Database,
  eq,
  and,
  sql,
  isNull,
} from "@opencontrol/core/drizzle/index.js"
import { Hono, MiddlewareHandler } from "hono"
import { handle } from "hono/aws-lambda"
import { HTTPException } from "hono/http-exception"
import { Resource } from "sst"
import { createAnthropic } from "@ai-sdk/anthropic"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { APICallError } from "ai"
import { WorkspaceTable } from "@opencontrol/core/workspace/workspace.sql.js"
import { AwsAccountTable } from "@opencontrol/core/aws.sql.js"
import { Identifier } from "@opencontrol/core/identifier.js"
import { Aws } from "@opencontrol/core/aws.js"
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListToolsResult,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js"
import { UserTable } from "@opencontrol/core/user/user.sql.js"
import { Billing } from "@opencontrol/core/billing.js"
import { centsToMicroCents } from "@opencontrol/core/util/price.js"
import { BillingTable, PaymentTable } from "@opencontrol/core/billing.sql.js"
import {
  CloudFormationClient,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation"

const models = {
  "claude-3-7-sonnet-20250219": {
    cost: {
      input: 4 / 1000000,
      output: 20 / 1000000,
    },
  },
}

const model = createAnthropic({
  apiKey: Resource.AnthropicApiKey.value,
})("claude-3-7-sonnet-20250219")

const client = createClient({
  clientID: "api",
  issuer: Resource.Auth.url,
})

const log = Log.create({
  namespace: "api",
})

export const AuthMiddleware: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header("authorization")
  if (!authorization) {
    return Actor.provide("public", {}, next)
  }
  const token = authorization.split(" ")[1]
  if (!token)
    throw new HTTPException(403, {
      message: "Bearer token is required.",
    })

  const verified = await client.verify(token)
  if (verified.err) {
    throw new HTTPException(403, {
      message: "Invalid token.",
    })
  }
  let subject = verified.subject as Actor.Info
  if (subject.type === "account") {
    const workspaceID = c.req.header("x-opencontrol-workspace")
    const email = subject.properties.email
    if (workspaceID) {
      const user = await Database.use((tx) =>
        tx
          .select({
            id: UserTable.id,
            workspaceID: UserTable.workspaceID,
            email: UserTable.email,
          })
          .from(UserTable)
          .where(
            and(
              eq(UserTable.email, email),
              eq(UserTable.workspaceID, workspaceID),
            ),
          )
          .then((rows) => rows[0]),
      )
      if (!user)
        throw new HTTPException(403, {
          message: "You do not have access to this workspace.",
        })
      subject = {
        type: "user",
        properties: {
          userID: user.id,
          workspaceID: workspaceID,
          email: user.email,
        },
      }
    }
  }
  await Actor.provide(subject.type, subject.properties, next)
}

const app = new Hono()
  .use(AuthMiddleware)
  .get("/rest/account", async (c, next) => {
    const account = Actor.assert("account")
    let workspaces = await Workspace.list()
    if (workspaces.length === 0) {
      await Workspace.create()
      workspaces = await Workspace.list()
    }
    return c.json({
      id: account.properties.accountID,
      email: account.properties.email,
      workspaces,
    })
  })
  .post(
    "/billing/checkout",
    zValidator(
      "json",
      z.custom<{
        success_url: string
        cancel_url: string
      }>(),
    ),
    async (c) => {
      const account = Actor.assert("user")

      const body = await c.req.json()

      const customer = await Billing.get()
      const session = await Billing.stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "OpenControl credits",
              },
              unit_amount: 2000, // $20 minimum
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          setup_future_usage: "on_session",
        },
        ...(customer.customerID
          ? { customer: customer.customerID }
          : {
              customer_email: account.properties.email,
              customer_creation: "always",
            }),
        metadata: {
          workspaceID: Actor.workspace(),
        },
        currency: "usd",
        payment_method_types: ["card"],
        success_url: body.success_url,
        cancel_url: body.cancel_url,
      })

      return c.json({
        url: session.url,
      })
    },
  )
  .post("/billing/portal", async (c) => {
    const body = await c.req.json()

    const customer = await Billing.get()
    if (!customer?.customerID) {
      throw new Error("No stripe customer ID")
    }

    const session = await Billing.stripe.billingPortal.sessions.create({
      customer: customer.customerID,
      return_url: body.return_url,
    })

    return c.json({
      url: session.url,
    })
  })
  .post("/ai_generate", zValidator("json", z.custom<any>()), async (c) => {
    const body = c.req.valid("json")

    // Check balance
    const customer = await Billing.get()
    if (customer.balance <= 0) {
      return c.json(
        {
          err: "balance",
          message: "Insufficient balance",
        },
        500,
      )
    }

    try {
      const result = await model.doGenerate(body)

      // Update usage
      const modelId = result.response?.modelId
      if (modelId !== "claude-3-7-sonnet-20250219")
        throw new Error("Unsupported model")
      const inputTokens = result.usage.promptTokens
      const outputTokens = result.usage.completionTokens
      const cost =
        (inputTokens * models[modelId].cost.input +
          outputTokens * models[modelId].cost.output) *
        100
      const newBalance = await Billing.consume({
        requestID: result.response?.id,
        model: modelId,
        inputTokens,
        outputTokens,
        costInCents: cost,
      })

      // Reload balance
      if (customer.customerID && newBalance < centsToMicroCents(500)) {
        const amount = 2000 // $20
        const ret = await Billing.stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
          customer: customer.customerID!,
          payment_method: customer.paymentMethodID!,
          metadata: {
            workspaceID: Actor.workspace(),
          },
          confirm: true,
        })
        await Database.transaction(async (tx) => {
          await tx
            .update(BillingTable)
            .set({
              balance: sql`${BillingTable.balance} + ${centsToMicroCents(amount)}`,
            })
            .where(eq(BillingTable.workspaceID, Actor.workspace()))
          await tx.insert(PaymentTable).values({
            workspaceID: Actor.workspace(),
            id: Identifier.create("payment"),
            amount: centsToMicroCents(amount),
            paymentID: ret.id,
            customerID: customer.customerID,
          })
        })
      }

      return c.json(result)
    } catch (error) {
      console.log(error)
      if (error instanceof APICallError) {
        return c.json(
          {
            err: "unknown",
            message: error.message,
          },
          (error.statusCode || 500) as any,
        )
      }
    }
  })
  .post(
    "/integration/aws/disconnect",
    zValidator(
      "json",
      z.custom<{
        awsAccountID: string
      }>(),
    ),
    async (c) => {
      const body = c.req.valid("json")

      const awsAccount = await Database.use((tx) =>
        tx
          .select({
            region: AwsAccountTable.region,
            accountNumber: AwsAccountTable.accountNumber,
          })
          .from(AwsAccountTable)
          .where(
            and(
              eq(AwsAccountTable.workspaceID, Actor.workspace()),
              eq(AwsAccountTable.id, body.awsAccountID),
              isNull(AwsAccountTable.timeDeleted),
            ),
          )
          .then((rows) => rows[0]),
      )
      if (!awsAccount) return c.json({ message: "ok" })

      // Delete CloudFormation stack
      // note: if stack does not exist, DeleteStackCommand does NOT throw an error
      const credentials = await Aws.assumeRole({
        accountNumber: awsAccount.accountNumber,
        region: awsAccount.region,
      })
      const cfn = new CloudFormationClient({
        credentials,
        region: awsAccount.region,
      })
      await cfn.send(
        new DeleteStackCommand({
          StackName: `OpenControl-${Actor.workspace().replace(/_/g, "-")}`,
        }),
      )

      await Database.use((tx) =>
        tx
          .update(AwsAccountTable)
          .set({
            timeDeleted: new Date(),
          })
          .where(
            and(
              eq(AwsAccountTable.workspaceID, Actor.workspace()),
              eq(AwsAccountTable.id, body.awsAccountID),
              eq(AwsAccountTable.region, awsAccount.region),
            ),
          ),
      )

      return c.json({ message: "ok" })
    },
  )
  .post(
    "/aws/connect",
    zValidator(
      "json",
      z.custom<{
        workspaceID: string
        region: string
        role: string
      }>(),
    ),
    async (c) => {
      const { workspaceID, region, role } = c.req.valid("json")
      return Actor.provide("system", { workspaceID }, async () => {
        const accountNumber = role.split(":")[4]

        // Validate workspace id
        const workspace = await Database.use((tx) =>
          tx
            .select({})
            .from(WorkspaceTable)
            .where(eq(WorkspaceTable.id, workspaceID)),
        )
        if (!workspace)
          throw new HTTPException(500, { message: "Invalid workspace ID" })

        // Validate role by assuming it
        if (!role.endsWith(`role/opencontrol-${workspaceID}-${region}`))
          throw new HTTPException(500, { message: "Invalid role name" })
        await Aws.assumeRole({ accountNumber, region })

        await Database.use((tx) =>
          tx
            .insert(AwsAccountTable)
            .values({
              id: Identifier.create("awsAccount"),
              workspaceID,
              accountNumber,
              region,
            })
            .onConflictDoUpdate({
              target: [
                AwsAccountTable.workspaceID,
                AwsAccountTable.accountNumber,
                AwsAccountTable.region,
              ],
              set: {
                region,
                timeDeleted: null,
              },
            }),
        )

        return c.json({ message: "ok" })
      })
    },
  )
  .post(
    "/aws/disconnect",
    zValidator(
      "json",
      z.custom<{
        workspaceID: string
        region: string
        role: string
      }>(),
    ),
    async (c) => {
      const { workspaceID, region, role } = c.req.valid("json")
      return Actor.provide("system", { workspaceID }, async () => {
        const accountNumber = role.split(":")[4]

        await Database.use((tx) =>
          tx
            .update(AwsAccountTable)
            .set({
              timeDeleted: new Date(),
            })
            .where(
              and(
                eq(AwsAccountTable.workspaceID, workspaceID),
                eq(AwsAccountTable.accountNumber, accountNumber),
                eq(AwsAccountTable.region, region),
              ),
            ),
        )

        return c.json({
          message: "ok",
        })
      })
    },
  )
  .post(
    "/mcp",
    zValidator(
      "json",
      z.discriminatedUnion("method", [
        ListToolsRequestSchema,
        CallToolRequestSchema,
      ]),
    ),
    async (c) => {
      const body = c.req.valid("json")
      switch (body.method) {
        case "tools/list": {
          const result: ListToolsResult = {
            tools: await Database.use((tx) =>
              tx
                .select({})
                .from(AwsAccountTable)
                .where(
                  and(
                    eq(AwsAccountTable.workspaceID, Actor.workspace()),
                    isNull(AwsAccountTable.timeDeleted),
                  ),
                ),
            ).then((rows) =>
              rows.map((item): ListToolsResult["tools"][number] => ({
                name: "aws",
                description: `This uses aws sdk v2 in javascript to execute aws commands
                this is roughly how it works
                \`\`\`js
                import aws from "aws-sdk";
                aws[service][method](params)
                \`\`\``,
                inputSchema: {
                  type: "object",
                  properties: {
                    service: {
                      type: "string",
                      description:
                        "name of the aws service in the format aws sdk v2 uses, like S3 or EC2",
                    },
                    method: {
                      type: "string",
                      description:
                        "name of the aws method in the format aws sdk v2 uses",
                    },
                    params: {
                      type: "string",
                      description: "params for the aws method in json format",
                    },
                  },
                },
              })),
            ),
          }
          return c.json(result)
        }
        case "tools/call": {
          try {
            if (body.params.name === "aws") {
              const awsAccount = await Database.use((tx) =>
                tx
                  .select({
                    accountNumber: AwsAccountTable.accountNumber,
                    region: AwsAccountTable.region,
                  })
                  .from(AwsAccountTable)
                  .where(
                    and(
                      eq(AwsAccountTable.workspaceID, Actor.workspace()),
                      isNull(AwsAccountTable.timeDeleted),
                    ),
                  ),
              )
              if (!awsAccount) {
                throw new Error(
                  "AWS integration not found. Please connect your AWS account first.",
                )
              }

              // Assume role
              const credentials = await Aws.assumeRole({
                accountNumber: awsAccount[0].accountNumber,
                region: awsAccount[0].region,
              })

              const { service, method, params } = body.params.arguments || {}

              /* @ts-expect-error */
              const client = AWS[service]
              if (!client) {
                throw new Error(
                  `service "${service}" is not found in aws sdk v2`,
                )
              }
              const instance = new client({ credentials })
              if (!instance[method]) {
                throw new Error(
                  `method "${method}" is not found in on the ${service} service of aws sdk v2`,
                )
              }
              const response = await instance[method](
                JSON.parse(params as string),
              ).promise()
              const result: CallToolResult = {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(response),
                  },
                ],
              }
              return c.json(result)
            }
          } catch (error: any) {
            const result: CallToolResult = {
              isError: true,
              content: [
                {
                  type: "text",
                  text: error.toString(),
                },
              ],
            }
            return c.json(result)
          }
          throw new HTTPException(500, {
            message: `tool "${body.params.name}" is not found`,
          })
        }
      }
    },
  )
  .post("/stripe/webhook", async (c) => {
    // validate signature
    const body = Billing.stripe.webhooks.constructEvent(
      await c.req.text(),
      c.req.header("stripe-signature")!,
      Resource.StripeWebhookSecret.value,
    )

    console.log(body.type, JSON.stringify(body, null, 2))
    if (body.type === "checkout.session.completed") {
      const workspaceID = body.data.object.metadata?.workspaceID
      const customerID = body.data.object.customer as string
      const paymentID = body.data.object.payment_intent as string
      const amount = body.data.object.amount_total

      if (!workspaceID) throw new Error("Workspace ID not found")
      if (!customerID) throw new Error("Customer ID not found")
      if (!amount) throw new Error("Amount not found")
      if (!paymentID) throw new Error("Payment ID not found")

      await Actor.provide("system", { workspaceID }, async () => {
        const customer = await Billing.get()
        if (customer?.customerID && customer.customerID !== customerID)
          throw new Error("Customer ID mismatch")

        // set customer metadata
        if (!customer?.customerID) {
          await Billing.stripe.customers.update(customerID, {
            metadata: {
              workspaceID,
            },
          })
        }

        // get payment method for the payment intent
        const paymentIntent = await Billing.stripe.paymentIntents.retrieve(
          paymentID,
          {
            expand: ["payment_method"],
          },
        )
        const paymentMethod = paymentIntent.payment_method
        if (!paymentMethod || typeof paymentMethod === "string")
          throw new Error("Payment method not expanded")

        await Database.transaction(async (tx) => {
          await tx
            .update(BillingTable)
            .set({
              balance: sql`${BillingTable.balance} + ${centsToMicroCents(amount)}`,
              customerID,
              paymentMethodID: paymentMethod.id,
              paymentMethodLast4: paymentMethod.card!.last4,
            })
            .where(eq(BillingTable.workspaceID, workspaceID))
          await tx.insert(PaymentTable).values({
            workspaceID,
            id: Identifier.create("payment"),
            amount: centsToMicroCents(amount),
            paymentID,
            customerID,
          })
        })
      })
    }

    console.log("finished handling")

    return c.json("ok", 200)
  })

export type ApiType = typeof app
export const handler = handle(app)
