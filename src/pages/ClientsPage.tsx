import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  LayerCard,
  Text,
  Textarea,
  toast,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";
import { Ban, Bot, Copy, KeyRound, Pause, Play, RefreshCw, Shield } from "@nocoo/basalt/icons";
import { useState } from "react";
import { ScopeSelector } from "@/components/ScopeSelector";
import {
  formatDateTime,
  getClientStatusMeta,
  getRegistrationTypeLabel,
  summarizeClientScope,
} from "@/models/format";
import type { ClientPolicyItem } from "@/models/types";
import { validateClientForm } from "@/models/validators";
import { useClientsViewModel } from "@/viewmodels/useClientsViewModel";

interface CreateClientForm {
  open: boolean;
  type: "bot_token" | "static_oauth";
  displayName: string;
  redirectUrisRaw: string;
  tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic" | "none";
  allowAll: boolean;
  allowedFolderIds: string[];
  allowedSecretIds: string[];
  allowPlaintextRead: boolean;
  expiresAtDate: string;
}

const INITIAL_CREATE_FORM: CreateClientForm = {
  open: false,
  type: "bot_token",
  displayName: "",
  redirectUrisRaw: "https://oauth-redirect.googleusercontent.com/r/",
  tokenEndpointAuthMethod: "client_secret_post",
  allowAll: false,
  allowedFolderIds: [],
  allowedSecretIds: [],
  allowPlaintextRead: true,
  expiresAtDate: "",
};

interface EditPolicyForm {
  client: ClientPolicyItem;
  displayName: string;
  allowAll: boolean;
  allowedFolderIds: string[];
  allowedSecretIds: string[];
  allowPlaintextRead: boolean;
}

export default function ClientsPage() {
  const {
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
  } = useClientsViewModel();

  const [createForm, setCreateForm] = useState<CreateClientForm>(INITIAL_CREATE_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<EditPolicyForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [revokingClient, setRevokingClient] = useState<ClientPolicyItem | null>(null);

  const openCreate = (type: "bot_token" | "static_oauth") => {
    setCreateForm({ ...INITIAL_CREATE_FORM, open: true, type });
    setCreateError(null);
  };

  const openEdit = (client: ClientPolicyItem) => {
    setEditForm({
      client,
      displayName: client.displayName,
      allowAll: client.allowAll,
      allowedFolderIds: client.allowedFolderIds,
      allowedSecretIds: client.allowedSecretIds,
      allowPlaintextRead: client.allowPlaintextRead,
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validateClientForm({
      type: createForm.type,
      displayName: createForm.displayName,
      redirectUrisRaw: createForm.redirectUrisRaw,
    });
    if (validationErr) {
      setCreateError(validationErr);
      return;
    }

    setCreateSaving(true);
    setCreateError(null);
    try {
      if (createForm.type === "bot_token") {
        await createBotToken({
          displayName: createForm.displayName.trim(),
          allowAll: createForm.allowAll,
          allowedFolderIds: createForm.allowedFolderIds,
          allowedSecretIds: createForm.allowedSecretIds,
          allowPlaintextRead: createForm.allowPlaintextRead,
          expiresAt: createForm.expiresAtDate
            ? new Date(`${createForm.expiresAtDate}T23:59:59Z`).toISOString()
            : null,
        });
      } else {
        const redirectUris = createForm.redirectUrisRaw
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        await createStaticOAuth({
          displayName: createForm.displayName.trim(),
          redirectUris,
          tokenEndpointAuthMethod: createForm.tokenEndpointAuthMethod,
          allowAll: createForm.allowAll,
          allowedFolderIds: createForm.allowedFolderIds,
          allowedSecretIds: createForm.allowedSecretIds,
          allowPlaintextRead: createForm.allowPlaintextRead,
        });
      }
      setCreateForm((prev) => ({ ...prev, open: false }));
      toast.success("消费方凭证已创建");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建消费方失败");
    } finally {
      setCreateSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;
    setEditSaving(true);
    try {
      await updatePolicy(editForm.client.clientId, {
        displayName: editForm.displayName.trim() || editForm.client.displayName,
        allowAll: editForm.allowAll,
        allowedFolderIds: editForm.allowAll ? [] : editForm.allowedFolderIds,
        allowedSecretIds: editForm.allowAll ? [] : editForm.allowedSecretIds,
        allowPlaintextRead: editForm.allowPlaintextRead,
      });
      setEditForm(null);
      toast.success("权限策略已更新，秒级生效");
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "更新权限失败");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleStatus = async (client: ClientPolicyItem) => {
    const nextStatus = client.status === "active" ? "suspended" : "active";
    try {
      await updatePolicy(client.clientId, { status: nextStatus });
      toast.success(nextStatus === "suspended" ? "消费方已暂停" : "消费方已恢复");
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "状态切换失败");
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}已复制`);
    } catch {
      toast.danger("复制失败");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="客户端与凭证"
        description="管理 OAuth 2.1 客户端（Gemini / Claude / Cursor）与无头 Bot Bearer Token，支持按文件夹与单密钥细粒度授权"
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openCreate("static_oauth")}
            >
              <KeyRound className="h-4 w-4" strokeWidth={1.5} />
              新建静态 OAuth
            </Button>
            <Button type="button" size="sm" onClick={() => openCreate("bot_token")}>
              <Bot className="h-4 w-4" strokeWidth={1.5} />
              新建 Bot Token
            </Button>
          </div>
        }
      />

      {error && (
        <LayerCard outlined>
          <LayerCard.Body className="flex items-center justify-between gap-4">
            <Text className="text-basalt-base text-basalt-destructive">{error}</Text>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
              重试
            </Button>
          </LayerCard.Body>
        </LayerCard>
      )}

      {loading && clients.length === 0 ? (
        <LayerCard>
          <LayerCard.Loading label="加载消费方列表..." />
        </LayerCard>
      ) : clients.length === 0 ? (
        <LayerCard>
          <LayerCard.Empty
            title="暂无已注册消费方"
            description="可通过右上角签发无头 Bot Token，或在 Gemini / Claude Code 中配置 /mcp 地址触发 OAuth 2.1 DCR 接入。"
            action={
              <Button type="button" size="sm" onClick={() => openCreate("bot_token")}>
                新建 Bot Token
              </Button>
            }
          />
        </LayerCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {clients.map((client) => {
            const statusMeta = getClientStatusMeta(client.status);
            return (
              <LayerCard key={client.clientId}>
                <LayerCard.Header className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <LayerCard.Title className="truncate">{client.displayName}</LayerCard.Title>
                      <LayerCard.Description className="truncate font-mono text-basalt-sm">
                        {client.clientId}
                      </LayerCard.Description>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="neutral" variant="outline">
                        {getRegistrationTypeLabel(client.registrationType)}
                      </Badge>
                      <Badge tone={statusMeta.tone} variant="soft">
                        {statusMeta.label}
                      </Badge>
                    </div>
                  </div>
                </LayerCard.Header>
                <LayerCard.Body className="space-y-3">
                  <LayerCard.Well className="space-y-1.5 p-3 text-basalt-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-basalt-muted-foreground">授权范围</span>
                      <span className="font-medium">{summarizeClientScope(client)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-basalt-muted-foreground">明文读取</span>
                      <span>{client.allowPlaintextRead ? "允许 get_secret" : "仅元数据"}</span>
                    </div>
                    {client.tokenPreview && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-basalt-muted-foreground">Token 掩码</span>
                        <span className="font-mono">{client.tokenPreview}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-basalt-muted-foreground">累计调用 / 最近使用</span>
                      <span className="tabular-nums">
                        {client.callCount} 次 · {formatDateTime(client.lastUsedAt)}
                      </span>
                    </div>
                  </LayerCard.Well>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={client.status === "revoked"}
                      onClick={() => openEdit(client)}
                    >
                      <Shield className="h-3.5 w-3.5" strokeWidth={1.5} />
                      权限设置
                    </Button>
                    {client.registrationType === "bot_token" && client.status !== "revoked" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void rotateBotToken(client)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                        轮换 Token
                      </Button>
                    )}
                    {client.status !== "revoked" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void toggleStatus(client)}
                      >
                        {client.status === "active" ? (
                          <>
                            <Pause className="h-3.5 w-3.5" strokeWidth={1.5} />
                            暂停
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" strokeWidth={1.5} />
                            恢复
                          </>
                        )}
                      </Button>
                    )}
                    {client.status !== "revoked" && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setRevokingClient(client)}
                      >
                        <Ban className="h-3.5 w-3.5" strokeWidth={1.5} />
                        吊销
                      </Button>
                    )}
                  </div>
                </LayerCard.Body>
              </LayerCard>
            );
          })}
        </div>
      )}

      {/* Create Bot Token / Static OAuth Dialog */}
      <Dialog
        open={createForm.open}
        onOpenChange={(open) => setCreateForm((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {createForm.type === "bot_token" ? "新建无头 Bot Token" : "新建静态 OAuth 客户端"}
            </DialogTitle>
            <DialogDescription>
              {createForm.type === "bot_token"
                ? "适用于无浏览器的自动化 Agent、CI 脚本或服务端 Bot，直接通过 Bearer Token 调用 /mcp。"
                : "适用于不支持 DCR 的客户端或在 Gemini Developer Mode 中手动填写 client_id / client_secret。"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {createError && (
              <Text className="text-basalt-sm text-basalt-destructive">{createError}</Text>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="create-client-name">消费方名称</Label>
              <Input
                id="create-client-name"
                value={createForm.displayName}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, displayName: e.target.value }))
                }
                placeholder={
                  createForm.type === "bot_token"
                    ? "例如：CI 巡检 Agent"
                    : "例如：Gemini 手动客户端"
                }
                required
              />
            </div>

            {createForm.type === "bot_token" ? (
              <div className="space-y-1.5">
                <Label htmlFor="create-bot-expires">过期日期（可选）</Label>
                <Input
                  id="create-bot-expires"
                  type="date"
                  value={createForm.expiresAtDate}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, expiresAtDate: e.target.value }))
                  }
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-redirect-uris">回调地址（每行一个）</Label>
                  <Textarea
                    id="create-redirect-uris"
                    rows={3}
                    value={createForm.redirectUrisRaw}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, redirectUrisRaw: e.target.value }))
                    }
                    className="font-mono text-basalt-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-auth-method">Token 认证方式</Label>
                  <Select
                    value={createForm.tokenEndpointAuthMethod}
                    onValueChange={(value) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        tokenEndpointAuthMethod: value as
                          | "client_secret_post"
                          | "client_secret_basic"
                          | "none",
                      }))
                    }
                  >
                    <SelectTrigger id="create-auth-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client_secret_post">client_secret_post</SelectItem>
                      <SelectItem value="client_secret_basic">client_secret_basic</SelectItem>
                      <SelectItem value="none">none（公开客户端）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <ScopeSelector
              idPrefix="create-client"
              folders={folders}
              secrets={secrets}
              allowAll={createForm.allowAll}
              onAllowAllChange={(val) => setCreateForm((prev) => ({ ...prev, allowAll: val }))}
              allowedFolderIds={createForm.allowedFolderIds}
              onAllowedFolderIdsChange={(ids) =>
                setCreateForm((prev) => ({ ...prev, allowedFolderIds: ids }))
              }
              allowedSecretIds={createForm.allowedSecretIds}
              onAllowedSecretIdsChange={(ids) =>
                setCreateForm((prev) => ({ ...prev, allowedSecretIds: ids }))
              }
              allowPlaintextRead={createForm.allowPlaintextRead}
              onAllowPlaintextReadChange={(val) =>
                setCreateForm((prev) => ({ ...prev, allowPlaintextRead: val }))
              }
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateForm((prev) => ({ ...prev, open: false }))}
              >
                取消
              </Button>
              <Button type="submit" disabled={createSaving}>
                {createSaving ? "创建中..." : "创建凭证"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Policy Dialog */}
      <Dialog open={editForm !== null} onOpenChange={(open) => !open && setEditForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑授权策略：{editForm?.client.displayName}</DialogTitle>
            <DialogDescription>
              修改文件夹或单密钥授权后，下次 `/mcp` 工具调用即刻生效，无需重新登录。
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-client-name">消费方名称</Label>
                <Input
                  id="edit-client-name"
                  value={editForm.displayName}
                  onChange={(e) =>
                    setEditForm((prev) => (prev ? { ...prev, displayName: e.target.value } : null))
                  }
                  required
                />
              </div>

              <ScopeSelector
                idPrefix="edit-client"
                folders={folders}
                secrets={secrets}
                allowAll={editForm.allowAll}
                onAllowAllChange={(val) =>
                  setEditForm((prev) => (prev ? { ...prev, allowAll: val } : null))
                }
                allowedFolderIds={editForm.allowedFolderIds}
                onAllowedFolderIdsChange={(ids) =>
                  setEditForm((prev) => (prev ? { ...prev, allowedFolderIds: ids } : null))
                }
                allowedSecretIds={editForm.allowedSecretIds}
                onAllowedSecretIdsChange={(ids) =>
                  setEditForm((prev) => (prev ? { ...prev, allowedSecretIds: ids } : null))
                }
                allowPlaintextRead={editForm.allowPlaintextRead}
                onAllowPlaintextReadChange={(val) =>
                  setEditForm((prev) => (prev ? { ...prev, allowPlaintextRead: val } : null))
                }
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditForm(null)}>
                  取消
                </Button>
                <Button type="submit" disabled={editSaving}>
                  {editSaving ? "保存中..." : "保存策略"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* One-time Issued Credential Dialog */}
      <Dialog
        open={issuedCredential !== null}
        onOpenChange={(open) => !open && clearIssuedCredential()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>凭证已签发：{issuedCredential?.displayName}</DialogTitle>
            <DialogDescription>
              明文凭证仅展示这一次，服务端仅存哈希，请立即妥善保存。
            </DialogDescription>
          </DialogHeader>
          {issuedCredential && (
            <div className="space-y-3">
              <Banner
                tone="warning"
                size="sm"
                title="请立即复制保存"
                description="关闭弹窗后将无法再次查看完整明文，仅可通过轮换生成新凭证。"
              />
              {issuedCredential.kind === "bot_token" ? (
                <div className="space-y-2">
                  <Label>Authorization Bearer Token</Label>
                  <LayerCard.Well className="break-all p-3 font-mono text-basalt-sm select-all">
                    {issuedCredential.token}
                  </LayerCard.Well>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void copyText(issuedCredential.token, "Bot Token")}
                  >
                    <Copy className="h-4 w-4" strokeWidth={1.5} />
                    复制 Bot Token
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Client ID</Label>
                    <LayerCard.Well className="break-all p-2.5 font-mono text-basalt-sm select-all">
                      {issuedCredential.clientId}
                    </LayerCard.Well>
                  </div>
                  {issuedCredential.clientSecret && (
                    <div className="space-y-1">
                      <Label>Client Secret</Label>
                      <LayerCard.Well className="break-all p-2.5 font-mono text-basalt-sm select-all">
                        {issuedCredential.clientSecret}
                      </LayerCard.Well>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copyText(issuedCredential.clientId, "Client ID")}
                    >
                      复制 Client ID
                    </Button>
                    {issuedCredential.clientSecret && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          void copyText(issuedCredential.clientSecret ?? "", "Client Secret")
                        }
                      >
                        复制 Client Secret
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={clearIssuedCredential}>
              我已保存，关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Client Confirm */}
      <AlertDialog
        open={revokingClient !== null}
        onOpenChange={(open) => !open && setRevokingClient(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久吊销「{revokingClient?.displayName}」？</AlertDialogTitle>
            <AlertDialogDescription>
              吊销后将删除其 OAuth 注册信息并作废现有 Token，该操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!revokingClient) return;
                try {
                  await revokeClient(revokingClient.clientId);
                  toast.success("消费方已吊销");
                } catch (err) {
                  toast.danger(err instanceof Error ? err.message : "吊销失败");
                } finally {
                  setRevokingClient(null);
                }
              }}
            >
              确认吊销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
