const toggle = document.getElementById("toggle");
const badge = document.getElementById("badge");
const countEl = document.getElementById("count");

document.getElementById("ver").textContent =
  "v" + chrome.runtime.getManifest().version + "｜若行为不符预期，请到扩展页点「重新加载」";

function render(enabled) {
  toggle.checked = enabled;
  badge.textContent = enabled ? "运行中" : "已停用";
  badge.className = "status " + (enabled ? "on" : "off");
}

chrome.storage.sync.get({ enabled: true }, (d) => render(d.enabled));

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
  render(toggle.checked);
});

chrome.runtime.sendMessage({ type: "getStats" }, (res) => {
  if (res) countEl.textContent = res.count;
});

document.getElementById("debug").addEventListener("click", async (e) => {
  e.preventDefault();
  const list = document.getElementById("debugList");
  list.innerHTML = "<div>读取中…</div>";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) { list.innerHTML = "<div>无法读取当前标签页</div>"; return; }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "getBlockedInfo" });
    if (!res || !res.items.length) {
      list.innerHTML = "<div>本页当前没有被隐藏的元素（如果页面仍有异常，可能是网站自身加载问题）</div>";
    } else {
      list.innerHTML = res.items.slice(0, 12).map(it =>
        `<div><b>[${it.kw}]</b> &lt;${it.tag}&gt; ${it.cls ? "." + it.cls : ""}<br>${it.text || "(无文字)"}</div>`
      ).join("") + (res.items.length > 12 ? `<div>… 共 ${res.items.length} 个</div>` : "");
    }
  } catch (err) {
    list.innerHTML = "<div>无法连接页面脚本，请刷新页面后重试</div>";
  }
});

document.getElementById("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById("pick").addEventListener("click", async (e) => {
  e.preventDefault();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "startPicker" });
    } catch (err) {
      alert("无法在此页面启动选取模式：请先刷新页面再试");
    }
  }
  window.close();
});

document.getElementById("restore").addEventListener("click", async (e) => {
  e.preventDefault();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    try { await chrome.tabs.sendMessage(tab.id, { type: "unhidePage" }); } catch (err) {}
  }
  window.close();
});

document.getElementById("toggleSite").addEventListener("click", async (e) => {
  e.preventDefault();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null || !tab.url) return;
  let host;
  try { host = new URL(tab.url).hostname; } catch (err) { return; }

  const d = await chrome.storage.sync.get({ disabledHosts: [] });
  const list = d.disabledHosts;
  const disabled = list.includes(host);
  if (disabled) {
    // 恢复该网站
    chrome.storage.sync.set({ disabledHosts: list.filter(h => h !== host) });
    try { await chrome.tabs.sendMessage(tab.id, { type: "resumePage" }); } catch (err) {}
    alert("已恢复在 " + host + " 的屏蔽，刷新页面生效");
  } else {
    // 停用该网站并立即还原页面
    chrome.storage.sync.set({ disabledHosts: [...list, host] });
    try { await chrome.tabs.sendMessage(tab.id, { type: "unhidePage" }); } catch (err) {}
    alert("已在 " + host + " 停用屏蔽，页面已还原");
  }
  window.close();
});
