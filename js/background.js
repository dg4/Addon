function iKorektorToggle(tabId) {
    chrome.tabs.sendMessage(tabId, {message: "TOGGLE"}, resp => {
        if (typeof resp === "undefined") {
            chrome.tabs.executeScript(tabId, {file: "/js/func.js"} , () => {
                chrome.tabs.executeScript(tabId, {file: "/js/ikorektor.js"});
                chrome.tabs.insertCSS(tabId, {file: "/css/ikorektor.css"});
            });
        }
    });
}

chrome.contextMenus.create({
    id: "ikorektor",
    title: "Aktywuj przycisk iKorektora",
    contexts: ["all"]
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "ikorektor") {
        iKorektorToggle(tab.id);
    }
});

chrome.commands.onCommand.addListener(command => {
    if (command === "ikorektor") {
        chrome.tabs.query({active: true, currentWindow: true}, tabs => {
            iKorektorToggle(tabs[0].id);
        });
    }
});

chrome.runtime.setUninstallURL("https://ikorektor.pl/kontakt?addon-uninstall=true");