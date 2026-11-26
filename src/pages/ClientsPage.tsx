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
  Field,
  Input,
  Label,
  LayerCard,
  Textarea,
  toast,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
  Ban,
  Bot,
  Copy,
  KeyRound,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Trash2,
} from "@nocoo/basalt/icons";
import { useState } from "react";
import { DialogBody, DialogForm } from "@/components/DialogForm";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FormSelect } from "@/components/FormSelect";
import { ScopeSelector } from "@/components/ScopeSelector";
import {
  formatDateTime,
  getClientStatusMeta,
  getRegistrationTypeLabel,
  summarizeClientScope,
} from "@/models/format";
import type { ClientPolicyItem } from "@/models/types";
import { type ClientFieldErrors, validateClientFields } from "@/models/validators";
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

const AUTH_METHOD_OPTIONS = [
  { value: "client_secret_post", label: "client_secret_post" },
  { value: "client_secret_basic", label: "client_secret_basic" },
  { value: "none", label: "none（公开客户端）" },
] as const;

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
    deleteClient,
    reload,
  } = useClientsViewModel();

  const [createForm, setCreateForm] = useState<CreateClientForm>(INITIAL_CREATE_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<ClientFieldErrors>({});

  const [editForm, setEditForm] = useState<EditPolicyForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<{ displayName?: string }>({});

  const [revokingClient, setRevokingClient] = useState<ClientPolicyItem | null>(null);
  const [deletingClient, setDeletingClient] = useState<ClientPolicyItem | null>(null);

  const openCreate = (type: "bot_token" | "static_oauth") => {
    setCreateForm({ ...INITIAL_CREATE_FORM, open: true, type });
    setCreateError(null);
    setCreateFieldErrors({});
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
    setEditError(null);
    setEditFieldErrors({});
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrs = validateClientFields({
      type: createForm.type,
      displayName: createForm.displayName,
      redirectUrisRaw: createForm.redirectUrisRaw,
    });
    if (Object.keys(fieldErrs).length > 0) {
      setCreateFieldErrors(fieldErrs);
      return;
    }
    setCreateFieldErrors({});

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
    if (!editForm.displayName.trim()) {
      setEditFieldErrors({ displayName: "请输入消费方名称" });
      return;
    }
    setEditFieldErrors({});
    setEditSaving(true);
    setEditError(null);
    try {
      await updatePolicy(editForm.client.clientId, {
        displayName: editForm.displayName.trim(),
        allowAll: editForm.allowAll,
        allowedFolderIds: editForm.allowAll ? [] : editForm.allowedFolderIds,
        allowedSecretIds: editForm.allowAll ? [] : editForm.allowedSecretIds,
        allowPlaintextRead: editForm.allowPlaintextRead,
      });
      setEditForm(null);
      toast.success("权限策略已更新，秒级生效");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "更新权限失败");
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
    <div className="space-y-basalt-layout-lg">
      <PageHeader
        title="客户端与凭证"
        description="管理 OAuth 2.1 客户端（Gemini / Claude / Cursor）与无头 Bot Bearer Token，支持按文件夹与单密钥细粒度授权"
        actions={
          <div className="flex items-center gap-basalt-space-lg">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openCreate("static_oauth")}
            >
              <KeyRound className="size-basalt-icon-lg" strokeWidth={1.5} />
              新建静态 OAuth
            </Button>
            <Button type="button" size="sm" onClick={() => openCreate("bot_token")}>
              <Bot className="size-basalt-icon-lg" strokeWidth={1.5} />
              新建 Bot Token
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void reload()} />}

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
        <div className="grid gap-basalt-layout md:grid-cols-2">
          {clients.map((client) => {
            const statusMeta = getClientStatusMeta(client.status);
            return (
              <LayerCard key={client.clientId}>
                <LayerCard.Header>
                  <div className="flex w-full items-start justify-between gap-basalt-layout-sm">
                    <div className="min-w-0 space-y-basalt-space-xs">
                      <LayerCard.Title className="truncate">{client.displayName}</LayerCard.Title>
                      <LayerCard.Description className="truncate font-mono text-basalt-sm">
                        {client.clientId}
                      </LayerCard.Description>
                    </div>
                    <div className="flex shrink-0 items-center gap-basalt-space-md">
                      <Badge tone="neutral" variant="outline">
                        {getRegistrationTypeLabel(client.registrationType)}
                      </Badge>
                      <Badge tone={statusMeta.tone} variant="soft">
                        {statusMeta.label}
                      </Badge>
                    </div>
                  </div>
                </LayerCard.Header>
                <LayerCard.Body className="space-y-basalt-layout-sm">
                  <LayerCard.Well className="space-y-basalt-space-md p-basalt-card-sm text-basalt-sm">
                    <div className="flex items-center justify-between gap-basalt-space-lg">
                      <span className="text-basalt-muted-foreground">授权范围</span>
                      <span className="font-medium">{summarizeClientScope(client)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-basalt-space-lg">
                      <span className="text-basalt-muted-foreground">明文读取</span>
                      <span>{client.allowPlaintextRead ? "允许 get_secret" : "仅元数据"}</span>
                    </div>
                    {client.tokenPreview && (
                      <div className="flex items-center justify-between gap-basalt-space-lg">
                        <span className="text-basalt-muted-foreground">Token 掩码</span>
                        <span className="font-mono">{client.tokenPreview}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-basalt-space-lg">
                      <span className="text-basalt-muted-foreground">累计调用 / 最近使用</span>
                      <span className="tabular-nums">
                        {client.callCount} 次 · {formatDateTime(client.lastUsedAt)}
                      </span>
                    </div>
                  </LayerCard.Well>

                  <div className="flex flex-wrap items-center justify-end gap-basalt-space-lg">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={client.status === "revoked"}
                      onClick={() => openEdit(client)}
                    >
                      <Shield className="size-basalt-icon" strokeWidth={1.5} />
                      权限设置
                    </Button>
                    {client.registrationType === "bot_token" && client.status !== "revoked" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void rotateBotToken(client)}
                      >
                        <RefreshCw className="size-basalt-icon" strokeWidth={1.5} />
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
                            <Pause className="size-basalt-icon" strokeWidth={1.5} />
                            暂停
                          </>
                        ) : (
                          <>
                            <Play className="size-basalt-icon" strokeWidth={1.5} />
                            恢复
                          </>
                        )}
                      </Button>
                    )}
                    {client.status !== "revoked" ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setRevokingClient(client)}
                      >
                        <Ban className="size-basalt-icon" strokeWidth={1.5} />
                        吊销
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeletingClient(client)}
                      >
                        <Trash2 className="size-basalt-icon" strokeWidth={1.5} />
                        删除
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
        <DialogContent size="xl">
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
          <DialogForm onSubmit={handleCreateSubmit} noValidate>
            {createError && <Banner tone="danger" size="sm" description={createError} />}
            <Field
              label="消费方名称"
              htmlFor="create-client-name"
              error={createFieldErrors.displayName}
            >
              <Input
                id="create-client-name"
                value={createForm.displayName}
                onChange={(e) => {
                  setCreateForm((prev) => ({ ...prev, displayName: e.target.value }));
                  setCreateFieldErrors((prev) => ({ ...prev, displayName: undefined }));
                }}
                placeholder={
                  createForm.type === "bot_token"
                    ? "例如：CI 巡检 Agent"
                    : "例如：Gemini 手动客户端"
                }
                required
              />
            </Field>

            {createForm.type === "bot_token" ? (
              <Field label="过期日期（可选）" htmlFor="create-bot-expires">
                <Input
                  id="create-bot-expires"
                  type="date"
                  value={createForm.expiresAtDate}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, expiresAtDate: e.target.value }))
                  }
                />
              </Field>
            ) : (
              <div className="grid gap-basalt-layout sm:grid-cols-2">
                <Field
                  label="回调地址（每行一个）"
                  htmlFor="create-redirect-uris"
                  error={createFieldErrors.redirectUrisRaw}
                >
                  <Textarea
                    id="create-redirect-uris"
                    rows={3}
                    value={createForm.redirectUrisRaw}
                    onChange={(e) => {
                      setCreateForm((prev) => ({ ...prev, redirectUrisRaw: e.target.value }));
                      setCreateFieldErrors((prev) => ({ ...prev, redirectUrisRaw: undefined }));
                    }}
                    className="font-mono text-basalt-sm"
                  />
                </Field>
                <Field label="Token 认证方式" htmlFor="create-auth-method">
                  <FormSelect
                    id="create-auth-method"
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
                    options={AUTH_METHOD_OPTIONS}
                  />
                </Field>
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
          </DialogForm>
        </DialogContent>
      </Dialog>

      {/* Edit Policy Dialog */}
      <Dialog open={editForm !== null} onOpenChange={(open) => !open && setEditForm(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>编辑授权策略：{editForm?.client.displayName}</DialogTitle>
            <DialogDescription>
              修改文件夹或单密钥授权后，下次 `/mcp` 工具调用即刻生效，无需重新登录。
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <DialogForm onSubmit={handleEditSubmit} noValidate>
              {editError && <Banner tone="danger" size="sm" description={editError} />}
              <Field
                label="消费方名称"
                htmlFor="edit-client-name"
                error={editFieldErrors.displayName}
              >
                <Input
                  id="edit-client-name"
                  value={editForm.displayName}
                  onChange={(e) => {
                    setEditForm((prev) => (prev ? { ...prev, displayName: e.target.value } : null));
                    setEditFieldErrors({});
                  }}
                  required
                />
              </Field>

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
            </DialogForm>
          )}
        </DialogContent>
      </Dialog>

      {/* One-time Issued Credential Dialog */}
      <Dialog
        open={issuedCredential !== null}
        onOpenChange={(open) => !open && clearIssuedCredential()}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>凭证已签发：{issuedCredential?.displayName}</DialogTitle>
            <DialogDescription>
              明文凭证仅展示这一次，服务端仅存哈希，请立即妥善保存。
            </DialogDescription>
          </DialogHeader>
          {issuedCredential && (
            <DialogBody>
              <Banner
                tone="warning"
                size="sm"
                title="请立即复制保存"
                description="关闭弹窗后将无法再次查看完整明文，仅可通过轮换生成新凭证。"
              />
              {issuedCredential.kind === "bot_token" ? (
                <div className="space-y-basalt-space-lg">
                  <Label>Authorization Bearer Token</Label>
                  <LayerCard.Well className="break-all p-basalt-card-sm font-mono text-basalt-sm select-all">
                    {issuedCredential.token}
                  </LayerCard.Well>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void copyText(issuedCredential.token, "Bot Token")}
                  >
                    <Copy className="size-basalt-icon-lg" strokeWidth={1.5} />
                    复制 Bot Token
                  </Button>
                </div>
              ) : (
                <div className="space-y-basalt-layout-sm">
                  <div className="space-y-basalt-space-sm">
                    <Label>Client ID</Label>
                    <LayerCard.Well className="break-all p-basalt-card-sm font-mono text-basalt-sm select-all">
                      {issuedCredential.clientId}
                    </LayerCard.Well>
                  </div>
                  {issuedCredential.clientSecret && (
                    <div className="space-y-basalt-space-sm">
                      <Label>Client Secret</Label>
                      <LayerCard.Well className="break-all p-basalt-card-sm font-mono text-basalt-sm select-all">
                        {issuedCredential.clientSecret}
                      </LayerCard.Well>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-basalt-space-lg">
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
            </DialogBody>
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

      {/* Delete Revoked Client Confirm */}
      <AlertDialog
        open={deletingClient !== null}
        onOpenChange={(open) => !open && setDeletingClient(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除已吊销凭证「{deletingClient?.displayName}」？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该消费方策略将从列表中移除，历史审计日志仍会保留 90 天。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletingClient) return;
                try {
                  await deleteClient(deletingClient.clientId);
                  toast.success("已删除凭证记录");
                } catch (err) {
                  toast.danger(err instanceof Error ? err.message : "删除失败");
                } finally {
                  setDeletingClient(null);
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
