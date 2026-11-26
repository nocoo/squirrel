import { useCallback, useEffect, useState } from "react";
import { api } from "@/data/api";
import type { AuthTxDetail } from "@/models/types";

export function useAuthorizeViewModel(txId: string | null) {
  const [tx, setTx] = useState<AuthTxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [allowAll, setAllowAll] = useState(false);
  const [allowedFolderIds, setAllowedFolderIds] = useState<string[]>([]);
  const [allowedSecretIds, setAllowedSecretIds] = useState<string[]>([]);
  const [allowPlaintextRead, setAllowPlaintextRead] = useState(true);

  const load = useCallback(async () => {
    if (!txId) {
      setError("缺少授权会话参数（tx），请从客户端重新发起 OAuth 授权。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getAuthTx(txId);
      setTx(detail);
      setDisplayName(detail.existingPolicy?.displayName || detail.clientName);
      setAllowAll(detail.existingPolicy?.allowAll ?? false);
      setAllowedFolderIds(detail.existingPolicy?.allowedFolderIds ?? []);
      setAllowedSecretIds(detail.existingPolicy?.allowedSecretIds ?? []);
      setAllowPlaintextRead(detail.existingPolicy?.allowPlaintextRead ?? true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "授权会话已失效或不存在");
    } finally {
      setLoading(false);
    }
  }, [txId]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = useCallback(async (): Promise<string | null> => {
    if (!txId || !tx) return null;
    if (!displayName.trim()) {
      setError("请填写消费方名称");
      return null;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.decideAuthTx(txId, {
        decision: "approve",
        csrfToken: tx.csrfToken,
        displayName: displayName.trim(),
        allowAll,
        allowedFolderIds: allowAll ? [] : allowedFolderIds,
        allowedSecretIds: allowAll ? [] : allowedSecretIds,
        allowPlaintextRead,
      });
      return res.redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交授权失败");
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [txId, tx, displayName, allowAll, allowedFolderIds, allowedSecretIds, allowPlaintextRead]);

  const deny = useCallback(async (): Promise<string | null> => {
    if (!txId || !tx) return null;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.decideAuthTx(txId, {
        decision: "deny",
        csrfToken: tx.csrfToken,
      });
      return res.redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "拒绝授权失败");
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [txId, tx]);

  return {
    tx,
    loading,
    submitting,
    error,
    displayName,
    setDisplayName,
    allowAll,
    setAllowAll,
    allowedFolderIds,
    setAllowedFolderIds,
    allowedSecretIds,
    setAllowedSecretIds,
    allowPlaintextRead,
    setAllowPlaintextRead,
    approve,
    deny,
    reload: load,
  };
}
