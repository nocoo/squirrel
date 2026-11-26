(() => {
  let stored = null;
  try {
    stored = localStorage.getItem("theme");
  } catch {
    stored = null;
  }
  const dark =
    stored === "dark" ||
    (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
  document.documentElement.dataset.mode = dark ? "dark" : "light";
})();
