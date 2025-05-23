import {
  createSchema,
  definePermissions,
  table,
  string,
  number,
  relationships,
  ExpressionBuilder,
  ANYONE_CAN,
  boolean,
} from "@rocicorp/zero"

const timestamps = {
  time_created: number(),
  time_deleted: number().optional(),
} as const

const workspace = table("workspace")
  .columns({
    id: string(),
    slug: string(),
    ...timestamps,
  })
  .primaryKey("id")

const user = table("user")
  .columns({
    id: string(),
    workspace_id: string(),
    email: string(),
    name: string().optional(),
    time_created: number(),
    time_deleted: number().optional(),
    time_seen: number().optional(),
    color: number().optional(),
  })
  .primaryKey("workspace_id", "id")

const aws_account = table("aws_account")
  .columns({
    id: string(),
    workspace_id: string(),
    account_number: string(),
    region: string(),
    ...timestamps,
  })
  .primaryKey("workspace_id", "id")

const billing = table("billing")
  .columns({
    id: string(),
    workspace_id: string(),
    customer_id: string().optional(),
    balance: number(),
    reload: boolean().optional(),
    ...timestamps,
  })
  .primaryKey("workspace_id", "id")

const usage = table("usage")
  .columns({
    id: string(),
    workspace_id: string(),
    request_id: string().optional(),
    model: string(),
    input_tokens: number(),
    output_tokens: number(),
    cost: number(),
    ...timestamps,
  })
  .primaryKey("workspace_id", "id")

export const schema = createSchema({
  tables: [workspace, user, aws_account, billing, usage],
  relationships: [
    relationships(user, (r) => ({
      workspace: r.one({
        sourceField: ["workspace_id"],
        destSchema: workspace,
        destField: ["id"],
      }),
      users: r.many({
        sourceField: ["workspace_id"],
        destSchema: user,
        destField: ["workspace_id"],
      }),
    })),
    relationships(workspace, (r) => ({
      users: r.many({
        sourceField: ["id"],
        destSchema: user,
        destField: ["workspace_id"],
      }),
    })),
    relationships(aws_account, (r) => ({
      users: r.many({
        sourceField: ["workspace_id"],
        destSchema: user,
        destField: ["workspace_id"],
      }),
      workspace: r.one({
        sourceField: ["workspace_id"],
        destSchema: workspace,
        destField: ["id"],
      }),
    })),
    relationships(billing, (r) => ({
      users: r.many({
        sourceField: ["workspace_id"],
        destSchema: user,
        destField: ["workspace_id"],
      }),
      workspace: r.one({
        sourceField: ["workspace_id"],
        destSchema: workspace,
        destField: ["id"],
      }),
    })),
    relationships(usage, (r) => ({
      users: r.many({
        sourceField: ["workspace_id"],
        destSchema: user,
        destField: ["workspace_id"],
      }),
      workspace: r.one({
        sourceField: ["workspace_id"],
        destSchema: workspace,
        destField: ["id"],
      }),
    })),
  ],
})

export type Schema = typeof schema

type Auth = {
  sub: string
  properties: {
    accountID: string
    email: string
  }
}

export const permissions = definePermissions<Auth, Schema>(schema, () => {
  const allowWorkspace = (
    authData: Auth,
    q: ExpressionBuilder<Schema, keyof Schema["tables"]>,
  ) => q.exists("users", (u) => u.where("email", authData.sub))

  return {
    user: {
      row: {
        select: [
          (auth, q) => q.exists("users", (u) => u.where("email", auth.sub)),
        ],
        update: {
          preMutation: [allowWorkspace],
          postMutation: ANYONE_CAN,
        },
      },
    },
    workspace: {
      row: {
        select: [
          (auth, q) => q.exists("users", (u) => u.where("email", auth.sub)),
        ],
      },
    },
    aws_account: {
      row: {
        select: [
          (auth, q) => q.exists("users", (u) => u.where("email", auth.sub)),
        ],
      },
    },
    billing: {
      row: {
        select: [
          (auth, q) => q.exists("users", (u) => u.where("email", auth.sub)),
        ],
      },
    },
    usage: {
      row: {
        select: [
          (auth, q) => q.exists("users", (u) => u.where("email", auth.sub)),
        ],
      },
    },
  }
})
