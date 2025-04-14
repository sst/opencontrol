import { pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { timestamps, workspaceColumns } from "./drizzle/types"
import { workspaceIndexes } from "./workspace/workspace.sql"

export const AwsAccountTable = pgTable(
  "aws_account",
  {
    ...workspaceColumns,
    ...timestamps,
    accountNumber: varchar("account_number", { length: 12 }).notNull(),
    region: varchar("region", { length: 32 }).notNull(),
  },
  (table) => [
    ...workspaceIndexes(table),
    uniqueIndex("account_number_region").on(
      table.workspaceID,
      table.accountNumber,
      table.region,
    ),
  ],
)
