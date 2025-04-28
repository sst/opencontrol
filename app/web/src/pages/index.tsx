import { Match, Switch } from "solid-js"
import { useAccount } from "../components/context-account"
import { Navigate } from "@solidjs/router"
import { IconLogo, ImageArchitecture } from "../ui/svg"
import styles from "./lander.module.css"
import { useOpenAuth } from "../components/context-openauth"

export default function Index() {
  const auth = useOpenAuth()
  const account = useAccount()
  return (
    <Switch>
      <Match when={account.current}>
        <Navigate href={`/${account.current!.workspaces[0].id}`} />
      </Match>
      <Match when={!account.current}>
        <div class={styles.lander}>
          <div data-slot="hero">
            <section data-slot="top">
              <div data-slot="logo">
                <IconLogo />
              </div>
              <h1>Control your infrastructure with AI.</h1>
            </section>

            <section data-slot="cta">
              <div data-slot="col-1">
                <a target="_self" href={import.meta.env.VITE_DOCS_URL}>
                  Self-host
                </a>
              </div>
              <div data-slot="col-2">
                <span onClick={() => auth.authorize({ provider: "google" })}>
                  Sign in
                </span>
              </div>
              <div data-slot="col-3">
                <a target="_blank" href="https://github.com/sst/opencontrol">
                  GitHub
                </a>
              </div>
            </section>

            <section data-slot="content">
              <p>
                OpenControl lets you control your infrastructure with AI. You
                can use it via:
              </p>
              <ol>
                <li>
                  <b>OpenControl.ai</b>: Hosted on our side using our LLMs. You
                  can connect your AWS account and other services.
                </li>
                <li>
                  <b>Self-host</b>: Runs in your infrastructure with access to
                  your internal resources using your LLMs.
                </li>
              </ol>
            </section>

            <section data-slot="images">
              <div>
                <p>Self-hosted Architecture</p>
                <a
                  target="_self"
                  href={`${import.meta.env.VITE_DOCS_URL}/how-it-works`}
                >
                  <ImageArchitecture width="100%" />
                </a>
              </div>
            </section>

            <section data-slot="footer">
              <div data-slot="col-1">
                <span>Version: Beta</span>
              </div>
              <div data-slot="col-2">
                <span>
                  Author: <a href="https://sst.dev">SST</a>
                </span>
              </div>
            </section>
          </div>
        </div>
      </Match>
    </Switch>
  )
}
