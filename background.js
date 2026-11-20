// 后台：统计 + 角标
const tabCounts = new Map();

function todayCN() {
  // 用本地日期（sv-SE 格式恰好输出 YYYY-MM-DD）
  return new Date().toLocaleDateString("sv-SE");
}

chrome.runtime.onInstalled.addListener(() => {
  // 首次安装时写入默认关键词
  chrome.storage.sync.get(["keywords"], (d) => {
    if (!d.keywords) {
      chrome.storage.sync.set({
        enabled: true,
        keywords: [
          "GTA", "侠盗猎车", "侠盗飞车", "侠盗猎车手6", "侠盗飞车6",
          "GTA6剧透", "GTA6泄露", "GTA6爆料",
          "R星", "Rockstar", "Grand Theft Auto",
          "崔佛", "老崔", "老麦", "富兰克林", "罪恶都市", "圣安地列斯", "洛圣都",
          "Vice City",
          "露西亚", "杰森", "雷奥尼达", "列奥尼达", "Leonidas", "格尔霍恩港", "盖尔霍恩港", "卡拉加山",
          "Grassrivers", "格拉斯里弗斯",
          "Cal Hampton", "卡尔·汉普顿",
          "Boobie Ike", "布比·艾克",
          "Dre'Quan Priest", "德雷奎恩·普里斯特",
          "Real Dimez",
          "Raul Bautista", "劳尔·包蒂斯塔",
          "Brian Heder", "布莱恩·赫德"
        ],
        customSelectors: [],
        looseMode: false,
        strictMode: false,
        textMode: true,
        conservativeMode: false,
        disabledHosts: [],
        whitelist: []
      });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "block") {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId != null) {
      const n = (tabCounts.get(tabId) || 0) + 1;
      tabCounts.set(tabId, n);
      try {
        chrome.action.setBadgeText({ tabId, text: String(n) });
        chrome.action.setBadgeBackgroundColor({ tabId, color: "#c0392b" });
      } catch (e) { /* 忽略 */ }
    }
    const today = todayCN();
    chrome.storage.local.get(["statsDate", "statsCount"], (d) => {
      const count = d.statsDate === today ? (d.statsCount || 0) + 1 : 1;
      chrome.storage.local.set({ statsDate: today, statsCount: count });
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg && msg.type === "getStats") {
    const today = todayCN();
    chrome.storage.local.get(["statsDate", "statsCount"], (d) => {
      sendResponse({ count: d.statsDate === today ? (d.statsCount || 0) : 0 });
    });
    return true; // 异步响应
  }

  if (msg && msg.type === "resetStats") {
    chrome.storage.local.set({ statsDate: "", statsCount: 0 });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => tabCounts.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    tabCounts.delete(tabId);
    try { chrome.action.setBadgeText({ tabId, text: "" }); } catch (e) { /* 忽略 */ }
  }
});
