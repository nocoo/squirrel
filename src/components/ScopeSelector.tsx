import { Badge, Checkbox, Label, LayerCard, ScrollArea, Switch, Text } from "@nocoo/basalt";
import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import { resolveFolderTagColor } from "@/models/format";
import type { FolderItem } from "@/models/types";

export interface ScopeSecretOption {
  id: string;
  slug: string;
  name: string;
  service: string;
  folderId: string | null;
  folderName: string | null;
}

interface ScopeSelectorProps {
  folders: FolderItem[];
  secrets: ScopeSecretOption[];
  allowAll: boolean;
  onAllowAllChange: (value: boolean) => void;
  allowedFolderIds: string[];
  onAllowedFolderIdsChange: (ids: string[]) => void;
  allowedSecretIds: string[];
  onAllowedSecretIdsChange: (ids: string[]) => void;
  allowPlaintextRead: boolean;
  onAllowPlaintextReadChange: (value: boolean) => void;
  idPrefix?: string;
}

function toggleString(list: string[], id: string, checked: boolean): string[] {
  if (checked) {
    return list.includes(id) ? list : [...list, id];
  }
  return list.filter((item) => item !== id);
}

export function ScopeSelector({
  folders,
  secrets,
  allowAll,
  onAllowAllChange,
  allowedFolderIds,
  onAllowedFolderIdsChange,
  allowedSecretIds,
  onAllowedSecretIdsChange,
  allowPlaintextRead,
  onAllowPlaintextReadChange,
  idPrefix = "scope",
}: ScopeSelectorProps) {
  return (
    <div className="space-y-basalt-layout">
      <LayerCard.Well className="flex items-center justify-between gap-basalt-layout p-basalt-card-sm">
        <div className="space-y-basalt-space-xs">
          <Label htmlFor={`${idPrefix}-allow-plaintext`} className="text-basalt-base font-medium">
            允许读取明文密钥（get_secret）
          </Label>
          <Text className="text-basalt-sm text-basalt-muted-foreground">
            关闭后该消费方仅能调用 list_secrets / search_secrets 查看元数据
          </Text>
        </div>
        <Switch
          id={`${idPrefix}-allow-plaintext`}
          checked={allowPlaintextRead}
          onCheckedChange={onAllowPlaintextReadChange}
        />
      </LayerCard.Well>

      <LayerCard.Well className="flex items-center justify-between gap-basalt-layout p-basalt-card-sm">
        <div className="space-y-basalt-space-xs">
          <Label htmlFor={`${idPrefix}-allow-all`} className="text-basalt-base font-medium">
            授予全部密钥权限（*）
          </Label>
          <Text className="text-basalt-sm text-basalt-muted-foreground">
            开启后可访问所有文件夹及未来新增的全部密钥
          </Text>
        </div>
        <Switch
          id={`${idPrefix}-allow-all`}
          checked={allowAll}
          onCheckedChange={onAllowAllChange}
        />
      </LayerCard.Well>

      {!allowAll && (
        <div className="grid gap-basalt-layout md:grid-cols-2">
          <LayerCard padding="sm" outlined>
            <LayerCard.Header>
              <div className="min-w-0 space-y-basalt-space-xs">
                <LayerCard.Title>按文件夹授权</LayerCard.Title>
                <LayerCard.Description className="text-basalt-sm">
                  已选 {allowedFolderIds.length} 个（包含文件夹内动态新增密钥）
                </LayerCard.Description>
              </div>
            </LayerCard.Header>
            <LayerCard.Body>
              {folders.length === 0 ? (
                <Text className="py-basalt-layout text-center text-basalt-sm text-basalt-muted-foreground">
                  暂无文件夹
                </Text>
              ) : (
                <ScrollArea className="h-basalt-40 pr-basalt-space-lg">
                  <div className="space-y-basalt-space-lg">
                    {folders.map((folder) => {
                      const checked = allowedFolderIds.includes(folder.id);
                      const checkboxId = `${idPrefix}-folder-${folder.id}`;
                      return (
                        <div
                          key={folder.id}
                          className="flex items-center justify-between gap-basalt-space-lg py-basalt-space-sm"
                        >
                          <div className="flex min-w-0 items-center gap-basalt-space-lg">
                            <Checkbox
                              id={checkboxId}
                              checked={checked}
                              onCheckedChange={(val) =>
                                onAllowedFolderIdsChange(
                                  toggleString(allowedFolderIds, folder.id, val === true),
                                )
                              }
                            />
                            <Label htmlFor={checkboxId} className="cursor-pointer truncate">
                              <TagBadge
                                name={folder.name}
                                color={resolveFolderTagColor(folder.color)}
                                size="sm"
                              />
                            </Label>
                          </div>
                          <Badge tone="neutral" variant="soft">
                            {folder.secretCount}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </LayerCard.Body>
          </LayerCard>

          <LayerCard padding="sm" outlined>
            <LayerCard.Header>
              <div className="min-w-0 space-y-basalt-space-xs">
                <LayerCard.Title>按单个密钥授权</LayerCard.Title>
                <LayerCard.Description className="text-basalt-sm">
                  已选 {allowedSecretIds.length} 个（叠加授权独立密钥）
                </LayerCard.Description>
              </div>
            </LayerCard.Header>
            <LayerCard.Body>
              {secrets.length === 0 ? (
                <Text className="py-basalt-layout text-center text-basalt-sm text-basalt-muted-foreground">
                  暂无密钥
                </Text>
              ) : (
                <ScrollArea className="h-basalt-40 pr-basalt-space-lg">
                  <div className="space-y-basalt-space-lg">
                    {secrets.map((secret) => {
                      const checked = allowedSecretIds.includes(secret.id);
                      const coveredByFolder =
                        secret.folderId !== null && allowedFolderIds.includes(secret.folderId);
                      const checkboxId = `${idPrefix}-secret-${secret.id}`;
                      return (
                        <div
                          key={secret.id}
                          className="flex items-center justify-between gap-basalt-space-lg py-basalt-space-sm"
                        >
                          <div className="flex min-w-0 items-center gap-basalt-space-lg">
                            <Checkbox
                              id={checkboxId}
                              checked={checked || coveredByFolder}
                              disabled={coveredByFolder}
                              onCheckedChange={(val) =>
                                onAllowedSecretIdsChange(
                                  toggleString(allowedSecretIds, secret.id, val === true),
                                )
                              }
                            />
                            <Label
                              htmlFor={checkboxId}
                              className="cursor-pointer truncate text-basalt-md"
                            >
                              {secret.name}
                            </Label>
                          </div>
                          <Text className="shrink-0 font-mono text-basalt-sm text-basalt-muted-foreground">
                            {secret.service}
                          </Text>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </LayerCard.Body>
          </LayerCard>
        </div>
      )}
    </div>
  );
}
