import { hc } from "hono/client"
import { App } from "opencontrol"
import { createSignal } from "solid-js"

export const [password, setPassword] = createSignal()
export const client = hc<App>(import.meta.env.VITE_OPENCONTROL_ENDPOINT || "", {
  async fetch(...args: Parameters<typeof fetch>): Promise<Response> {
    const [input, init] = args
    const request = input instanceof Request ? input : new Request(input, init)

    // Only add authorization header if password is set
    if (password()) {
      const headers = new Headers(request.headers)
      headers.set("authorization", `Bearer ${password()}`)
      return fetch(
        new Request(request, {
          ...init,
          headers,
        }),
      )
    }

    // Otherwise, just pass through the request without auth
    return fetch(request, init)
  },
})
