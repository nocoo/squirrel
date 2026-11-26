import { Badge, Button, Input, Label, LayerCard, Text } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { AlertTriangle, ShieldCheck } from "@nocoo/basalt/icons";
import { useSearchParams } from "react-router";
import { ScopeSelector } from "@/components/ScopeSelector";
import { useAuthorizeViewModel } from "@/viewmodels/useAuthorizeViewModel";

export default function AuthorizePage() {
  const [searchParams] = useSearchParams();
  const txId = searchParams.get("tx");
  const {
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
  } = useAuthorizeViewModel(txId);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    const redirectTo = await approve();
    if (redirectTo) {
      window.location.assign(redirectTo);
    }
  };

  const handleDeny = async () => {
    const redirectTo = await deny();
    if (redirectTo) {
      window.location.assign(redirectTo);
    }
  };

  return (
    <div className="min-h-screen bg-basalt-background px-4 py-10 text-basalt-foreground">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <img src="/logo-80.png" alt="Squirrel" width={36} height={36} />
          <div>
            <h1 className="text-basalt-2xl font-semibold tracking-tight">Squirrel 授权确认</h1>
            <Text className="text-basalt-sm text-basalt-muted-foreground">
              OAuth 2.1 客户端接入与密钥作用域分配
            </Text>
          </div>
        </div>

        <LayerCard padding="lg">
          {loading ? (
            <LayerCard.Loading label="正在加载授权请求..." />
          ) : !tx ? (
            <LayerCard.Empty title="无法完成授权" description={error ?? "授权请求不存在或已过期"} />
          ) : (
            <form onSubmit={handleApprove} className="space-y-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text className="text-basalt-lg font-semibold">{tx.clientName}</Text>
                  <Badge tone="info" variant="soft">
                    {tx.scopes.join(" ") || "secrets:list secrets:read"}
                  </Badge>
                </div>
                <Text className="font-mono text-basalt-sm text-basalt-muted-foreground">
                  Client ID: {tx.clientId}
                </Text>
                <LayerCard.Well className="flex items-center justify-between gap-2 px-3 py-2">
                  <Text className="text-basalt-sm text-basalt-muted-foreground">回调域名</Text>
                  <Text className="font-mono text-basalt-sm font-medium">{tx.redirectHost}</Text>
                </LayerCard.Well>
              </div>

              {tx.redirectIsLoopback && (
                <Banner
                  tone="warning"
                  size="sm"
                  icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.5} />}
                  title="本地回环回调"
                  description="该客户端请求将授权码回调至本机回环端口（localhost / 127.0.0.1），请确认是由你本机 CLI 或 IDE 发起。"
                />
              )}

              {error && <Banner tone="danger" size="sm" title="授权操作失败" description={error} />}

              <div className="space-y-2">
                <Label htmlFor="auth-display-name">为该消费方命名</Label>
                <Input
                  id="auth-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例如：Gemini 个人账号 / Claude Code M4"
                  required
                />
              </div>

              <ScopeSelector
                idPrefix="auth"
                folders={tx.folders}
                secrets={tx.secrets}
                allowAll={allowAll}
                onAllowAllChange={setAllowAll}
                allowedFolderIds={allowedFolderIds}
                onAllowedFolderIdsChange={setAllowedFolderIds}
                allowedSecretIds={allowedSecretIds}
                onAllowedSecretIdsChange={setAllowedSecretIds}
                allowPlaintextRead={allowPlaintextRead}
                onAllowPlaintextReadChange={setAllowPlaintextRead}
              />

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => void handleDeny()}
                >
                  拒绝授权
                </Button>
                <Button type="submit" disabled={submitting}>
                  <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
                  {submitting ? "正在提交..." : "批准授权"}
                </Button>
              </div>
            </form>
          )}
        </LayerCard>
      </div>
    </div>
  );
}
