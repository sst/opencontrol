import { useQuery } from "@rocicorp/zero/solid"
import { useZero } from "../components/context-zero"
import { useAccount } from "../../components/context-account"
import { useWorkspace } from "../components/context-workspace"
import { Button } from "../../ui/button"
import { createSignal, For } from "solid-js"
import style from "./integrations.module.css"
import { useApi } from "../components/context-api"

export default function Integrations() {
  const api = useApi()
  const account = useAccount()
  const workspace = useWorkspace()
  const zero = useZero()
  const [isDisconnecting, setIsDisconnecting] = createSignal(false)
  const [awsAccounts] = useQuery(() => {
    return zero.query.aws_account.where("workspace_id", workspace.id)
  })

  const handleRemoveAccount = async (id: string) => {
    try {
      setIsDisconnecting(true)
      const response = await api.integration.aws.disconnect
        .$post({
          json: {
            awsAccountID: id,
          },
        })
        .then((r) => r.json() as any)
    } catch (error) {
      console.error("Failed to disconnect AWS account:", error)
      setIsDisconnecting(false)
    }
  }

  const handleConnectAWS = () => {
    window.open(
      `https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?param_workspaceID=${account.current!.workspaces[0].id}&stackName=OpenControl-${account.current!.workspaces[0].id.replace(/_/g, "-")}&templateURL=${import.meta.env.VITE_TEMPLATE_URL}`,
    )
  }

  // Filter out soft-deleted accounts
  const activeAccounts = () =>
    awsAccounts()?.filter((account) => !account.time_deleted) || []

  return (
    <>
      <div data-component="title-bar">
        <div data-slot="left">
          <h1>Integrations</h1>
        </div>
      </div>

      <div class={style.root} data-max-width data-max-width-64>
        <div data-slot="aws-accounts">
          <div data-slot="header">
            <h2>AWS</h2>
            <p>Connect your AWS accounts.</p>
          </div>

          {activeAccounts().length === 0 ? (
            <div data-slot="empty-state">
              <p>Connect your AWS account to get started.</p>
              <Button color="primary" onClick={handleConnectAWS}>
                Connect AWS
              </Button>
            </div>
          ) : (
            <div data-slot="list">
              <For each={activeAccounts()}>
                {(account) => (
                  <div data-slot="item">
                    <div data-slot="account">
                      <span data-slot="number">{account.account_number}</span>
                    </div>
                    <Button
                      color="ghost"
                      size="sm"
                      disabled={isDisconnecting()}
                      onClick={() => handleRemoveAccount(account.id)}
                    >
                      {isDisconnecting() ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                )}
              </For>
              <div data-slot="item" data-connect>
                <span>Add another account</span>
                <Button size="sm" color="secondary" onClick={handleConnectAWS}>
                  Connect
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
