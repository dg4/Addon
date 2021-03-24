var Premium = new function() {
    var ajaxUrl = "https://ikorektor.pl/ajax/prem";
    
    this.checkCode = function(premCode) {
        if (premCode) {
            if (premCode.match(/^[A-Z0-9]{8}$/i)) {
                ajaxCheckCode(premCode);
                return true;
            } else {
                showErr({error: "INVALID"});
            }
        } else {
            $("prem").style.display = "none";
        }
        
        save(null);
        return false;
    };
    
    this.restoreOption = function(prem) {
        if (typeof prem !== "object") {
            prem = JSON.parse(prem);
        }
        
        var pcEl = $("premcode");
        var dateNow = new Date();
        var dateExp = new Date(prem.dateExpire);
        
        if (prem.dateExpire && dateNow.getTime() > dateExp.getTime()) {
            save(null);
            showErr({error: "EXPIRED", dateExpire: prem.dateExpire});
        } else {
            pcEl.classList.add("valid");
            showInfo(prem);
        }
        
        pcEl.value = prem.code;
        pcEl.setAttribute("data-premcode", prem.code);
    };
    
    var ajaxCheckCode = function(premCode) {
        var fd = new FormData();
        fd.append("premcode", premCode);
        
        fetch(ajaxUrl, {
            method: "POST",
            body: fd
        }).then(resp => {
            if (resp.ok) return resp.json();
            throw Error(resp.statusText);
        }).then(resp => {
            resp.prem.code = premCode.toUpperCase();
            
            if (resp.prem.hasOwnProperty("error")) {
                showErr(resp.prem);
                save(null);
            } else {
                showInfo(resp.prem);
                save(resp.prem);
            }
        }).catch(err => {
            console.log(err);
            showErr({});
        });
    };
    
    var showInfo = function(prem) {
        $("prem-name").textContent = prem.name;
        $("prem-activity").textContent = prem.daysUsage ? `wykorzystano ${prem.daysUsage}/${prem.daysActive} dni` : "ważny do " + dateFormat(prem.dateExpire.replace("+", " "));
        $("prem").style.display = "table-row";
        $("prem-inf").style.display = "block";
        $("prem-err").style.display = "none";
        
        let el = $("premcode-chck");
        el.classList.add("premcode-rmv");
        el.classList.remove("premcode-none");
        el.title = "Usuń kod";
    };
    
    var showErr = function(prem) {
        const el = $("prem-err");
        let txt = "";
            
        switch (prem.error) {
            case "INVALID":
                txt = "Podano nieprawidłowy kod aktywacyjny iKorektorPro.";
                break;
            case "EXPIRED":
                txt = `Podany kod aktywacyjny iKorektorPro stracił ważność dnia ${dateFormat(prem.dateExpire)}.`;
                break;
            default:
                txt = "Nie udało się sprawdzić kodu iKorektorPro.";
        }

        $("prem").style.display = "table-row";
        $("prem-inf").style.display = "none";

        el.textContent = txt;
        el.style.display = "block";
        
        fadeIn(el);
    };
    
    var save = function(premInfo) {
        chrome.storage.sync.set({prem: premInfo}, () => sendOptChangedMsg());
        
        let pcEl = $("premcode");
        let premChckEl = $("premcode-chck");
        
        pcEl.classList.toggle("valid", premInfo);
        premChckEl.classList.toggle("premcode-rmv", premInfo);
        premChckEl.title = premInfo ? "Usuń kod" : "Dodaj kod";
    };
};