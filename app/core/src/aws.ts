import { z } from "zod"
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts"
import { Actor } from "./actor"
import { fn } from "./util/fn"

export namespace Aws {
  export const assumeRole = fn(
    z.object({
      accountNumber: z.string(),
      region: z.string(),
    }),
    async (input) => {
      const workspaceID = Actor.workspace()

      const sts = new STSClient({})
      const result = await sts.send(
        new AssumeRoleCommand({
          RoleArn: `arn:aws:iam::${input.accountNumber}:role/opencontrol-${workspaceID}-${input.region}`,
          RoleSessionName: "opencontrol",
          ExternalId: workspaceID,
          DurationSeconds: 3600,
        }),
      )
      if (!result.Credentials) throw new Error("Failed to assume role")

      return {
        accessKeyId: result.Credentials.AccessKeyId!,
        secretAccessKey: result.Credentials.SecretAccessKey!,
        sessionToken: result.Credentials.SessionToken!,
      }
    },
  )
}
