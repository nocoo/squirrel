import { Banner } from "@nocoo/basalt/components/banner";
import { AlertTriangle } from "@nocoo/basalt/icons";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  title?: string;
}

export function ErrorBanner({ message, onRetry, title = "加载失败" }: ErrorBannerProps) {
  return (
    <Banner
      tone="danger"
      size="sm"
      icon={<AlertTriangle className="size-basalt-icon-lg" strokeWidth={1.5} />}
      title={title}
      description={message}
      action={onRetry ? <Banner.Action onClick={onRetry}>重试</Banner.Action> : undefined}
    />
  );
}
