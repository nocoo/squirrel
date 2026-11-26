export function getUserDisplay(email: string | undefined): {
  name: string;
  email: string;
  initial: string;
} {
  const cleanEmail = email?.trim() || "";
  if (!cleanEmail) {
    return { name: "管理员", email: "", initial: "S" };
  }
  const localPart = cleanEmail.split("@")[0] || cleanEmail;
  const initial = localPart.slice(0, 1).toUpperCase() || "S";
  return {
    name: localPart,
    email: cleanEmail,
    initial,
  };
}
