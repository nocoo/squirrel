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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Label,
  LayerCard,
  Skeleton,
  Switch,
  Text,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { ClipboardText } from "@nocoo/basalt/components/clipboard-text";
import { FilterBar, FilterChip } from "@nocoo/basalt/components/filter-bar";
import { InputGroup } from "@nocoo/basalt/components/input-group";
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
  TableSortableHeader,
} from "@nocoo/basalt/components/table";
import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import { TagColorPicker } from "@nocoo/basalt/components/tag-color-picker";
import {
  Eye,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "@nocoo/basalt/icons";
import { useMemo, useState } from "react";
import { DialogBody, DialogForm } from "@/components/DialogForm";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FormSelect } from "@/components/FormSelect";
import { OptionalDatePicker } from "@/components/OptionalDatePicker";
import {
  FOLDER_COLOR_LABELS,
  FOLDER_COLOR_VALUES,
  formatDateTime,
  getExpiryBadge,
  resolveFolderTagColor,
} from "@/models/format";
import type { FolderItem, SecretItem } from "@/models/types";
import {
  type FolderFieldErrors,
  type SecretFieldErrors,
  parseMetadataJson,
  parseTagsInput,
  slugifyName,
  validateFolderFields,
  validateSecretFields,
} from "@/models/validators";
import { type SecretSortKey, useSecretsViewModel } from "@/viewmodels/useSecretsViewModel";

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

function ariaSortFor(
  activeKey: SecretSortKey | null,
  dir: "asc" | "desc",
  key: SecretSortKey,
): "ascending" | "descending" | "none" {
  if (activeKey !== key) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

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
    hasActiveFilters,
    clearFilters,
    sortKey,
    sortDir,
    toggleSort,
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
  const [folderFieldErrors, setFolderFieldErrors] = useState<FolderFieldErrors>({});
  const [deletingFolder, setDeletingFolder] = useState<FolderItem | null>(null);

  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [secretForm, setSecretForm] = useState<SecretFormState>(EMPTY_SECRET_FORM);
  const [secretSaving, setSecretSaving] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretFieldErrors, setSecretFieldErrors] = useState<SecretFieldErrors>({});
  const [deletingSecret, setDeletingSecret] = useState<SecretItem | null>(null);

  const folderColorById = useMemo(
    () => new Map(folders.map((f) => [f.id, resolveFolderTagColor(f.color)])),
    [folders],
  );

  const selectedFolderLabel =
    selectedFolder === "__uncategorized__"
      ? "未分类"
      : (folders.find((f) => f.id === selectedFolder)?.name ?? selectedFolder);

  const openNewFolder = () => {
    setFolderForm(EMPTY_FOLDER_FORM);
    setFolderError(null);
    setFolderFieldErrors({});
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
    setFolderFieldErrors({});
    setFolderDialogOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrs = validateFolderFields(folderForm);
    if (Object.keys(fieldErrs).length > 0) {
      setFolderFieldErrors(fieldErrs);
      return;
    }
    setFolderFieldErrors({});
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
    setSecretFieldErrors({});
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
    setSecretFieldErrors({});
    setSecretDialogOpen(true);
  };

  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrs = validateSecretFields({
      name: secretForm.name,
      slug: secretForm.slug,
      service: secretForm.service,
      value: secretForm.value,
      isEdit: secretForm.editingId !== null,
      metadataRaw: secretForm.metadataRaw,
    });
    if (Object.keys(fieldErrs).length > 0) {
      setSecretFieldErrors(fieldErrs);
      return;
    }
    const metaParsed = parseMetadataJson(secretForm.metadataRaw);
    if (!metaParsed.ok) {
      setSecretFieldErrors({ metadataRaw: metaParsed.error });
      return;
    }
    setSecretFieldErrors({});

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

  const folderOptions = [
    { value: "__none__", label: "未分类" },
    ...folders.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <div className="space-y-basalt-layout-lg">
      <PageHeader
        title="密钥库"
        description="按文件夹归类管理 AES-256-GCM 加密凭证，支持掩码预览与按需明文查看"
        actions={
          <div className="flex items-center gap-basalt-space-lg">
            <Button type="button" variant="outline" size="sm" onClick={openNewFolder}>
              <FolderPlus className="size-basalt-icon-lg" strokeWidth={1.5} />
              新建文件夹
            </Button>
            <Button type="button" size="sm" onClick={openNewSecret}>
              <Plus className="size-basalt-icon-lg" strokeWidth={1.5} />
              新增密钥
            </Button>
          </div>
        }
        filters={
          <FilterBar
            label="筛选密钥"
            active={hasActiveFilters}
            onClear={clearFilters}
            clearLabel="清除筛选"
            chips={
              hasActiveFilters ? (
                <>
                  {selectedFolder !== "all" && (
                    <FilterChip
                      label="文件夹"
                      value={selectedFolderLabel}
                      onRemove={() => setSelectedFolder("all")}
                    />
                  )}
                  {searchQuery.trim() && (
                    <FilterChip
                      label="关键词"
                      value={searchQuery.trim()}
                      onRemove={() => setSearchQuery("")}
                    />
                  )}
                  {serviceFilter !== "all" && (
                    <FilterChip
                      label="服务"
                      value={serviceFilter}
                      onRemove={() => setServiceFilter("all")}
                    />
                  )}
                </>
              ) : undefined
            }
          >
            <InputGroup className="w-full sm:w-basalt-64">
              <InputGroup.Addon align="start">
                <Search strokeWidth={1.5} />
              </InputGroup.Addon>
              <InputGroup.Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索名称、slug、服务或标签..."
                aria-label="搜索密钥"
              />
              {searchQuery && (
                <InputGroup.Button
                  aria-label="清空搜索"
                  onClick={() => setSearchQuery("")}
                  icon={<X strokeWidth={1.5} />}
                />
              )}
            </InputGroup>

            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-full sm:w-44" aria-label="按服务筛选">
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
          </FilterBar>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void reload()} />}

      <LayerCard padding="none">
        <div className="grid min-w-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside
            aria-label="文件夹筛选"
            className="min-w-0 border-b border-basalt-border p-basalt-card-sm lg:border-r lg:border-b-0"
          >
            <div className="mb-basalt-space-lg px-basalt-space-lg">
              <h2 className="text-basalt-sm font-medium text-basalt-muted-foreground">文件夹</h2>
            </div>

            {loading && secrets.length === 0 ? (
              <div role="status" aria-label="加载文件夹..." className="space-y-basalt-space-lg">
                {Array.from({ length: 4 }, (_, idx) => (
                  <Skeleton key={idx} variant="block" height={28} />
                ))}
              </div>
            ) : (
              <div className="space-y-basalt-space-sm">
                <Button
                  type="button"
                  variant={selectedFolder === "all" ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => setSelectedFolder("all")}
                >
                  <span className="flex items-center gap-basalt-space-lg">
                    <Folder className="size-basalt-icon-lg" strokeWidth={1.5} />
                    全部密钥
                  </span>
                  <Badge tone="neutral" variant="soft" className="tabular-nums">
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
                  <span className="flex items-center gap-basalt-space-lg">
                    <Folder
                      className="size-basalt-icon-lg text-basalt-muted-foreground"
                      strokeWidth={1.5}
                    />
                    未分类
                  </span>
                  <Badge tone="neutral" variant="soft" className="tabular-nums">
                    {uncategorizedCount}
                  </Badge>
                </Button>

                {folders.map((folder) => (
                  <div key={folder.id} className="group flex items-center gap-basalt-space-sm">
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
                      <Badge tone="neutral" variant="soft" className="tabular-nums">
                        {folder.secretCount}
                      </Badge>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`文件夹操作 ${folder.name}`}
                          className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
                        >
                          <MoreHorizontal className="size-basalt-icon" strokeWidth={1.5} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEditFolder(folder)}>
                          <Pencil className="size-basalt-icon" strokeWidth={1.5} />
                          编辑文件夹
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeletingFolder(folder)}
                        >
                          <Trash2 className="size-basalt-icon" strokeWidth={1.5} />
                          删除文件夹
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <div className="min-w-0">
            {loading && secrets.length === 0 ? (
              <div role="status" aria-label="加载密钥列表..." className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称 / Slug</TableHead>
                      <TableHead>文件夹</TableHead>
                      <TableHead>服务</TableHead>
                      <TableHead>掩码预览</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>最近读取</TableHead>
                      <TableHead textAlign="end">调用次数</TableHead>
                      <TableHead textAlign="end">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 6 }, (_, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="space-y-basalt-space-xs">
                            <Skeleton width={120} height={14} />
                            <Skeleton width={96} height={12} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Skeleton width={72} height={20} />
                        </TableCell>
                        <TableCell>
                          <Skeleton width={64} height={14} />
                        </TableCell>
                        <TableCell>
                          <Skeleton width={88} height={14} />
                        </TableCell>
                        <TableCell>
                          <Skeleton width={48} height={20} />
                        </TableCell>
                        <TableCell>
                          <Skeleton width={84} height={14} />
                        </TableCell>
                        <TableCell textAlign="end">
                          <Skeleton width={40} height={14} className="ml-auto" />
                        </TableCell>
                        <TableCell textAlign="end">
                          <Skeleton width={56} height={24} className="ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : filteredSecrets.length === 0 ? (
              secrets.length === 0 ? (
                <LayerCard.Empty
                  title="暂无密钥"
                  description="尚未录入任何 API Key 或 Token，点击下方按钮立即新增"
                  action={
                    <Button type="button" size="sm" onClick={openNewSecret}>
                      新增密钥
                    </Button>
                  }
                  className="p-basalt-card-lg"
                />
              ) : (
                <LayerCard.Empty
                  title="没有匹配的密钥"
                  description="当前筛选条件下没有结果"
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  }
                  className="p-basalt-card-lg"
                />
              )
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead aria-sort={ariaSortFor(sortKey, sortDir, "name")}>
                        <TableSortableHeader
                          sorted={sortKey === "name" ? sortDir : undefined}
                          onClick={() => toggleSort("name")}
                        >
                          名称 / Slug
                        </TableSortableHeader>
                      </TableHead>
                      <TableHead>文件夹</TableHead>
                      <TableHead aria-sort={ariaSortFor(sortKey, sortDir, "service")}>
                        <TableSortableHeader
                          sorted={sortKey === "service" ? sortDir : undefined}
                          onClick={() => toggleSort("service")}
                        >
                          服务
                        </TableSortableHeader>
                      </TableHead>
                      <TableHead>掩码预览</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead aria-sort={ariaSortFor(sortKey, sortDir, "lastUsedAt")}>
                        <TableSortableHeader
                          sorted={sortKey === "lastUsedAt" ? sortDir : undefined}
                          onClick={() => toggleSort("lastUsedAt")}
                        >
                          最近读取
                        </TableSortableHeader>
                      </TableHead>
                      <TableHead
                        textAlign="end"
                        aria-sort={ariaSortFor(sortKey, sortDir, "useCount")}
                      >
                        <TableSortableHeader
                          textAlign="end"
                          sorted={sortKey === "useCount" ? sortDir : undefined}
                          onClick={() => toggleSort("useCount")}
                        >
                          调用次数
                        </TableSortableHeader>
                      </TableHead>
                      <TableHead textAlign="end">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSecrets.map((item) => {
                      const expiry = getExpiryBadge(item.expiresAt);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="max-w-44 truncate font-medium">{item.name}</div>
                            <div className="max-w-44 truncate font-mono text-basalt-sm text-basalt-muted-foreground">
                              {item.slug}
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.folderName ? (
                              <TagBadge
                                name={item.folderName}
                                color={
                                  item.folderId ? folderColorById.get(item.folderId) : undefined
                                }
                                colorKey={item.folderId ?? item.folderName}
                                size="sm"
                                className="whitespace-nowrap"
                              />
                            ) : (
                              <Text className="whitespace-nowrap text-basalt-sm text-basalt-muted-foreground">
                                未分类
                              </Text>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-basalt-sm">
                            {item.service}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-basalt-sm text-basalt-muted-foreground">
                            {item.maskedPreview}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-nowrap items-center gap-basalt-space-md">
                              <Badge
                                tone={item.isEnabled ? "success" : "neutral"}
                                variant="soft"
                                className="whitespace-nowrap"
                              >
                                {item.isEnabled ? "启用" : "停用"}
                              </Badge>
                              {expiry && (
                                <Badge
                                  tone={expiry.tone}
                                  variant="outline"
                                  className="whitespace-nowrap"
                                >
                                  {expiry.label}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-basalt-sm text-basalt-muted-foreground tabular-nums">
                            {formatDateTime(item.lastUsedAt)}
                          </TableCell>
                          <TableCell
                            textAlign="end"
                            className="whitespace-nowrap font-mono text-basalt-sm tabular-nums"
                          >
                            {item.useCount}
                          </TableCell>
                          <TableCell textAlign="end" className="whitespace-nowrap">
                            <div className="flex items-center justify-end gap-basalt-space-sm">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`查看明文 ${item.name}`}
                                    onClick={() => void handleReveal(item)}
                                  >
                                    <Eye className="size-basalt-icon-lg" strokeWidth={1.5} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>查看明文</TooltipContent>
                              </Tooltip>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`更多操作 ${item.name}`}
                                  >
                                    <MoreHorizontal
                                      className="size-basalt-icon-lg"
                                      strokeWidth={1.5}
                                    />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => openEditSecret(item)}>
                                    <Pencil className="size-basalt-icon" strokeWidth={1.5} />
                                    编辑密钥
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setDeletingSecret(item)}
                                  >
                                    <Trash2 className="size-basalt-icon" strokeWidth={1.5} />
                                    删除密钥
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </LayerCard>

      {/* Folder Create / Edit Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{folderForm.editingId ? "编辑文件夹" : "新建文件夹"}</DialogTitle>
            <DialogDescription>
              通过文件夹组织凭证，方便为 OAuth 客户端或 Bot Token 一键批量授权。
            </DialogDescription>
          </DialogHeader>
          <DialogForm onSubmit={handleSaveFolder} noValidate>
            {folderError && <Banner tone="danger" size="sm" description={folderError} />}
            <Field label="文件夹名称" htmlFor="folder-name" error={folderFieldErrors.name}>
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
                  setFolderFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="例如：个人开发工具"
                required
              />
            </Field>
            <Field label="唯一标识（Slug）" htmlFor="folder-slug" error={folderFieldErrors.slug}>
              <Input
                id="folder-slug"
                value={folderForm.slug}
                onChange={(e) => {
                  setFolderForm((prev) => ({ ...prev, slug: e.target.value }));
                  setFolderFieldErrors((prev) => ({ ...prev, slug: undefined }));
                }}
                placeholder="例如：dev-tools"
                required
              />
            </Field>
            <Field label="颜色标识" htmlFor="folder-color">
              <TagColorPicker
                id="folder-color"
                label="颜色标识"
                colors={FOLDER_COLOR_VALUES}
                labels={FOLDER_COLOR_LABELS}
                value={resolveFolderTagColor(folderForm.color)}
                onValueChange={(color) => setFolderForm((prev) => ({ ...prev, color }))}
              />
            </Field>
            <Field label="描述（可选）" htmlFor="folder-desc">
              <Input
                id="folder-desc"
                value={folderForm.description}
                onChange={(e) =>
                  setFolderForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="说明该文件夹内凭证的用途范围"
              />
            </Field>
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
          <DialogForm onSubmit={handleSaveSecret} noValidate>
            {secretError && <Banner tone="danger" size="sm" description={secretError} />}
            <div className="grid gap-basalt-layout sm:grid-cols-2">
              <Field label="名称" htmlFor="secret-name" error={secretFieldErrors.name}>
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
                    setSecretFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="Cloudflare DNS 只读 Token"
                  required
                />
              </Field>
              <Field label="Slug" htmlFor="secret-slug" error={secretFieldErrors.slug}>
                <Input
                  id="secret-slug"
                  value={secretForm.slug}
                  onChange={(e) => {
                    setSecretForm((prev) => ({ ...prev, slug: e.target.value }));
                    setSecretFieldErrors((prev) => ({ ...prev, slug: undefined }));
                  }}
                  placeholder="cloudflare-dns-readonly"
                  required
                />
              </Field>
            </div>

            <div className="grid gap-basalt-layout sm:grid-cols-2">
              <Field label="归属服务" htmlFor="secret-service" error={secretFieldErrors.service}>
                <Input
                  id="secret-service"
                  value={secretForm.service}
                  onChange={(e) => {
                    setSecretForm((prev) => ({ ...prev, service: e.target.value }));
                    setSecretFieldErrors((prev) => ({ ...prev, service: undefined }));
                  }}
                  placeholder="例如：cloudflare、github"
                  required
                />
              </Field>
              <Field label="所属文件夹" htmlFor="secret-folder">
                <FormSelect
                  id="secret-folder"
                  value={secretForm.folderId}
                  onValueChange={(value) => setSecretForm((prev) => ({ ...prev, folderId: value }))}
                  options={folderOptions}
                />
              </Field>
            </div>

            <Field
              label={secretForm.editingId ? "轮换密钥值（留空则保持原值）" : "密钥明文值"}
              htmlFor="secret-value"
              error={secretFieldErrors.value}
            >
              <SensitiveInput
                id="secret-value"
                value={secretForm.value}
                onChange={(e) => {
                  setSecretForm((prev) => ({ ...prev, value: e.target.value }));
                  setSecretFieldErrors((prev) => ({ ...prev, value: undefined }));
                }}
                placeholder={secretForm.editingId ? "输入新密钥以替换" : "粘贴 API Key 或 Token"}
                revealLabel="显示密钥"
                hideLabel="隐藏密钥"
                passwordManagerIgnore
              />
            </Field>

            <Field label="AI 用途说明" htmlFor="secret-desc">
              <Input
                id="secret-desc"
                value={secretForm.description}
                onChange={(e) =>
                  setSecretForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="供 AI 检索匹配使用，例如：查询个人域名 DNS 解析记录"
              />
            </Field>

            <div className="grid gap-basalt-layout sm:grid-cols-2">
              <Field label="标签（逗号分隔）" htmlFor="secret-tags">
                <Input
                  id="secret-tags"
                  value={secretForm.tagsRaw}
                  onChange={(e) => setSecretForm((prev) => ({ ...prev, tagsRaw: e.target.value }))}
                  placeholder="dns, readonly, gemini"
                />
              </Field>
              <Field label="过期日期（可选）" htmlFor="secret-expires">
                <OptionalDatePicker
                  id="secret-expires"
                  value={secretForm.expiresAtDate}
                  onChange={(value) => setSecretForm((prev) => ({ ...prev, expiresAtDate: value }))}
                />
              </Field>
            </div>

            <Field
              label="附加非敏感元数据（JSON）"
              htmlFor="secret-metadata"
              error={secretFieldErrors.metadataRaw}
            >
              <Textarea
                id="secret-metadata"
                rows={3}
                value={secretForm.metadataRaw}
                onChange={(e) => {
                  setSecretForm((prev) => ({ ...prev, metadataRaw: e.target.value }));
                  setSecretFieldErrors((prev) => ({ ...prev, metadataRaw: undefined }));
                }}
                className="font-mono text-basalt-sm"
                placeholder='{"base_url": "https://api.cloudflare.com/client/v4"}'
              />
            </Field>

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
              <ClipboardText
                text={revealed.value}
                copyLabel="复制密钥明文"
                className="flex w-full [&>code]:flex-1"
              />
            </DialogBody>
          )}
          <DialogFooter>
            <Button type="button" onClick={clearRevealed}>
              关闭
            </Button>
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
