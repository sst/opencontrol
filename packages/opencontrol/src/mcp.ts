import {
  CallToolRequestSchema,
  CallToolResult,
  InitializeRequestSchema,
  InitializeResult,
  JSONRPCRequest,
  JSONRPCResponse,
  ListResourcesRequestSchema,
  ListResourcesResult,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResult,
  ListToolsRequestSchema,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { Tool } from "./tool.js"
import { zodToJsonSchema } from "zod-to-json-schema"

const RequestSchema = z.union([
  InitializeRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
])
type RequestSchema = z.infer<typeof RequestSchema>

export function createMcp(input: { tools: Tool[] }) {
  return {
    async process(message: JSONRPCRequest) {
      const parsed = RequestSchema.parse(message)

      const result = await (async () => {
        if (parsed.method === "initialize")
          return {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "opencontrol",
              version: "0.0.1",
            },
          } satisfies InitializeResult
        if (parsed.method === "resources/list") {
          return {
            resources: [],
          } satisfies ListResourcesResult
        }
        if (parsed.method === "resources/templates/list") {
          return {
            resourceTemplates: [],
          } satisfies ListResourceTemplatesResult
        }
        if (parsed.method === "tools/list") {
          return {
            tools: input.tools.map((tool) => ({
              name: tool.name,
              inputSchema: zodToJsonSchema(
                tool.args || (z.object({}) as any),
                "args",
              ).definitions!["args"] as any,
              description: tool.description,
            })),
          } satisfies ListToolsResult
        }

        if (parsed.method === "tools/call") {
          const tool = input.tools.find(
            (tool) => tool.name === parsed.params.name,
          )
          if (!tool) throw new Error("tool not found")

          let args = parsed.params.arguments
          if (tool.args) {
            const validated = await tool.args["~standard"].validate(args)
            if (validated.issues) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(validated.issues),
                  },
                ],
              } satisfies CallToolResult
            }
            args = validated.value as any
          }

          return tool
            .run(args)
            .catch(
              (error) =>
                ({
                  isError: true,
                  content: [
                    {
                      type: "text",
                      text: error.message,
                    },
                  ],
                }) satisfies CallToolResult,
            )
            .then(
              (result) =>
                ({
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(result, null, 2),
                    },
                  ],
                }) satisfies CallToolResult,
            )
        }

        throw new Error("not implemented")
      })()

      return {
        jsonrpc: "2.0",
        id: message.id,
        result,
      } satisfies JSONRPCResponse
    },
  }
}
