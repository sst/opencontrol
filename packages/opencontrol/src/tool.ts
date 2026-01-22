import { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec"
import { z } from "zod"

type Schema = StandardSchemaV1 & StandardJSONSchemaV1

export interface Tool<Args extends undefined | Schema = undefined | Schema> {
  name: string
  description: string
  args?: Args
  run: Args extends Schema
    ? (args: StandardSchemaV1.InferOutput<Args>) => Promise<any>
    : () => Promise<any>
}

export function tool<Args extends undefined | Schema>(input: Tool<Args>) {
  return input
}

tool({
  name: "foo",
  description: "bar",
  args: z.object({
    foo: z.string(),
  }),
  async run(args) {},
})
