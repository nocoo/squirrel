import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/data/api";
import type { FolderItem, SecretItem } from "@/models/types";

export type FolderSelection = "all" | "__uncategorized__" | string;

export function useSecretsViewModel() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [revealed, setRevealed] = useState<{
    id: string;
    slug: string;
    name: string;
    value: string;
  } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [foldersRes, secretsRes] = await Promise.all([api.listFolders(), api.listSecrets()]);
      setFolders(foldersRes.items);
      setSecrets(secretsRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载密钥库失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const services = useMemo(() => {
    const set = new Set<string>();
    for (const s of secrets) {
      set.add(s.service);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [secrets]);

  const uncategorizedCount = useMemo(
    () => secrets.filter((s) => s.folderId === null).length,
    [secrets],
  );

  const filteredSecrets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return secrets.filter((item) => {
      if (selectedFolder === "__uncategorized__" && item.folderId !== null) return false;
      if (
        selectedFolder !== "all" &&
        selectedFolder !== "__uncategorized__" &&
        item.folderId !== selectedFolder
      ) {
        return false;
      }
      if (serviceFilter !== "all" && item.service !== serviceFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        item.service.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.folderName?.toLowerCase().includes(q) ?? false) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [secrets, selectedFolder, serviceFilter, searchQuery]);

  const saveFolder = useCallback(
    async (
      editingId: string | null,
      payload: {
        slug: string;
        name: string;
        description: string;
        color: string;
        sortOrder: number;
      },
    ) => {
      if (editingId) {
        await api.updateFolder(editingId, payload);
      } else {
        await api.createFolder(payload);
      }
      await reload();
    },
    [reload],
  );

  const removeFolder = useCallback(
    async (id: string) => {
      await api.deleteFolder(id);
      if (selectedFolder === id) {
        setSelectedFolder("all");
      }
      await reload();
    },
    [reload, selectedFolder],
  );

  const saveSecret = useCallback(
    async (
      editingId: string | null,
      payload: {
        folderId: string | null;
        slug: string;
        name: string;
        service: string;
        value?: string;
        description: string;
        tags: string[];
        metadata: Record<string, string>;
        isEnabled: boolean;
        expiresAt: string | null;
      },
    ) => {
      if (editingId) {
        await api.updateSecret(editingId, payload);
      } else {
        await api.createSecret({
          folderId: payload.folderId,
          slug: payload.slug,
          name: payload.name,
          service: payload.service,
          value: payload.value ?? "",
          description: payload.description,
          tags: payload.tags,
          metadata: payload.metadata,
          isEnabled: payload.isEnabled,
          expiresAt: payload.expiresAt,
        });
      }
      await reload();
    },
    [reload],
  );

  const removeSecret = useCallback(
    async (id: string) => {
      await api.deleteSecret(id);
      await reload();
    },
    [reload],
  );

  const revealSecret = useCallback(async (item: SecretItem) => {
    const res = await api.revealSecret(item.id);
    setRevealed({
      id: item.id,
      slug: item.slug,
      name: item.name,
      value: res.value,
    });
  }, []);

  const clearRevealed = useCallback(() => {
    setRevealed(null);
  }, []);

  return {
    folders,
    secrets,
    filteredSecrets,
    services,
    uncategorizedCount,
    selectedFolder,
    setSelectedFolder,
    searchQuery,
    setSearchQuery,
    serviceFilter,
    setServiceFilter,
    loading,
    error,
    revealed,
    revealSecret,
    clearRevealed,
    saveFolder,
    removeFolder,
    saveSecret,
    removeSecret,
    reload,
  };
}
