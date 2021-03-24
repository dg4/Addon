var confDefault = {
    prem: null,
    btn: {
        type: "small", 
        location: "bottom", 
        color: "#009933",
        showOnInputs: true
    },
    corr: {
        parags: 0, 
        profanity: 0, 
        gateway: true
    },
    draggable: false,
    replaceTxtarea: false,
    replaceContent: false
};

function restore() {
    chrome.storage.sync.get(confDefault, sett => {
        if (sett.prem) Premium.restoreOption(sett.prem);
        $("btn-type-" + sett.btn.type).checked = true;
        $("btn-location-" + sett.btn.location).checked = true;
        $("btn-color").value = sett.btn.color;
        $("btn-inputs").checked = sett.btn.showOnInputs;
        $("corr-parags").value = sett.corr.parags;
        $("corr-profanity").value = sett.corr.profanity;
        $("corr-gateway").checked = sett.corr.gateway;
        $("draggable").checked = sett.draggable;
        $("replace-txtarea").checked = sett.replaceTxtarea;
        $("replace-content").checked = sett.replaceContent;
    });
}

function save() {
    chrome.storage.sync.set({
        btn: {
            type: document.querySelector("input[name=btn-type]:checked").value, 
            location: document.querySelector("input[name=btn-location]:checked").value, 
            color: $("btn-color").value,
            showOnInputs: $("btn-inputs").checked
        },
        corr: {
            parags: $("corr-parags").value,
            profanity: $("corr-profanity").value,
            gateway: $("corr-gateway").checked
        },
        draggable: $("draggable").checked,
        replaceTxtarea: $("replace-txtarea").checked,
        replaceContent: $("replace-content").checked
    }, function() {
        let el = $("save-info");
        if (isTab)
            el.querySelector("span").style.display = "block";
        fadeIn(el);
        sendOptChangedMsg();
    });
}

function sendOptChangedMsg() {
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
        chrome.tabs.sendMessage(tabs[0].id, {message: "OPT_CHANGED"});  
    });
}

function checkPremCode(pcEl) {
    if (pcEl.value !== pcEl.getAttribute("data-premcode")) {
        Premium.checkCode(pcEl.value);
        pcEl.setAttribute("data-premcode", pcEl.value);
    } else {
        fadeIn($("prem"));
    }
}

var isTab = document.location.href.indexOf("tab=true") > -1;
if (isTab) document.body.style.width = "590px";

$("ver").textContent = chrome.runtime.getManifest().version;
$("premcode").addEventListener("keyup", e => {
    e.keyCode === 13 && checkPremCode(e.target);
    $("premcode-chck").classList.toggle("premcode-none", !e.target.value);
});
$("premcode-chck").addEventListener("click", e => {
    let el = e.target;
    let pcEl = $("premcode");
    pcEl.focus();
    
    if (el.classList.contains("premcode-rmv")) {
        Premium.checkCode(null);
        pcEl.value = "";
        pcEl.setAttribute("data-premcode", "");
        el.classList.add("premcode-none");
    } else {
        checkPremCode(pcEl);
    }
});

document.addEventListener("DOMContentLoaded", restore);
document.addEventListener("change", save);