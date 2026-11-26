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
  Switch,
  Text,
  Textarea,
  toast,
} from "@nocoo/basalt";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";
import { SensitiveInput } from "@nocoo/basalt/components/sensitive-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nocoo/basalt/components/table";
import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import { Copy, Eye, Folder, FolderPlus, Pencil, Plus, Search, Trash2 } from "@nocoo/basalt/icons";
import { useState } from "react";
import { DialogBody, DialogForm } from "@/components/DialogForm";
import {
  FOLDER_COLOR_OPTIONS,
  formatDateTime,
  getExpiryBadge,
  resolveFolderTagColor,
} from "@/models/format";
import type { FolderItem, SecretItem } from "@/models/types";
import {
  parseMetadataJson,
  parseTagsInput,
  slugifyName,
  validateFolderForm,
  validateSecretForm,
} from "@/models/validators";
import { useSecretsViewModel } from "@/viewmodels/useSecretsViewModel";

interface FolderFormState {
  editingId: string | null;
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
}

interface SecretFormState {
  editingId: string | null;
  folderId: string;
  name: string;
  slug: string;
  service: string;
  value: string;
  description: string;
  tagsRaw: string;
  metadataRaw: string;
  isEnabled: boolean;
  expiresAtDate: string;
}

const EMPTY_FOLDER_FORM: FolderFormState = {
  editingId: null,
  name: "",
  slug: "",
  description: "",
  color: "amber",
  sortOrder: 0,
};

const EMPTY_SECRET_FORM: SecretFormState = {
  editingId: null,
  folderId: "__none__",
  name: "",
  slug: "",
  service: "",
  value: "",
  description: "",
  tagsRaw: "",
  metadataRaw: "{}",
  isEnabled: true,
  expiresAtDate: "",
};

export default function SecretsPage() {
  const {
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
  } = useSecretsViewModel();

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderForm, setFolderForm] = useState<FolderFormState>(EMPTY_FOLDER_FORM);
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderItem | null>(null);

  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [secretForm, setSecretForm] = useState<SecretFormState>(EMPTY_SECRET_FORM);
  const [secretSaving, setSecretSaving] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [deletingSecret, setDeletingSecret] = useState<SecretItem | null>(null);

  const openNewFolder = () => {
    setFolderForm(EMPTY_FOLDER_FORM);
    setFolderError(null);
    setFolderDialogOpen(true);
  };

  const openEditFolder = (folder: FolderItem) => {
    setFolderForm({
      editingId: folder.id,
      name: folder.name,
      slug: folder.slug,
      description: folder.description,
      color: folder.color,
      sortOrder: folder.sortOrder,
    });
    setFolderError(null);
    setFolderDialogOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validateFolderForm(folderForm);
    if (validationErr) {
      setFolderError(validationErr);
      return;
    }
    setFolderSaving(true);
    setFolderError(null);
    try {
      await saveFolder(folderForm.editingId, {
        name: folderForm.name.trim(),
        slug: folderForm.slug.trim(),
        description: folderForm.description.trim(),
        color: folderForm.color,
        sortOrder: folderForm.sortOrder,
      });
      setFolderDialogOpen(false);
      toast.success(folderForm.editingId ? "文件夹已更新" : "文件夹已创建");
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "保存文件夹失败");
    } finally {
      setFolderSaving(false);
    }
  };

  const openNewSecret = () => {
    setSecretForm({
      ...EMPTY_SECRET_FORM,
      folderId:
        selectedFolder !== "all" && selectedFolder !== "__uncategorized__"
          ? selectedFolder
          : "__none__",
    });
    setSecretError(null);
    setSecretDialogOpen(true);
  };

  const openEditSecret = (item: SecretItem) => {
    setSecretForm({
      editingId: item.id,
      folderId: item.folderId ?? "__none__",
      name: item.name,
      slug: item.slug,
      service: item.service,
      value: "",
      description: item.description,
      tagsRaw: item.tags.join(", "),
      metadataRaw: JSON.stringify(item.metadata, null, 2),
      isEnabled: item.isEnabled,
      expiresAtDate: item.expiresAt ? item.expiresAt.slice(0, 10) : "",
    });
    setSecretError(null);
    setSecretDialogOpen(true);
  };

  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validateSecretForm({
      name: secretForm.name,
      slug: secretForm.slug,
      service: secretForm.service,
      value: secretForm.value,
      isEdit: secretForm.editingId !== null,
      metadataRaw: secretForm.metadataRaw,
    });
    if (validationErr) {
      setSecretError(validationErr);
      return;
    }
    const metaParsed = parseMetadataJson(secretForm.metadataRaw);
    if (!metaParsed.ok) {
      setSecretError(metaParsed.error);
      return;
    }

    setSecretSaving(true);
    setSecretError(null);
    try {
      await saveSecret(secretForm.editingId, {
        folderId: secretForm.folderId === "__none__" ? null : secretForm.folderId,
        slug: secretForm.slug.trim(),
        name: secretForm.name.trim(),
        service: secretForm.service.trim(),
        ...(secretForm.value ? { value: secretForm.value } : {}),
        description: secretForm.description.trim(),
        tags: parseTagsInput(secretForm.tagsRaw),
        metadata: metaParsed.value,
        isEnabled: secretForm.isEnabled,
        expiresAt: secretForm.expiresAtDate
          ? new Date(`${secretForm.expiresAtDate}T23:59:59Z`).toISOString()
          : null,
      });
      setSecretDialogOpen(false);
      toast.success(secretForm.editingId ? "密钥已更新" : "密钥已加密入库");
    } catch (err) {
      setSecretError(err instanceof Error ? err.message : "保存密钥失败");
    } finally {
      setSecretSaving(false);
    }
  };

  const handleReveal = async (item: SecretItem) => {
    try {
      await revealSecret(item);
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "解密失败");
    }
  };

  const copyValue = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制到剪贴板`);
    } catch {
      toast.danger("复制失败，请手动复制");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="密钥库"
        description="按文件夹归类管理 AES-256-GCM 加密凭证，支持掩码预览与按需明文查看"
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openNewFolder}>
              <FolderPlus className="h-4 w-4" strokeWidth={1.5} />
              新建文件夹
            </Button>
            <Button type="button" size="sm" onClick={openNewSecret}>
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              新增密钥
            </Button>
          </div>
        }
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-basalt-muted-foreground"
                strokeWidth={1.5}
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索名称、slug、服务或标签..."
                className="pl-8"
                aria-label="搜索密钥"
              />
            </div>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger size="sm" className="w-44" aria-label="按服务筛选">
                <SelectValue placeholder="全部服务" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部服务</SelectItem>
                {services.map((svc) => (
                  <SelectItem key={svc} value={svc}>
                    {svc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <LayerCard padding="sm" className="h-fit">
          <LayerCard.Header className="pb-2">
            <LayerCard.Title className="text-basalt-base">文件夹</LayerCard.Title>
          </LayerCard.Header>
          <LayerCard.Body className="space-y-1">
            <Button
              type="button"
              variant={selectedFolder === "all" ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-between"
              onClick={() => setSelectedFolder("all")}
            >
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4" strokeWidth={1.5} />
                全部密钥
              </span>
              <Badge tone="neutral" variant="soft">
                {secrets.length}
              </Badge>
            </Button>
            <Button
              type="button"
              variant={selectedFolder === "__uncategorized__" ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-between"
              onClick={() => setSelectedFolder("__uncategorized__")}
            >
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
                未分类
              </span>
              <Badge tone="neutral" variant="soft">
                {uncategorizedCount}
              </Badge>
            </Button>

            {folders.map((folder) => (
              <div key={folder.id} className="group flex items-center gap-1">
                <Button
                  type="button"
                  variant={selectedFolder === folder.id ? "secondary" : "ghost"}
                  size="sm"
                  className="min-w-0 flex-1 justify-between"
                  onClick={() => setSelectedFolder(folder.id)}
                >
                  <span className="truncate">
                    <TagBadge
                      name={folder.name}
                      color={resolveFolderTagColor(folder.color)}
                      size="sm"
                    />
                  </span>
                  <Badge tone="neutral" variant="soft">
                    {folder.secretCount}
                  </Badge>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`编辑文件夹 ${folder.name}`}
                  onClick={() => openEditFolder(folder)}
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除文件夹 ${folder.name}`}
                  onClick={() => setDeletingFolder(folder)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            ))}
          </LayerCard.Body>
        </LayerCard>

        <LayerCard padding="none">
          <LayerCard.Body className="p-0">
            {loading && secrets.length === 0 ? (
              <div className="p-6">
                <LayerCard.Loading label="加载密钥列表..." />
              </div>
            ) : filteredSecrets.length === 0 ? (
              <div className="p-6">
                <LayerCard.Empty
                  title="暂无密钥"
                  description="点击右上角「新增密钥」录入你的第一个 API Key 或 Token"
                  action={
                    <Button type="button" size="sm" onClick={openNewSecret}>
                      新增密钥
                    </Button>
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称 / Slug</TableHead>
                    <TableHead>文件夹</TableHead>
                    <TableHead>服务</TableHead>
                    <TableHead>掩码预览</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>最近读取</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSecrets.map((item) => {
                    const expiry = getExpiryBadge(item.expiresAt);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          <div className="font-mono text-basalt-sm text-basalt-muted-foreground">
                            {item.slug}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.folderName ? (
                            <TagBadge
                              name={item.folderName}
                              colorKey={item.folderId ?? item.folderName}
                              size="sm"
                            />
                          ) : (
                            <Text className="text-basalt-sm text-basalt-muted-foreground">
                              未分类
                            </Text>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-basalt-sm">{item.service}</TableCell>
                        <TableCell className="font-mono text-basalt-sm text-basalt-muted-foreground">
                          {item.maskedPreview}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={item.isEnabled ? "success" : "neutral"} variant="soft">
                              {item.isEnabled ? "启用" : "停用"}
                            </Badge>
                            {expiry && (
                              <Badge tone={expiry.tone} variant="outline">
                                {expiry.label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-basalt-sm text-basalt-muted-foreground tabular-nums">
                          {formatDateTime(item.lastUsedAt)} · {item.useCount} 次
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`查看明文 ${item.name}`}
                              onClick={() => void handleReveal(item)}
                            >
                              <Eye className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`编辑密钥 ${item.name}`}
                              onClick={() => openEditSecret(item)}
                            >
                              <Pencil className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`删除密钥 ${item.name}`}
                              onClick={() => setDeletingSecret(item)}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </LayerCard.Body>
        </LayerCard>
      </div>

      {/* Folder Create / Edit Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{folderForm.editingId ? "编辑文件夹" : "新建文件夹"}</DialogTitle>
            <DialogDescription>
              通过文件夹组织凭证，方便为 OAuth 客户端或 Bot Token 一键批量授权。
            </DialogDescription>
          </DialogHeader>
          <DialogForm onSubmit={handleSaveFolder}>
            {folderError && (
              <Text className="text-basalt-sm text-basalt-destructive">{folderError}</Text>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="folder-name">文件夹名称</Label>
              <Input
                id="folder-name"
                value={folderForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setFolderForm((prev) => ({
                    ...prev,
                    name,
                    slug: prev.editingId ? prev.slug : slugifyName(name) || prev.slug,
                  }));
                }}
                placeholder="例如：个人开发工具"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="folder-slug">唯一标识（Slug）</Label>
              <Input
                id="folder-slug"
                value={folderForm.slug}
                onChange={(e) => setFolderForm((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="例如：dev-tools"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="folder-color">颜色标识</Label>
              <Select
                value={folderForm.color}
                onValueChange={(value) => setFolderForm((prev) => ({ ...prev, color: value }))}
              >
                <SelectTrigger id="folder-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLDER_COLOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="folder-desc">描述（可选）</Label>
              <Input
                id="folder-desc"
                value={folderForm.description}
                onChange={(e) =>
                  setFolderForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="说明该文件夹内凭证的用途范围"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFolderDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={folderSaving}>
                {folderSaving ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      {/* Secret Create / Edit Dialog */}
      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{secretForm.editingId ? "编辑密钥" : "新增密钥"}</DialogTitle>
            <DialogDescription>
              明文将使用服务端 AES-256-GCM 密钥加密存储，前端不缓存明文。
            </DialogDescription>
          </DialogHeader>
          <DialogForm onSubmit={handleSaveSecret}>
            {secretError && (
              <Text className="text-basalt-sm text-basalt-destructive">{secretError}</Text>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="secret-name">名称</Label>
                <Input
                  id="secret-name"
                  value={secretForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setSecretForm((prev) => ({
                      ...prev,
                      name,
                      slug: prev.editingId ? prev.slug : slugifyName(name) || prev.slug,
                    }));
                  }}
                  placeholder="Cloudflare DNS 只读 Token"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secret-slug">Slug</Label>
                <Input
                  id="secret-slug"
                  value={secretForm.slug}
                  onChange={(e) => setSecretForm((prev) => ({ ...prev, slug: e.target.value }))}
                  placeholder="cloudflare-dns-readonly"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="secret-service">归属服务</Label>
                <Input
                  id="secret-service"
                  value={secretForm.service}
                  onChange={(e) => setSecretForm((prev) => ({ ...prev, service: e.target.value }))}
                  placeholder="cloudflare / github / openai"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secret-folder">所属文件夹</Label>
                <Select
                  value={secretForm.folderId}
                  onValueChange={(value) => setSecretForm((prev) => ({ ...prev, folderId: value }))}
                >
                  <SelectTrigger id="secret-folder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未分类</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="secret-value">
                {secretForm.editingId ? "轮换密钥值（留空则保持原值）" : "密钥明文值"}
              </Label>
              <SensitiveInput
                id="secret-value"
                value={secretForm.value}
                onChange={(e) => setSecretForm((prev) => ({ ...prev, value: e.target.value }))}
                placeholder={secretForm.editingId ? "输入新密钥以替换" : "粘贴 API Key 或 Token"}
                revealLabel="显示密钥"
                hideLabel="隐藏密钥"
                passwordManagerIgnore
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="secret-desc">AI 用途说明</Label>
              <Input
                id="secret-desc"
                value={secretForm.description}
                onChange={(e) =>
                  setSecretForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="供 AI 检索匹配使用，例如：查询个人域名 DNS 解析记录"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="secret-tags">标签（逗号分隔）</Label>
                <Input
                  id="secret-tags"
                  value={secretForm.tagsRaw}
                  onChange={(e) => setSecretForm((prev) => ({ ...prev, tagsRaw: e.target.value }))}
                  placeholder="dns, readonly, gemini"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secret-expires">过期日期（可选）</Label>
                <Input
                  id="secret-expires"
                  type="date"
                  value={secretForm.expiresAtDate}
                  onChange={(e) =>
                    setSecretForm((prev) => ({ ...prev, expiresAtDate: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="secret-metadata">附加非敏感元数据（JSON）</Label>
              <Textarea
                id="secret-metadata"
                rows={3}
                value={secretForm.metadataRaw}
                onChange={(e) =>
                  setSecretForm((prev) => ({ ...prev, metadataRaw: e.target.value }))
                }
                className="font-mono text-basalt-sm"
                placeholder='{"base_url": "https://api.cloudflare.com/client/v4"}'
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="secret-enabled">启用该密钥</Label>
              <Switch
                id="secret-enabled"
                checked={secretForm.isEnabled}
                onCheckedChange={(checked) =>
                  setSecretForm((prev) => ({ ...prev, isEnabled: checked }))
                }
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSecretDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={secretSaving}>
                {secretSaving ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      {/* Reveal Secret Plaintext Dialog */}
      <Dialog open={revealed !== null} onOpenChange={(open) => !open && clearRevealed()}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>明文密钥：{revealed?.name}</DialogTitle>
            <DialogDescription>
              本次查看已写入审计日志（admin_reveal）。关闭弹窗后不会在前端缓存。
            </DialogDescription>
          </DialogHeader>
          {revealed && (
            <DialogBody>
              <Text className="font-mono text-basalt-sm text-basalt-muted-foreground">
                Slug: {revealed.slug}
              </Text>
              <LayerCard.Well className="break-all p-3 font-mono text-basalt-md select-all">
                {revealed.value}
              </LayerCard.Well>
            </DialogBody>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={clearRevealed}>
              关闭
            </Button>
            {revealed && (
              <Button type="button" onClick={() => void copyValue(revealed.value, "密钥明文")}>
                <Copy className="h-4 w-4" strokeWidth={1.5} />
                复制明文
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Confirm */}
      <AlertDialog
        open={deletingFolder !== null}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件夹「{deletingFolder?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              文件夹内的密钥不会被删除，它们将自动变为「未分类」状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletingFolder) return;
                try {
                  await removeFolder(deletingFolder.id);
                  toast.success("文件夹已删除");
                } catch (err) {
                  toast.danger(err instanceof Error ? err.message : "删除失败");
                } finally {
                  setDeletingFolder(null);
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Secret Confirm */}
      <AlertDialog
        open={deletingSecret !== null}
        onOpenChange={(open) => !open && setDeletingSecret(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除密钥「{deletingSecret?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后密文无法恢复，关联消费方调用该密钥时将返回未找到。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletingSecret) return;
                try {
                  await removeSecret(deletingSecret.id);
                  toast.success("密钥已删除");
                } catch (err) {
                  toast.danger(err instanceof Error ? err.message : "删除失败");
                } finally {
                  setDeletingSecret(null);
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
