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

const kwEl = document.getElementById("keywords");
const selEl = document.getElementById("customSelectors");
const looseEl = document.getElementById("looseMode");
const savedEl = document.getElementById("saved");

function load() {
  chrome.storage.sync.get(
    { keywords: DEFAULT_KEYWORDS, customSelectors: [], looseMode: false, strictMode: false, textMode: true, conservativeMode: false },
    (d) => {
      kwEl.value = d.keywords.join("\n");
      selEl.value = d.customSelectors.join("\n");
      looseEl.checked = d.looseMode;
      document.getElementById("strictMode").checked = d.strictMode;
      document.getElementById("textMode").checked = d.textMode;
      document.getElementById("conservativeMode").checked = d.conservativeMode;
    }
  );
}

function save() {
  const keywords = kwEl.value.split("\n").map(s => s.trim()).filter(Boolean);
  const customSelectors = selEl.value.split("\n").map(s => s.trim()).filter(Boolean);
  chrome.storage.sync.set({
    keywords,
    customSelectors,
    looseMode: looseEl.checked,
    strictMode: document.getElementById("strictMode").checked,
    textMode: document.getElementById("textMode").checked,
    conservativeMode: document.getElementById("conservativeMode").checked
  }, () => {
    savedEl.style.opacity = 1;
    setTimeout(() => (savedEl.style.opacity = 0), 1500);
  });
}

document.getElementById("save").addEventListener("click", save);

document.getElementById("reset").addEventListener("click", () => {
  kwEl.value = DEFAULT_KEYWORDS.join("\n");
  save();
});

document.getElementById("clearStats").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "resetStats" });
  savedEl.textContent = "✔ 已清空统计";
  savedEl.style.opacity = 1;
  setTimeout(() => {
    savedEl.style.opacity = 0;
    savedEl.textContent = "✔ 已保存";
  }, 1500);
});

load();
