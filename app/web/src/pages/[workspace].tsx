import { ZeroProvider } from "./components/context-zero"
import { WorkspaceProvider } from "./components/context-workspace"
import { ParentProps } from "solid-js"
import Layout from "./components/layout"

export default function Index(props: ParentProps) {
  return (
    <WorkspaceProvider>
      <ZeroProvider>
        <Layout>{props.children}</Layout>
      </ZeroProvider>
    </WorkspaceProvider>
  )
}
