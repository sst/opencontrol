import { Button } from "../../ui/button"
import { IconArrowRight } from "../../ui/svg/icons"
import { createSignal, For } from "solid-js"
import { createToolCaller } from "./components/tool"
import { useApi } from "../components/context-api"
import { useZero } from "../components/context-zero"
import { useWorkspace } from "../components/context-workspace"
import { useQuery } from "@rocicorp/zero/solid"
import style from "./index.module.css"

export default function Index() {
  const api = useApi()
  const zero = useZero()
  const workspace = useWorkspace()
  const [awsAccounts] = useQuery(() => {
    return zero.query.aws_account.where("workspace_id", workspace.id)
  })

  // Function to check if there are any active AWS integrations
  const hasActiveIntegrations = () => {
    const accounts = awsAccounts()
    if (!accounts || accounts.length === 0) return false
    return accounts.some((account) => !account.time_deleted)
  }

  const toolCaller = createToolCaller({
    tool: {
      async list() {
        const response = await api.mcp
          .$post({
            json: {
              method: "tools/list",
              params: {},
            },
          })
          .then((r) => r.json() as any)
        return response.tools
      },
      async call(input) {
        return await api.mcp
          .$post({
            json: {
              method: "tools/call",
              params: {
                name: input.name,
                arguments: input.arguments,
              },
            },
          })
          .then((r) => r.json() as any)
      },
    },
    generate: async (prompt) => {
      return api.ai_generate
        .$post({
          json: prompt,
        })
        .then((r) => r.json() as any)
    },
    onPromptUpdated: () => {},
  })

  return (
    <div class={style.root}>
      <div data-slot="messages" data-max-width>
        <For each={toolCaller.prompt}>
          {(item) => {
            return (
              <>
                {item.role === "user" && item.content[0]?.type === "text" && (
                  <div data-component="message" data-user>
                    {item.content[0].text}
                  </div>
                )}
                {item.role === "assistant" &&
                  item.content[0]?.type === "text" && (
                    <div data-component="message" data-assistant>
                      {item.content[0].text}
                    </div>
                  )}
                {item.role === "tool" &&
                  (() => {
                    const [expanded, setExpanded] = createSignal(false)
                    return (
                      <div data-component="tool" data-expanded={expanded()}>
                        <div
                          data-slot="header"
                          onClick={() => setExpanded(!expanded())}
                        >
                          <span data-slot="name">
                            {item.content[0].toolName}
                          </span>
                          <span data-slot="expand">+</span>
                        </div>
                        <div data-slot="content">
                          {JSON.stringify(item.content[0].result)}
                        </div>
                      </div>
                    )
                  })()}
              </>
            )
          }}
        </For>
        {toolCaller.state.type === "loading" && (
          <div data-component="loading">
            <span>■</span>
            <span>■</span>
            <span>■</span>
          </div>
        )}
        {toolCaller.prompt.filter((item) => item.role !== "system").length >
          0 && (
          <div data-component="clear">
            <Button size="sm" color="ghost" onClick={toolCaller.clear}>
              Clear chat
            </Button>
          </div>
        )}
      </div>

      <div data-slot="footer" data-max-width>
        <div data-component="chat">
          <textarea
            autofocus
            placeholder="How can I help?"
            onKeyDown={async (e) => {
              const value = e.currentTarget.value.trim()
              if (e.key === "Enter" && value) {
                e.preventDefault()
                e.currentTarget.value = ""

                // Check has integrations
                if (!hasActiveIntegrations()) {
                  toolCaller.addCustomMessage(
                    value,
                    "I need access to your AWS account first. Please go to Integrations, connect your AWS account, and then I can help you.",
                  )
                } else {
                  toolCaller.chat(value)
                }
              }
            }}
            onInput={(e) => {
              const input = e.currentTarget
              const sendButton = input.nextElementSibling as HTMLButtonElement
              if (sendButton) {
                sendButton.disabled = !e.target.value.trim()
              }

              // Auto-grow
              e.target.style.height = "3.6875rem"
              const scrollHeight = input.scrollHeight
              e.target.style.height = `${scrollHeight}px`
            }}
          />
          <Button disabled color="ghost" icon={<IconArrowRight />} />
        </div>
      </div>
    </div>
  )
}
