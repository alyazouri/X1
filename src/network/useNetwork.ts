// Auto-detect the user's network on app open.
import { useEffect, useState } from "react";
import { detectNetwork, friendlyIspName, networkStore, type NetworkInfo } from "./detectNetwork";

export type NetworkState =
  | { status: "idle" }
  | { status: "detecting" }
  | { status: "detected"; info: NetworkInfo; friendlyIsp: string | null }
  | { status: "failed" };

export function useNetworkDetection(): NetworkState & { redetect: () => void } {
  const [state, setState] = useState<NetworkState>({ status: "idle" });

  const run = async () => {
    setState({ status: "detecting" });
    const info = await detectNetwork();
    if (info) {
      networkStore.set(info);
      setState({ status: "detected", info, friendlyIsp: friendlyIspName(info.asn, info.isp) });
    } else {
      setState({ status: "failed" });
    }
  };

  useEffect(() => {
    // Reuse a previously successful detection (same session) to avoid repeat calls.
    const cached = networkStore.get();
    if (cached) {
      setState({ status: "detected", info: cached, friendlyIsp: friendlyIspName(cached.asn, cached.isp) });
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, redetect: run };
}
