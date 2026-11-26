import {
  Badge,
  Button,
  DescriptionList,
  Field,
  Input,
  LayerCard,
  Skeleton,
  Text,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { LinkButton } from "@nocoo/basalt/components/button";
import { ThemeToggle } from "@nocoo/basalt/components/theme-toggle";
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
    reload,
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
    <div className="flex min-h-screen flex-col bg-basalt-background px-basalt-layout py-basalt-layout-lg text-basalt-foreground">
      <div className="mx-auto flex w-full max-w-2xl justify-end pb-basalt-layout">
        <ThemeToggle
          labels={{
            light: "切换至浅色主题",
            dark: "切换至深色主题",
            system: "跟随系统主题",
          }}
        />
      </div>

      <main className="flex flex-1 items-center justify-center">
        <div className={loading || !tx ? "w-full max-w-md" : "w-full max-w-2xl"}>
          <LayerCard>
            <LayerCard.Header divided>
              <div className="flex items-center gap-basalt-layout-sm">
                <img
                  src="/logo-80.png"
                  alt="Squirrel"
                  width={36}
                  height={36}
                  className="shrink-0 rounded-basalt-md"
                />
                <div className="min-w-0 space-y-basalt-space-xs">
                  <h1 className="font-basalt-display text-basalt-3xl font-semibold leading-basalt-tight text-basalt-foreground">
                    Squirrel 授权确认
                  </h1>
                  <Text className="text-basalt-sm text-basalt-muted-foreground">
                    OAuth 2.1 客户端接入与密钥作用域分配
                  </Text>
                </div>
              </div>
            </LayerCard.Header>

            <LayerCard.Body>
              {loading ? (
                <div
                  role="status"
                  aria-label="正在加载授权请求..."
                  className="space-y-basalt-layout"
                >
                  <Skeleton width="60%" height={20} />
                  <Skeleton variant="block" height={72} />
                  <Skeleton variant="block" height={36} />
                  <div className="flex justify-end gap-basalt-space-lg pt-basalt-space-lg">
                    <Skeleton width={88} height={34} />
                    <Skeleton width={104} height={34} />
                  </div>
                </div>
              ) : !tx ? (
                <LayerCard.Empty
                  icon={
                    <AlertTriangle
                      className="size-basalt-icon-display text-basalt-warning"
                      strokeWidth={1.5}
                    />
                  }
                  title="无法完成授权"
                  description={error ?? "授权请求不存在或已过期"}
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-basalt-space-lg">
                      <LinkButton href="/admin" variant="outline" size="sm">
                        前往管理后台
                      </LinkButton>
                      {txId && (
                        <Button type="button" size="sm" onClick={() => void reload()}>
                          重试
                        </Button>
                      )}
                    </div>
                  }
                />
              ) : (
                <form onSubmit={handleApprove} className="space-y-basalt-layout-lg">
                  <div className="space-y-basalt-layout-sm">
                    <div className="flex flex-wrap items-center justify-between gap-basalt-space-lg">
                      <Text className="text-basalt-lg font-semibold">{tx.clientName}</Text>
                      <Badge tone="info" variant="soft">
                        {tx.scopes.join(" ") || "secrets:list secrets:read"}
                      </Badge>
                    </div>
                    <LayerCard.Well className="p-basalt-card-sm">
                      <DescriptionList columns={2}>
                        <DescriptionList.Item term="Client ID">
                          <span className="font-mono text-basalt-sm">{tx.clientId}</span>
                        </DescriptionList.Item>
                        <DescriptionList.Item term="回调域名">
                          <span className="font-mono text-basalt-sm font-medium">
                            {tx.redirectHost}
                          </span>
                        </DescriptionList.Item>
                        <DescriptionList.Item term="回调地址" className="sm:col-span-2">
                          <span className="break-all font-mono text-basalt-xs text-basalt-muted-foreground">
                            {tx.redirectUri}
                          </span>
                        </DescriptionList.Item>
                      </DescriptionList>
                    </LayerCard.Well>
                  </div>

                  {tx.redirectIsLoopback && (
                    <Banner
                      tone="warning"
                      size="sm"
                      icon={<AlertTriangle className="size-basalt-icon-lg" strokeWidth={1.5} />}
                      title="本地回环回调"
                      description="该客户端请求将授权码回调至本机回环端口（localhost / 127.0.0.1），请确认是由你本机 CLI 或 IDE 发起。"
                    />
                  )}

                  {error && (
                    <Banner tone="danger" size="sm" title="授权操作失败" description={error} />
                  )}

                  <Field label="为该消费方命名" htmlFor="auth-display-name">
                    <Input
                      id="auth-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="例如：Gemini 个人账号 / Claude Code M4"
                      required
                    />
                  </Field>

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

                  <div className="flex items-center justify-end gap-basalt-space-lg pt-basalt-space-lg">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => void handleDeny()}
                    >
                      拒绝授权
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      <ShieldCheck className="size-basalt-icon-lg" strokeWidth={1.5} />
                      {submitting ? "正在提交..." : "批准授权"}
                    </Button>
                  </div>
                </form>
              )}
            </LayerCard.Body>
          </LayerCard>
        </div>
      </main>
    </div>
  );
}
