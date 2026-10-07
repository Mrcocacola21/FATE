import { AudioManager } from "./AudioManager";

class TestNode {
  connections: TestNode[] = [];
  gain = { value: 1 };
  disconnects = 0;
  connect(node: TestNode) {
    this.connections.push(node);
  }
  disconnect() {
    this.disconnects++;
  }
}
export class TestSource extends TestNode {
  buffer?: AudioBuffer;
  onended?: () => void;
  starts = 0;
  stops = 0;
  start() {
    this.starts++;
  }
  stop() {
    this.stops++;
  }
}

export function audioFixture(
  options: { failFetch?: boolean; failDecode?: boolean; failResume?: boolean } = {},
) {
  const gains: TestNode[] = [];
  const sources: TestSource[] = [];
  const buffer = {} as AudioBuffer;
  let state: AudioContextState = "suspended";
  let fetches = 0;
  let decodes = 0;
  let resumes = 0;
  let creations = 0;
  const diagnostics: string[] = [];
  const urls: string[] = [];
  const destination = new TestNode();
  const context = {
    get state() {
      return state;
    },
    destination,
    createGain: () => {
      const node = new TestNode();
      gains.push(node);
      return node;
    },
    createBufferSource: () => {
      const node = new TestSource();
      sources.push(node);
      return node;
    },
    resume: async () => {
      resumes++;
      if (options.failResume) throw new Error("denied");
      state = "running";
    },
    decodeAudioData: async () => {
      decodes++;
      if (options.failDecode) throw new Error("decode");
      return buffer;
    },
  } as unknown as AudioContext;
  const fetchAsset = async (url: string) => {
    fetches++;
    urls.push(url);
    if (options.failFetch) throw new Error("network");
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
  };
  const manager = new AudioManager(
    () => {
      creations++;
      return context;
    },
    fetchAsset as typeof fetch,
    (key, url) => diagnostics.push(`${key}:${url}`),
  );
  return {
    manager,
    context,
    gains,
    sources,
    destination,
    buffer,
    diagnostics,
    urls,
    stats: () => ({ fetches, decodes, resumes, creations }),
    suspend: () => {
      state = "suspended";
    },
  };
}
