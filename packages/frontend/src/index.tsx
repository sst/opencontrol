/* @refresh reload */
import { render } from "solid-js/web"

import "./reset.css"
import "./index.css"
import { App } from "./app"
import { createSignal, onMount, Show } from "solid-js"
import { client, password, setPassword } from "./client"

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?",
  )
}

render(() => {
  const [ready, setReady] = createSignal(false)
  onMount(async () => {
    // Try to authenticate without password first to check if auth is disabled
    try {
      const noAuthResult = await fetch(
        `${import.meta.env.VITE_OPENCONTROL_ENDPOINT || ""}/auth`,
        {
          method: "GET",
        },
      )

      // If successful without auth, server has auth disabled
      if (noAuthResult.ok) {
        setReady(true)
        return
      }
    } catch (e) {
      // Continue with password auth if this fails
    }

    // Regular password authentication flow
    setPassword(localStorage.getItem("opencontrol:password"))
    while (true) {
      if (!password()) {
        const result = prompt("Enter password")
        if (!result) return
        localStorage.setItem("opencontrol:password", result)
        setPassword(result)
      }
      const result = await client.auth.$get({
        json: {
          jsonrpc: "2.0",
          method: "initialize",
          id: "1",
        },
      })

      if (!result.ok) {
        localStorage.removeItem("opencontrol:password")
        setPassword(undefined)
        alert("bad password")
        continue
      }
      setReady(true)
      break
    }
  })
  return (
    <Show when={ready()}>
      <App />
    </Show>
  )
}, root!)
