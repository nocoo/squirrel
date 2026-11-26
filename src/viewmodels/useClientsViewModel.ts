import { useCallback, useEffect, useState } from "react";
import { api } from "@/data/api";
import type { ClientPolicyItem, ClientStatus, FolderItem, SecretItem } from "@/models/types";

export type IssuedCredential =
  | {
      kind: "bot_token";
      displayName: string;
      clientId: string;
      token: string;
    }
  | {
      kind: "static_oauth";
      displayName: string;
      clientId: string;
      clientSecret: string | null;
      redirectUris: string[];
    };

export function useClientsViewModel() {
  const [clients, setClients] = useState<ClientPolicyItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issuedCredential, setIssuedCredential] = useState<IssuedCredential | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientsRes, foldersRes, secretsRes] = await Promise.all([
        api.listClients(),
        api.listFolders(),
        api.listSecrets(),
      ]);
      setClients(clientsRes.items);
      setFolders(foldersRes.items);
      setSecrets(secretsRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载消费方列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createBotToken = useCallback(
    async (payload: {
      displayName: string;
      allowAll: boolean;
      allowedFolderIds: string[];
      allowedSecretIds: string[];
      allowPlaintextRead: boolean;
      expiresAt: string | null;
    }) => {
      const res = await api.createBotClient(payload);
      setIssuedCredential({
        kind: "bot_token",
        displayName: res.item.displayName,
        clientId: res.item.clientId,
        token: res.token,
      });
      await reload();
    },
    [reload],
  );

  const createStaticOAuth = useCallback(
    async (payload: {
      displayName: string;
      redirectUris: string[];
      tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic" | "none";
      allowAll: boolean;
      allowedFolderIds: string[];
      allowedSecretIds: string[];
      allowPlaintextRead: boolean;
    }) => {
      const res = await api.createStaticOAuthClient(payload);
      setIssuedCredential({
        kind: "static_oauth",
        displayName: res.item.displayName,
        clientId: res.oauthCredentials.clientId,
        clientSecret: res.oauthCredentials.clientSecret,
        redirectUris: res.oauthCredentials.redirectUris,
      });
      await reload();
    },
    [reload],
  );

  const updatePolicy = useCallback(
    async (
      clientId: string,
      payload: Partial<{
        displayName: string;
        allowAll: boolean;
        allowedFolderIds: string[];
        allowedSecretIds: string[];
        allowPlaintextRead: boolean;
        status: ClientStatus;
      }>,
    ) => {
      await api.updateClient(clientId, payload);
      await reload();
    },
    [reload],
  );

  const rotateBotToken = useCallback(
    async (client: ClientPolicyItem) => {
      const res = await api.rotateBotToken(client.clientId);
      setIssuedCredential({
        kind: "bot_token",
        displayName: res.item.displayName,
        clientId: res.item.clientId,
        token: res.token,
      });
      await reload();
    },
    [reload],
  );

  const revokeClient = useCallback(
    async (clientId: string) => {
      await api.revokeClient(clientId);
      await reload();
    },
    [reload],
  );

  const clearIssuedCredential = useCallback(() => {
    setIssuedCredential(null);
  }, []);

  return {
    clients,
    folders,
    secrets,
    loading,
    error,
    issuedCredential,
    clearIssuedCredential,
    createBotToken,
    createStaticOAuth,
    updatePolicy,
    rotateBotToken,
    revokeClient,
    reload,
  };
}
