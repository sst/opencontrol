#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
const server = new Server({
  name: "opencontrol",
  version: "0.0.1",
})

const url = process.argv[2]
const key = process.argv[3]
const disableAuth = process.env.OPENCONTROL_DISABLE_AUTH === "true"

class ProxyTransport {
  #stdio = new StdioServerTransport()
  async start() {
    this.#stdio.onmessage = (message) => {
      if ("id" in message) {
        const headers = {
          "Content-Type": "application/json",
        }

        // Only add authorization header if auth is not disabled and key is provided
        if (!disableAuth && key) {
          headers.authorization = `Bearer ${key}`
        }

        fetch(url + "/mcp", {
          method: "POST",
          headers,
          body: JSON.stringify(message),
        }).then(async (response) => this.send(await response.json()))
        return
      }
      this.#stdio.send(message)
    }
    this.#stdio.onerror = (error) => {
      this.onerror?.(error)
    }
    await this.#stdio.start()
  }
  async send(message) {
    return this.#stdio.send(message)
  }
  close() {
    return this.#stdio.close()
  }
  onclose
  onerror
  onmessage
}
await server.connect(new ProxyTransport())
