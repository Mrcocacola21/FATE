import { Component, createRef, type HTMLAttributes } from "react";
import { dissolvePage, gatherPage, snapshotPage, veiled, type PageSnapshot } from "./pageRunes";
import type { RuneTone } from "./runeMagic";

type RunePageProps = HTMLAttributes<HTMLDivElement> & {
  /** When this changes the page turns: what it showed comes apart and the new page gathers. */
  turn?: unknown;
  /** Written out of runes when it first appears. */
  gather?: boolean;
  /** Comes apart into runes when it is taken away, if this holds then. */
  leave?: () => boolean;
  /** What comes apart when the page is taken away: the page itself, or the whole window. */
  leaveScope?: "page" | "app";
  tone?: RuneTone;
};

/**
 * A page that turns in runes: its letters become runes as it leaves or changes, and the runes
 * fly onto the letters of the page that takes its place. A class, because the page has to be
 * copied just before React changes it.
 */
export class RunePage extends Component<RunePageProps> {
  private page = createRef<HTMLDivElement>();

  componentDidMount() {
    if (this.props.gather !== false) gatherPage(this.page.current, { tone: this.props.tone });
  }

  getSnapshotBeforeUpdate(previous: RunePageProps): PageSnapshot | null {
    return Object.is(previous.turn, this.props.turn) ? null : snapshotPage(this.page.current);
  }

  componentDidUpdate(_: RunePageProps, __: unknown, snapshot: PageSnapshot | null) {
    if (!snapshot) return;
    dissolvePage(snapshot, this.props.tone);
    gatherPage(this.page.current, { tone: this.props.tone });
  }

  componentWillUnmount() {
    const { leave, leaveScope = "page", tone } = this.props;
    const page = this.page.current;
    // Under the veil the window has already come apart.
    if (!page || veiled() || (leave && !leave())) return;
    // Copied now, while it is all still on screen; React's development check unmounts without
    // taking anything away, and then nothing comes apart.
    const snapshot = snapshotPage(
      leaveScope === "app" ? (document.getElementById("root") ?? page) : page,
    );
    queueMicrotask(() => {
      if (!page.isConnected) dissolvePage(snapshot, tone);
    });
  }

  render() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { turn, gather, leave, leaveScope, tone, children, ...props } = this.props;
    return (
      <div ref={this.page} {...props}>
        {children}
      </div>
    );
  }
}
