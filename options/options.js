const apiBaseInput = document.getElementById("apiBase");
const saveBtn = document.getElementById("saveBtn");
const savedMsg = document.getElementById("savedMsg");

(async () => {
  apiBaseInput.value = await ptApiBase();
})();

saveBtn.addEventListener("click", async () => {
  const value = apiBaseInput.value.trim() || PT_DEFAULT_API_BASE;
  await chrome.storage.local.set({ pt_api_base: value });
  savedMsg.hidden = false;
  setTimeout(() => { savedMsg.hidden = true; }, 1500);
});
