import type { AdminUserInfo } from "@/models/types";

export function getUserDisplay(
  user: Pick<AdminUserInfo, "email" | "name" | "avatar"> | null | undefined,
): {
  name: string;
  email: string;
  initial: string;
  avatar: string | null;
} {
  const cleanEmail = user?.email?.trim() || "";
  const cleanName = user?.name?.trim() || "";
  const cleanAvatar = user?.avatar?.trim() || null;
  const localPart = cleanEmail ? cleanEmail.split("@")[0] || cleanEmail : "";
  const name = cleanName || localPart || "管理员";
  const initial = (cleanName || localPart).slice(0, 1).toUpperCase() || "S";
  return {
    name,
    email: cleanEmail,
    initial,
    avatar: cleanAvatar,
  };
}
