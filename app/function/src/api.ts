import { createClient } from "@openauthjs/openauth/client"
import { Actor } from "@opencontrol/core/actor.js"
import { Log } from "@opencontrol/core/util/log.js"
import { Workspace } from "@opencontrol/core/workspace/index.js"
import { Database, eq } from "@opencontrol/core/drizzle/index.js"
import { Hono } from "hono"
import { handle } from "hono/aws-lambda"
import { HTTPException } from "hono/http-exception"
import { Resource } from "sst"
import { createAnthropic } from "@ai-sdk/anthropic"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { APICallError } from "ai"
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts"
import { WorkspaceTable } from "@opencontrol/core/workspace/workspace.sql.js"
import { AwsAccountTable } from "@opencontrol/core/aws.sql.js"
import { Identifier } from "@opencontrol/core/identifier.js"

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

const app = new Hono()
  .use(async (c, next) => {
    const authorization = c.req.header("Authorization")
    if (authorization) {
      const [type, token] = authorization.split(" ")
      if (type !== "Bearer") {
        throw new HTTPException(401, {
          message: "Invalid authorization header",
        })
      }
      const verified = await client.verify(token)
      if (verified.err)
        throw new HTTPException(401, {
          message: verified.err.message,
        })

      return Actor.provide(
        verified.subject.type as any,
        verified.subject.properties,
        next,
      )
    }
    return Actor.provide("public", {}, next)
  })
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
  .post("/ai_generate", zValidator("json", z.custom<any>()), async (c) => {
    const body = c.req.valid("json")
    try {
      const result = await model.doGenerate(body)
      return c.json(result)
    } catch (error) {
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
      const sts = new STSClient({})
      await sts.send(
        new AssumeRoleCommand({
          RoleArn: role,
          RoleSessionName: "opencontrol",
          ExternalId: workspaceID,
          DurationSeconds: 3600,
        }),
      )

      const accountNumber = role.split(":")[4]
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
            ],
            set: {
              region,
              timeDeleted: null,
            },
          }),
      )

      return c.json({
        message: "ok",
      })
    },
  )

export type ApiType = typeof app
export const handler = handle(app)
