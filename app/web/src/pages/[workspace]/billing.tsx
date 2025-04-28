import { Button } from "../../ui/button"
import { useApi } from "../components/context-api"
import { createEffect, createSignal } from "solid-js"
import { useZero } from "../components/context-zero"
import { useWorkspace } from "../components/context-workspace"
import style from "./billing.module.css"
import { useQuery } from "@rocicorp/zero/solid"

export default function Billing() {
  const api = useApi()
  const zero = useZero()
  const workspace = useWorkspace()
  const [isLoading, setIsLoading] = createSignal(false)
  const [billingData] = useQuery(() => {
    return zero.query.billing.where("workspace_id", workspace.id).one()
  })

  // Run once on component mount to check URL parameters
  ;(() => {
    const url = new URL(window.location.href)
    const result = url.hash

    console.log("STRIPE RESULT", result)

    if (url.hash === "#success") {
      setIsLoading(true)
      // Remove the hash from the URL
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      )
    }
  })()

  createEffect((old?: number) => {
    console.log("BILLING DATA", old)
    if (old && old !== billingData()?.balance) {
      setIsLoading(false)
    }
    return billingData()?.balance
  })

  const handleBuyCredits = async () => {
    try {
      setIsLoading(true)
      const baseUrl = window.location.href
      const successUrl = new URL(baseUrl)
      successUrl.hash = "success"

      const response = await api.billing.checkout
        .$post({
          json: {
            success_url: successUrl.toString(),
            cancel_url: baseUrl,
          },
        })
        .then((r) => r.json() as any)
      window.location.href = response.url
    } catch (error) {
      console.error("Failed to get checkout URL:", error)
      setIsLoading(false)
    }
  }

  return (
    <>
      <div data-component="title-bar">
        <div data-slot="left">
          <h1>Billing</h1>
        </div>
      </div>
      <div class={style.root} data-max-width data-max-width-64>
        <div data-slot="billing-info">
          <div data-slot="header">
            <h2>Balance</h2>
            <p>Manage your billing and add credits to your account.</p>
          </div>

          <div data-slot="balance">
            <p data-slot="amount">
              {(() => {
                const balanceStr = (
                  (billingData()?.balance ?? 0) / 100000000
                ).toFixed(2)
                return `$${balanceStr === "-0.00" ? "0.00" : balanceStr}`
              })()}
            </p>
            <Button
              color="primary"
              disabled={isLoading()}
              onClick={handleBuyCredits}
            >
              {isLoading() ? "Loading..." : "Buy Credits"}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
