import { useCallback, useEffect, useState } from "react";
import { api } from "@/data/api";
import type { AdminUserInfo } from "@/models/types";

export function useMe() {
  const [data, setData] = useState<AdminUserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.getMe();
      setData(me);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, reload: load };
}
