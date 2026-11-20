(() => {
  "use strict";

  // ---------- 默认配置 ----------
  const DEFAULT_KEYWORDS = [
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
  ];

  // 针对各站点的内容卡片选择器（尽力覆盖，站点改版可能失效，失效时可用「宽松模式」或自定义选择器兜底）
  const SITE_SELECTORS = [
    { host: "bilibili.com", sels: [
      ".bili-video-card", ".feed-card", ".bili-live-card", "bili-card",
      ".video-card", ".card-video", ".rank-item", ".v-card"
    ]},
    { host: "weibo.com", sels: [".card-wrap[mid]", "div[mid][class*='feed']", ".wbpro-feed-content"] },
    { host: "weibo.cn",  sels: [".card-wrap", ".wb-item"] },
    { host: "zhihu.com", sels: [
      ".TopstoryItem", ".List-item", ".SearchResult-Card", ".Card"
    ]},
    { host: "bing.com", sels: [".b_algo", ".b_ans", ".b_card"] },
    { host: "baidu.com", sels: [
      "#content_left > div", "div.result-op", ".result", ".s-result"
    ]},
    { host: "tieba.baidu.com", sels: [
      // 旧版论坛页 / 帖子页
      ".j_thread_list", ".thread_item", ".l_post", ".threadlist_title",
      // 旧版首页信息流
      ".feed-item", ".feed-item-link",
      // 新版首页（类名未公开，用特征片段广撒网，配合卡片提升逻辑兜底）
      "[class*='feed-item']", "[class*='FeedItem']",
      "[class*='thread-item']", "[class*='threadItem']",
      "[class*='thread_item']", "[class*='index-item']",
      "[class*='post-item']", "[class*='card-item']"
    ]},
    { host: "douyin.com", sels: ["[data-e2e='scroll-list_item']", "li[data-e2e]", "[class*='videoCard']"] },
    { host: "toutiao.com", sels: [".feed-card-article", ".article-card", "[class*='feedItem']"] },
    { host: "douyu.com", sels: [".layout-card-item", ".Card"] },
    { host: "huya.com", sels: [".live-card", "[class*='live-card']"] },
    { host: "xiaohongshu.com", sels: [".note-item", "section[class*='note']", "[class*='note-item']"] },
    { host: "kuaishou.com", sels: [".video-item", "[class*='video-item']"] },
    { host: "nga.cn", sels: [".postbox", "topicrow"] },
    { host: "acfun.cn", sels: [".acb-main-item", "[class*='item-video']"] },
    { host: "iqiyi.com", sels: [".qy-mod-li", "[class*='result_item']"] },
    { host: "youku.com", sels: [".yk-card", "[class*='result-item']"] }
  ];

  // 宽松模式：通用卡片类选择器（全站扫描，误伤风险略高，默认关闭）
  const LOOSE_SELECTORS = [
    "article",
    "[class*='video-card']",
    "[class*='videoCard']",
    "[class*='card-item']",
    "[class*='feed-item']",
    "[class*='feedItem']",
    "[class*='note-item']",
    "[class*='post-item']",
    "[class*='thread-item']",
    "li[class*='item']"
  ];

  // ---------- 状态 ----------
  let cfg = null;
  const blockedEls = new Set();
  let overlayEl = null;
  let overlayDismissed = false;
  let scanTimer = null;
  let sessionPaused = false; // 排障「恢复本页显示」后暂停，直到下次刷新

  // ---------- 工具 ----------
  function getSelectors() {
    const host = location.hostname;
    let sels = [];
    for (const site of SITE_SELECTORS) {
      if (host === site.host || host.endsWith("." + site.host)) {
        sels = sels.concat(site.sels);
      }
    }
    if (cfg.customSelectors && cfg.customSelectors.length) {
      sels = sels.concat(cfg.customSelectors);
    }
    if (cfg.looseMode) sels = sels.concat(LOOSE_SELECTORS);
    return [...new Set(sels.filter(Boolean))];
  }

  function findKeyword(text) {
    const lower = text.toLowerCase();
    for (const kw of cfg.keywords) {
      if (!kw) continue;
      if (lower.includes(kw.toLowerCase())) return kw;
    }
    return null;
  }

  // 防全黑保护：body 直属子元素、占视口比例过大的容器、多子元素列表包裹层，禁止隐藏
  function isStructural(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    if (el.parentElement === document.body) return true;
    if (el.children.length > 15) return true; // 信息流/列表包裹层特征
    try {
      const r = el.getBoundingClientRect();
      // 横向占多数屏宽且超过半屏高的视为骨架（贴吧主信息流约 80% 宽，阈值须放宽到 0.6）
      if (r.width > window.innerWidth * 0.6 && r.height > window.innerHeight * 0.5) return true;
    } catch (e) { /* 忽略 */ }
    return false;
  }

  // 卡片提升：命中的元素太小时，向上找最近的内容卡片容器来隐藏
  // （应对贴吧新版等类名未知的站点改版）
  function promoteCard(el) {
    const text = el.textContent || "";
    if (text.length > 2000) return el; // 本身已是大容器，不提升
    let parent = el.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      if (isStructural(parent)) break; // 遇到页面骨架，停止上溯
      if ((parent.textContent || "").length > 2000) break; // 提升后变成整页容器，放弃
      el = parent;
      parent = parent.parentElement;
    }
    return el;
  }

  function hideEl(el, keyword) {
    el.style.display = "none";
    el.dataset.gtaBlocked = "1";
    el.dataset.gtaBlockedKw = keyword;
    blockedEls.add(el);
    try {
      chrome.runtime.sendMessage({
        type: "block",
        keyword,
        host: location.hostname,
        url: location.href
      });
    } catch (e) { /* 上下文失效时忽略 */ }
  }

  function unhideAll() {
    for (const el of blockedEls) {
      try {
        el.style.display = "";
        delete el.dataset.gtaBlocked;
      } catch (e) { /* 已被移除 */ }
    }
    blockedEls.clear();
    removeOverlay();
  }

  // ---------- 详情页 / 整页拦截（标题或网址命中关键词时遮挡全页） ----------
  function isDetailPage() {
    const url = location.href;
    return /\/(video|question|pin|status)\/|\/p\/\d|bilibili\.com\/\d/.test(url);
  }

  function checkPage() {
    if (!cfg || !cfg.enabled || overlayDismissed || overlayEl) return;

    const title = document.title + " " + (document.querySelector("h1")?.textContent || "");
    let kw = findKeyword(title);
    if (!kw && cfg.strictMode) {
      // 整页拦截模式：网址也参与匹配（如 URL 路径含 gta / grand-theft-auto）
      kw = findKeyword(decodeURIComponent(location.href));
    }
    if (!kw) return;

    // 非严格模式下仅拦截详情页
    if (!cfg.strictMode && !isDetailPage()) return;

    const where = title.includes(kw) ? "页面标题" : "网址";
    overlayEl = document.createElement("div");
    overlayEl.id = "gta-blocker-overlay";
    overlayEl.innerHTML = `
      <div style="background:#1e1e2e;color:#eee;max-width:420px;margin:auto;padding:32px;border-radius:16px;text-align:center;font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif;">
        <div style="font-size:40px;">🚫</div>
        <div style="font-size:18px;font-weight:bold;margin:12px 0 8px;">已屏蔽 GTA 相关内容</div>
        <div style="font-size:13px;opacity:.7;margin-bottom:20px;">${where}命中关键词「${kw}」</div>
        <button id="gta-blocker-pass" style="background:#4a4a5e;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;">仍要查看（本次放行）</button>
      </div>`;
    overlayEl.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;";
    document.documentElement.appendChild(overlayEl);
    overlayEl.querySelector("#gta-blocker-pass").addEventListener("click", () => {
      overlayDismissed = true;
      removeOverlay();
    });
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  // ---------- 纯文本模式：不依赖任何站点结构，直接扫描可见文字 ----------
  const TEXT_SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TEMPLATE"]);

  // 从文字节点向上找「内容卡片」：取最大且文字量 < cap 字符、非页面骨架的祖先元素
  // 保守模式（cap=300）下只隐藏最小的文字块，不影响信息流加载
  function promoteTextCard(el, cap) {
    cap = cap || 1500;
    let best = el;
    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (isStructural(cur)) break;           // 防全黑：不隐藏页面骨架
      if ((cur.textContent || "").length > cap) break;
      best = cur;
      cur = cur.parentElement;
    }
    return best;
  }

  function textScan() {
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || TEXT_SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const kw = findKeyword(node.nodeValue);
          return kw ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );
    const hitNodes = [];
    while (walker.nextNode()) hitNodes.push(walker.currentNode);
    for (const node of hitNodes) {
      const el = node.parentElement;
      if (!el || !el.isConnected) continue;
      if (blockedEls.has(el) || el.closest("[data-gta-blocked]")) continue;
      const target = promoteTextCard(el, cfg.conservativeMode ? 300 : 1500);
      // 保护功能性组件：包含输入框的容器（搜索框、评论框等）永不隐藏
      if (target.querySelector("input, textarea")) continue;
      if (!isStructural(target)) hideEl(target, findKeyword(node.nodeValue));
    }
  }

  // ---------- 主动搜索的精细豁免 ----------
  // 策略：搜索结果条目照常拦截；只有「整页遮挡」和「输入联想」两个层面放行，
  // 避免整页变白或搜索框消失；搜索框本身由「含输入框的容器永不隐藏」硬保护。
  function isSelfSearch() {
    try {
      const params = new URLSearchParams(location.search);
      const keys = ["q", "wd", "word", "kw", "query", "text", "search"];
      for (const k of keys) {
        const v = params.get(k);
        if (v && findKeyword(v)) return true;
      }
    } catch (e) { /* 忽略 */ }
    return false;
  }

  let lastTypingAt = 0;
  document.addEventListener("input", () => { lastTypingAt = Date.now(); }, true);
  document.addEventListener("keydown", () => { lastTypingAt = Date.now(); }, true);

  // 仅在真正敲键盘后的短时间内暂停，防止输入联想下拉被清空
  function isTypingKeyword() {
    if (Date.now() - lastTypingAt > 1500) return false;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) {
      const v = (a.value || a.textContent || "").trim();
      if (v && findKeyword(v)) return true;
    }
    return false;
  }

  // ---------- 扫描 ----------
  function scan() {
    if (!cfg || !cfg.enabled || sessionPaused) return;
    if ((cfg.disabledHosts || []).includes(location.hostname)) return;
    if (isTypingKeyword()) return;
    // 整页遮挡在主动搜索页跳过（搜索框/页面框架不能没），结果条目照常拦截
    if (!isSelfSearch()) checkPage();

    // 保守模式：跳过一切选择器/容器隐藏，只用纯文本模式隐藏最小文字块
    if (cfg.conservativeMode) {
      if (cfg.textMode) textScan();
      return;
    }
    const sels = getSelectors();
    for (const sel of sels) {
      let els;
      try { els = document.querySelectorAll(sel); } catch (e) { continue; }
      for (const el of els) {
        if (blockedEls.has(el) || !el.isConnected) continue;
        if (el.closest("[data-gta-blocked]")) continue;
        // 避免误伤整个页面容器
        const text = el.textContent || "";
        if (text.length > 10000) continue;
        const kw = findKeyword(text);
        if (kw) {
          const target = promoteCard(el);
          // 保护功能性组件：包含输入框的容器永不隐藏
          if (!isStructural(target) && !target.querySelector("input, textarea")) hideEl(target, kw);
        }
      }
    }
    if (cfg.textMode) textScan();
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 300);
  }

  // ---------- 元素拾取模式（点击页面元素直接生成屏蔽规则） ----------
  let picking = false;
  let hoverBox = null;
  let pickBanner = null;

  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^\w-]/g, "\\$&");
  }

  function buildSelector(el) {
    // 1. 唯一 id 最稳
    if (el.id && document.querySelectorAll("#" + cssEscape(el.id)).length === 1) {
      return "#" + cssEscape(el.id);
    }
    // 2. 自下而上找「有 class 且全页匹配数少」的祖先，抗列表重排
    for (let cur = el; cur && cur !== document.body; cur = cur.parentElement) {
      if (cur.id && document.querySelectorAll("#" + cssEscape(cur.id)).length === 1) {
        return "#" + cssEscape(cur.id);
      }
      if (cur.classList.length) {
        const sel = cur.tagName.toLowerCase() + "." + [...cur.classList].map(cssEscape).join(".");
        let n = 0;
        try { n = document.querySelectorAll(sel).length; } catch (e) { n = 0; }
        if (n > 0 && n <= 3) return sel;
      }
    }
    // 3. 结构化路径兜底
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body) {
      let part = cur.tagName.toLowerCase();
      if (cur.parentElement) {
        const same = [...cur.parentElement.children].filter(c => c.tagName === cur.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return "body > " + parts.join(" > ");
  }

  function stopPicker(applied) {
    picking = false;
    document.removeEventListener("mousemove", onPickMove, true);
    document.removeEventListener("click", onPickClick, true);
    document.removeEventListener("contextmenu", onPickCancel, true);
    document.removeEventListener("keydown", onPickKey, true);
    if (hoverBox) { hoverBox.remove(); hoverBox = null; }
    if (pickBanner) { pickBanner.remove(); pickBanner = null; }
    if (applied) scan();
  }

  function pickUI(el) {
    if (el && (el.closest("#gta-blocker-picker-banner") || el.closest("#gta-blocker-overlay"))) return true;
    return false;
  }

  function onPickMove(e) {
    if (pickUI(e.target)) return;
    if (!hoverBox) {
      hoverBox = document.createElement("div");
      hoverBox.id = "gta-blocker-picker-hover";
      hoverBox.style.cssText =
        "position:fixed;pointer-events:none;z-index:2147483646;" +
        "outline:2px solid #e74c3c;outline-offset:-2px;background:rgba(231,76,46,.15);";
      document.documentElement.appendChild(hoverBox);
    }
    const r = e.target.getBoundingClientRect();
    hoverBox.style.left = r.left + "px";
    hoverBox.style.top = r.top + "px";
    hoverBox.style.width = r.width + "px";
    hoverBox.style.height = r.height + "px";
    hoverBox.style.display = "block";
  }

  function onPickClick(e) {
    if (pickUI(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const target = promoteCard(e.target);
    const sel = buildSelector(target);
    chrome.storage.sync.get({ customSelectors: [] }, (d) => {
      const list = d.customSelectors.includes(sel) ? d.customSelectors : [...d.customSelectors, sel];
      chrome.storage.sync.set({ customSelectors: list }, () => {
        showPickBanner("✅ 已添加屏蔽规则：" + sel);
        setTimeout(() => stopPicker(true), 1200);
      });
    });
  }

  function onPickCancel(e) {
    if (pickUI(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    stopPicker(false);
  }

  function onPickKey(e) {
    if (e.key === "Escape") stopPicker(false);
  }

  function showPickBanner(text) {
    if (pickBanner) pickBanner.remove();
    pickBanner = document.createElement("div");
    pickBanner.id = "gta-blocker-picker-banner";
    pickBanner.textContent = text;
    pickBanner.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "background:#1e1e2e;color:#eee;padding:10px 20px;border-radius:10px;font-size:13px;" +
      "font-family:system-ui,'Microsoft YaHei',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:80vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    document.documentElement.appendChild(pickBanner);
  }

  function startPicker() {
    if (picking) return;
    picking = true;
    showPickBanner("🎯 点击要屏蔽的元素｜右键或 Esc 取消");
    document.addEventListener("mousemove", onPickMove, true);
    document.addEventListener("click", onPickClick, true);
    document.addEventListener("contextmenu", onPickCancel, true);
    document.addEventListener("keydown", onPickKey, true);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "startPicker") {
      startPicker();
      sendResponse({ ok: true });
    } else if (msg && msg.type === "unhidePage") {
      sessionPaused = true;
      unhideAll();
      sendResponse({ ok: true });
    } else if (msg && msg.type === "resumePage") {
      sessionPaused = false;
      sendResponse({ ok: true });
    } else if (msg && msg.type === "getBlockedInfo") {
      const items = [];
      document.querySelectorAll("[data-gta-blocked]").forEach((el) => {
        const r = el.getBoundingClientRect();
        items.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 60),
          kw: el.dataset.gtaBlockedKw || "?",
          size: `${Math.round(r.width)}x${Math.round(r.height)}`,
          text: (el.textContent || "").trim().slice(0, 40)
        });
      });
      sendResponse({ items, host: location.hostname });
    }
    return false;
  });

  // ---------- 初始化 ----------
  function init() {
    chrome.storage.sync.get(
      { enabled: true, keywords: DEFAULT_KEYWORDS, customSelectors: [], looseMode: false, strictMode: false, textMode: true, conservativeMode: false, disabledHosts: [] },
      (data) => {
        cfg = data;
        scan();
        setTimeout(scan, 1200);
        setTimeout(scan, 3000);

        const observer = new MutationObserver(() => {
          if (cfg && cfg.enabled) scheduleScan();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // 配置变更实时生效
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== "sync") return;
          chrome.storage.sync.get(
            { enabled: true, keywords: DEFAULT_KEYWORDS, customSelectors: [], looseMode: false },
            (data) => {
              cfg = data;
              if (!cfg.enabled) unhideAll();
              else scan();
            }
          );
        });
      }
    );
  }

  init();
})();
