import { LanguageModelV1Prompt } from "ai"
import { createEffect, For, onCleanup, Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import SYSTEM_PROMPT from "./system.txt?raw"
import { hc } from "hono/client"
import { type App } from "opencontrol"
import { client } from "./client"

const providerMetadata = {
  anthropic: {
    cacheControl: {
      type: "ephemeral",
    },
  },
}
const systemPrompt = {
  get: () => {
    return localStorage.getItem("opencontrol:systemPrompt") ?? SYSTEM_PROMPT
  },
  set: (value: string) => {
    localStorage.setItem("opencontrol:systemPrompt", value)
  },
}
// Define initial system messages once
const getInitialPrompt = (): LanguageModelV1Prompt => [
  {
    role: "system",
    content: systemPrompt.get(),
    providerMetadata: {
      anthropic: {
        cacheControl: {
          type: "ephemeral",
        },
      },
    },
  },
  {
    role: "system",
    content: `The current date is ${new Date().toDateString()}`,
    providerMetadata: {
      anthropic: {
        cacheControl: {
          type: "ephemeral",
        },
      },
    },
  },
]

export function App() {
  let root: HTMLDivElement | undefined
  let textarea: HTMLTextAreaElement | undefined

  const toolDefs = client.mcp
    .$post({
      json: {
        jsonrpc: "2.0",
        method: "tools/list",
        id: "1",
      },
    })
    .then((response) => response.json())
    .then((response) =>
      "tools" in response.result ? response.result.tools : [],
    )

  const [store, setStore] = createStore<{
    prompt: LanguageModelV1Prompt
    isProcessing: boolean
    rate: boolean
  }>({
    rate: false,
    prompt: getInitialPrompt(),
    isProcessing: false,
  })

  createEffect(() => {
    const messages = store.prompt
    console.log("scrolling to bottom")
    root?.scrollTo(0, root?.scrollHeight)
    return messages.length
  }, 0)

  createEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && store.isProcessing) {
        setStore("isProcessing", false)
        textarea?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
    })
  })

  function clearConversation() {
    setStore("prompt", getInitialPrompt())
  }

  async function send(message: string) {
    setStore("isProcessing", true)
    setStore("prompt", store.prompt.length, {
      role: "user",
      content: [
        {
          type: "text",
          text: message,
          providerMetadata: store.prompt.length === 1 ? providerMetadata : {},
        },
      ],
    })

    while (true) {
      if (!store.isProcessing) {
        console.log("Processing cancelled by user")
        break
      }

      const response = await client.generate.$post({
        json: {
          prompt: store.prompt,
          mode: {
            type: "regular",
            tools: (await toolDefs).map((tool: any) => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              parameters: {
                ...tool.inputSchema,
              },
            })),
          },
          inputFormat: "messages",
          temperature: 1,
        },
      })

      if (!store.isProcessing) continue

      if (!response.ok) {
        if (response.status === 400) {
          setStore("prompt", (val) => {
            val.splice(2, 1)
            console.log(val)
            return [...val]
          })
        }
        if (response.status === 429) {
          setStore("rate", true)
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
        continue
      }

      const result = await response.json()

      if (result.text) {
        setStore("prompt", store.prompt.length, {
          role: "assistant",
          content: [
            {
              type: "text",
              text: result.text,
            },
          ],
        })
      }

      setStore("rate", false)

      if (result.finishReason === "stop") {
        setStore("isProcessing", false)
        break
      }

      if (result.finishReason === "tool-calls") {
        for (const item of result.toolCalls!) {
          console.log("calling tool", item.toolName, item.args)
          setStore("prompt", store.prompt.length, {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolName: item.toolName,
                args: JSON.parse(item.args),
                toolCallId: item.toolCallId,
              },
            ],
          })

          const response = await client.mcp
            .$post({
              json: {
                jsonrpc: "2.0",
                id: "2",
                method: "tools/call",
                params: {
                  name: item.toolName,
                  arguments: JSON.parse(item.args),
                },
              },
            })
            .then((r) => r.json())
          if ("content" in response.result) {
            setStore("prompt", store.prompt.length, {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolName: item.toolName,
                  toolCallId: item.toolCallId,
                  result: response.result.content,
                },
              ],
            })
          } else break
        }
      }
    }
    setStore("isProcessing", false)
    textarea?.focus()
  }

  const [showSystemPromptModal, setShowSystemPromptModal] = createSignal(false)
  const [systemPromptValue, setSystemPromptValue] = createSignal(
    systemPrompt.get(),
  )

  const modifySystemPrompt = () => {
    setSystemPromptValue(systemPrompt.get())
    setShowSystemPromptModal(true)
  }

  const handleSystemPromptSubmit = () => {
    const newPrompt = systemPromptValue()
    if (newPrompt.trim() !== "") {
      systemPrompt.set(newPrompt)
      setStore("prompt", getInitialPrompt())
    }
    setShowSystemPromptModal(false)
  }

  createEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSystemPromptModal()) {
        if (e.key === "Escape") {
          e.preventDefault()
          setShowSystemPromptModal(false)
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault()
          handleSystemPromptSubmit()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
    })
  })

  return (
    <div data-component="root" ref={root}>
      <div data-component="messages">
        <For each={store.prompt}>
          {(item) => (
            <>
              {item.role === "user" && item.content[0].type === "text" && (
                <div data-slot="message" data-user={true}>
                  {item.content[0].text}
                </div>
              )}

              {item.role === "assistant" &&
                item.content[0].type === "tool-call" &&
                (() => {
                  const [showArgs, setShowArgs] = createStore({
                    visible: false,
                  })

                  const toggleArgs = () => {
                    setShowArgs("visible", (prev) => !prev)
                  }

                  return (
                    <div data-slot="message" data-tool={true}>
                      <div data-slot="tool-header" onClick={toggleArgs}>
                        <span data-slot="tool-icon">🔧</span>
                        <span data-slot="tool-name">
                          {item.content[0].toolName}
                        </span>
                        <span data-slot="tool-expand">
                          {showArgs.visible ? "−" : "+"}
                        </span>
                      </div>
                      {showArgs.visible && (
                        <div data-slot="tool-args">
                          <pre>
                            {JSON.stringify(item.content[0].args, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )
                })()}

              {/* Show assistant text messages */}
              {item.role === "assistant" && item.content[0].type === "text" && (
                <div data-slot="message" data-assistant={true}>
                  {item.content[0].text}
                </div>
              )}

              {/* Show system messages, but not the first ones (initial prompts) */}
              {item.role === "system" && store.prompt.indexOf(item) > 1 && (
                <div data-slot="message" data-system={true}>
                  {item.content}
                </div>
              )}
            </>
          )}
        </For>
        {/* Loading indicator bar */}
        {store.isProcessing && (
          <div data-slot="thinking-bar">
            <div data-slot="thinking-spinner">
              <div data-slot="spinner-inner"></div>
            </div>
            <div data-slot="thinking-text">
              {store.rate && "Rate limited, retrying..."}
              {!store.rate && "Thinking"}
            </div>
          </div>
        )}

        <div data-slot="spacer"></div>
      </div>
      <div data-component="footer">
        <div data-slot="footer-actions">
          <button data-component="footer-action" onClick={modifySystemPrompt}>
            🔧
          </button>
          {store.prompt.length > 2 && !store.isProcessing && (
            <button data-component="footer-action" onClick={clearConversation}>
              Clear
            </button>
          )}
        </div>
        <div data-slot="chat">
          <textarea
            autofocus
            ref={textarea}
            disabled={store.isProcessing}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !store.isProcessing) {
                send(e.currentTarget.value)
                e.currentTarget.value = ""
                e.preventDefault()
              }
            }}
            data-component="input"
            placeholder={
              store.isProcessing
                ? "Processing... (Press Esc to cancel)"
                : "Type your message here"
            }
          />
        </div>
      </div>

      {/* System Prompt Modal */}
      <Show when={showSystemPromptModal()}>
        <div
          data-component="dialog-overlay"
          onClick={() => setShowSystemPromptModal(false)}
        ></div>
        <div data-component="dialog-center">
          <div data-slot="content" data-size="md">
            <div data-slot="header">
              <label data-size="md" data-slot="title" data-component="label">
                ⚠️ System Prompt (will reset chat history)
              </label>
            </div>
            <div data-slot="main">
              <textarea
                data-component="input"
                style={{ "min-height": "200px", "margin-top": "10px" }}
                value={systemPromptValue()}
                onInput={(e) => setSystemPromptValue(e.currentTarget.value)}
              />
            </div>
            <div data-slot="footer">
              <small style={{ "margin-right": "auto", opacity: "0.7" }}>
                Press Esc to cancel, Ctrl+Enter to save
              </small>
              <button
                data-component="footer-action"
                onClick={() => setShowSystemPromptModal(false)}
              >
                Cancel
              </button>
              <button
                data-component="footer-action"
                onClick={handleSystemPromptSubmit}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
