class CorrectionButton {
    constructor() {
        this.el = null;
        this.settings = {
            type: "small",
            color: "#093",
            location: "bottom", // location within textarea
            showOnInputs: true
        };
        this.settings = Object.assign(this.settings, panel.conf.btn);
    }
    
    show(top, right) {
        if (!this.el) {
            this.set();
            return this.show(top, right);
        }
        
        this.el.style.display = "block";
        
        if (!top) {
            let txtElOffs = getOffset(panel.txtEl);
            top = this.settings.location === "top" ? txtElOffs.top + 5 : txtElOffs.top + panel.txtEl.offsetHeight - 35; // stiff btn height due to CSS load delay on 1st show
            right = window.innerWidth - (txtElOffs.left + panel.txtEl.offsetWidth);
        }
        
        this.el.style.top = top.toFixed(2) + "px";
        this.el.style.right = right.toFixed(2) + "px";
        this.el.disabled = false;

        if (panel.infEl)
            panel.infEl.style.display = "none";
    }
    
    showOnContent() {
        panel.txtEl = null; // ensure there is no active text area (could be active right before selection and doing problems)

        let rect = panel.selection.getRangeAt(0).getBoundingClientRect();
        let relative = document.body.parentNode.getBoundingClientRect();
        let top = rect.bottom - relative.top;// - (rect.bottom - rect.top);
        let left = (rect.left + relative.left) + (rect.right - rect.left);

        this.show(top, window.innerWidth - left - 35);
    }
    
    set() {
        document.body.insertAdjacentHTML("beforeend", '<button type="button" id="iko-do">Autokorekta</button>');
        this.el = $("iko-do");
        this.el.style.setProperty("--bgimage", `url(${chrome.runtime.getURL("img/gear.png")})`); // cross browser background image solution, also for :after pseudoelement
        this.el.style.setProperty("--bgcolor", this.settings.color);
        this.el.classList.toggle("iko-do-big", this.settings.type === "big");
    }
    
    hide() {
        if (this.el && !this.el.disabled && isVisible(this.el) && !panel.selection) {
            if (!panel.infEl || !isVisible(panel.infEl)) {
                this.el.style.display = "none";
            }
        }
    }
    
    update() {
        let location = this.settings.location;
        this.settings = Object.assign(this.settings, panel.conf.btn);
        this.el.classList.toggle("iko-do-big", this.settings.type === "big");
        this.el.style.setProperty("--bgcolor", this.settings.color);

        if (location !== this.settings.location && isVisible(this.el) && panel.txtEl) {
            this.show(); // for location change
        }

        if (this.settings.showOnInputs === false && isVisible(this.el) && panel.isTxtInput(panel.txtEl)) {
            this.el.style.display = "none";
        }
    }
}

class Correction {
    constructor() {
        this.txtOrigin = "";
        this.txtOriginAll = ""; // for proper restore by Ctrl+Z if txtOrigin is from selected text (which a part of whole text)
        this.txtCorrected = null;
        this.settings = { // defaults only; real settings are taken from storage on defaults basis
            parags: 0,
            profanity: 0, 
            gateway: true
        };
    }
    
    static init() {
        panel.corrBtn.el.disabled = true;
        panel.selection = window.getSelection(); // necessary for getAreaTxt() too - it can be contentEditable element with normal content selection
        let txt;
       
        if (panel.txtEl) {
            txt = panel.getAreaTxt();
        } else {
            if (panel.selection.rangeCount > 1) {
                return panel.show("Dodatek nie obsługuje zaznaczeń wielokrotnych.", true);
            }
            
            if (panel.selection.isCollapsed) {
                return panel.show("Brak zaznaczonego tekstu.", true);
            }
            
            panel.selRange = panel.selection.getRangeAt(0); // save selection's range, it prevents selection lose before correction end or text accept/replacement
            txt = panel.selection.toString();
        }
        
        if (panel.correction && panel.correction.txtOrigin === txt) { // nothing has changed
            return panel.show(); // show inf element with last information / text
        }
        
        const corr = new Correction();
        corr.txtOrigin = txt;
        corr.settings = Object.assign(corr.settings, panel.conf.corr);
        panel.correction = corr;

        if (txt.trim().length < 3) {
            return panel.show("Tekst jest zbyt krótki.", true);
        }

        if (txt.length > panel.getTxtLimit()) {
            return corr.onError({error: "TXT_LEN"}, txt.length);
        }
       
        corr.callApi(txt);
    }

    callApi(txt) {
        fetch(panel.apiUrl, {
            method: "POST",
            body: this.getFetchFormData(txt)
        }).then(resp => {
            if (resp.ok) return resp.json();
            throw Error(resp.statusText);
        }).then(data => {
            panel.premCheck(data);
            data.hasOwnProperty("error") ? this.onError(data, txt.length) : this.onSuccess(data);
            
            if (data.hasOwnProperty("today_chars_used")) {
                $("iko-today-chars-used").textContent = num(data.today_chars_used);
            }
            
            if (data.hasOwnProperty("session")) {
                panel.conf.session = data.session;
                chrome.storage.sync.set({session: data.session});
            }
        }).catch(err => {
            console.log(err);
            this.onError({}, null);
        });
    }
    
    getFetchFormData(txt) {
        const fd = new FormData();
        
        fd.append("key", "addon-" + (panel.txtEl ? "txtarea" : "content"));
        fd.append("text", txt);
        fd.append("info", 1);
        
        panel.conf.session ? fd.append("session", panel.conf.session) : fd.append("ext", panel.getExtensionUrl());
        
        if (panel.conf.prem)
            fd.append("premcode", panel.conf.prem.code);
        if (this.settings.parags) 
            fd.append("parags", this.settings.parags);
        if (this.settings.profanity) 
            fd.append("profanity", this.settings.profanity);
        if (!this.settings.gateway) 
            fd.append("gateway", 0);

        return fd;
    }
    
    onSuccess(data) {
        this.txtCorrected = new TextCorrected(data);
        this.txtCorrected.addMarks();
        
        panel.conf.txtLmt = data.txt_lmt;
        panel.conf.charsLmt = data.chars_lmt;
        panel.show(this.txtCorrected.txt, false);
        panel.setReportTxt();
        
        if (panel.txtEl) {
            this.txtOriginAll = panel.txtEl.contentEditable === "true" ? panel.txtEl.innerHTML : panel.txtEl.value; // whole area text (useful for proper correction revert by Ctrl+Z)
            panel.conf.replaceTxtarea && panel.replaceTxtarea(data.text);
        } else {
            panel.conf.replaceContent && panel.replaceContent(data.text);
        }
    }
    
    onError(data, txtLen) {
        let txt = "";
        
        switch (data.error) {
            case "TXT_LEN":
                txt = `Tekst jest zbyt długi (${num(txtLen)} na ${num(panel.getTxtLimit())} dozwolonych znaków w jednej korekcie).` + panel.premAdv();
                break;
            case "CHARS_LMT":
                let cnt = data.chars_left;
                txt = getWordForm(cnt, "Pozostał", "Pozostały", "Pozostało") + ` Ci ${data.chars_left} ${getWordForm(cnt, "znak", "znaki", "znaków")} z dobowego limitu, tekst ma ${num(txtLen)} ${getWordForm(txtLen, "znak", "znaki", "znaków")}.` + panel.premAdv();
                break;
            case "CALLS_LMT":
                txt = "Osiągnięto limit korekt na minutę, spróbuj ponownie za chwilę." + panel.premAdv();
                break;
            default:
                txt = "Coś poszło nie tak. Spróbuj ponownie za chwilę lub " + panel.lnk("info#errors", "dowiedz się więcej");
        }
        
        panel.show(txt, true);
        this.txtOrigin = ""; // do not block correction attempts on error, the condition may change (e.g. server problems)
    }
    
    restoreWhiteSpaces(txtCorr) {
        return panel.correction.txtOrigin.match(/^\s*/) + txtCorr + panel.correction.txtOrigin.match(/\s*$/); // restore white characters from the beginning and end of the original selected text (correction has removed them)
    }
    
    static encodeTags(txt) {
        const p = document.createElement("p");
        p.textContent = txt;
        return p.innerHTML; // a trick to encode user's HTML tags
    }
    
    static decodeTags(str) {
        const map = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'"};
        return str.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, m => map[m]);
    }
}

class TextCorrected {    
    constructor(data) {
        this.txt = data.text;
        this.wordMarks = [];
        this.succs = data.hasOwnProperty("succs") ? data.succs : [];
        this.suggs = data.hasOwnProperty("suggs") ? data.suggs : [];
        this.fails = data.hasOwnProperty("fails") ? data.fails : [];
    }
    
    addMarks() {
        this.tokenizeSuccs(); // must be 1st - we don't want to lose correction positions from API (!)
        this.tokenizeSuggs();
        this.tokenizeFails();
        this.markTokensWithHTML();
    }
    
    tokenizeSuccs() {
        let posAdd = 0; 
        
        for (let i = 0; i < this.succs.length; i++) {
            let succ = this.succs[i];
            let token = "_" + this.wordMarks.length + "##";
            let suggs = this.findSuggs(this.suggs, succ.correction);
            let comments = succ.hasOwnProperty("comments") ? succ.comments : null;
            let wordMark = new WordMarkSucc(succ.error, comments, token, succ.correction, suggs);

            if (suggs) {
                wordMark.type += "-sugg";
            } else {
                suggs = this.findSuggs(this.fails, succ.correction);

                if (suggs) {
                    wordMark.suggs = suggs;
                    wordMark.type += "-fail";
                }
            }

            this.txt = this.txt.substr(0, succ.position + posAdd) + token + this.txt.substr(succ.position + posAdd + succ.correction.length);
            this.wordMarks.push(wordMark);
            
            posAdd += (token.length - succ.correction.length); // token affected text length; include the difference to the words position in the next loops
        }
    }
    
    tokenizeSuggs() {
        const txtCorr = this;
        
        for (let i = 0; i < this.suggs.length; i++) {
            let sugg = this.suggs[i];
            
            this.txt = this.txt.replace(this.wordReg(sugg.word, "i"), function(match) {
                let charOnLeft = match[0].toLowerCase() === sugg.word[0].toLowerCase() ? "" : match[0]; // if matched word is at the beginning of the string, there's no matched char to the left side of the word; otherwise there's always a char which we must to restore
                let wordMatch = charOnLeft === "" ? match : match.substr(1);
                let token = "_" + txtCorr.wordMarks.length + "##";
                let suggs = sugg.suggs.map(s => WordMark.markCharsDiff(sugg.word, s));
                let wordMark = new WordMark(token, wordMatch, suggs, "sugg");
                
                txtCorr.wordMarks.push(wordMark);
                
                return charOnLeft + token;
            });
        }
    }
    
    tokenizeFails() {
        const txtCorr = this;
        
        for (let i = 0; i < this.fails.length; i++) {
            let fail = this.fails[i];
            
            this.txt = this.txt.replace(this.wordReg(fail.error, "i"), function(match) {
                let charOnLeft = match[0].toLowerCase() === fail.error[0].toLowerCase() ? "" : match[0];
                let wordMatch = charOnLeft === "" ? match : match.substr(1);
                let token = "_" + txtCorr.wordMarks.length + "##";
                let suggs = fail.hasOwnProperty("suggs") ? fail.suggs.map(s => WordMark.markCharsDiff(fail.error, s)) : null;
                let wordMark = new WordMark(token, wordMatch, suggs, "fail");
                
                if (suggs) {
                    wordMark.type += "-sugg";
                }
                
                txtCorr.wordMarks.push(wordMark);
                
                return charOnLeft + token;
            });
        }
    }
    
    markTokensWithHTML() {
        this.txt = Correction.encodeTags(this.txt);

        for (let i = 0; i < this.wordMarks.length; i++) {
            let wordMark = this.wordMarks[i];
            let revBtnHTML = "", commHTML = "";
            let suggsHTML = wordMark.suggs ? `<button class="iko-mark-btn iko-sugg">${wordMark.suggs.join('</button><button class="iko-mark-btn iko-sugg">')}</button>` : "";
            
            if (wordMark instanceof WordMarkSucc) {
                if (wordMark.wordError !== null) {
                    revBtnHTML = `<button class="iko-mark-btn iko-mark-btn-rev">[cofnij korektę]</button>`;
                }
                
                commHTML = wordMark.getCommentsHTML();
            }

            this.txt = this.txt.replace(wordMark.id, `<span class="iko-mark"><span id="${wordMark.id}" class="iko-corr iko-corr-${wordMark.type}">${wordMark.wordShow}</span><span class="iko-mark-menu">${commHTML + suggsHTML + revBtnHTML + WordMark.actionBtnsHTML()}</span></span>`);
        }
    }
    
    stripMarksHTML(txt) {
        return txt.replace(/<\/?(?:span|mark).*?>|<ul>.+?<\/ul>|<button.+?<\/button>/g, ""); // not this.txt, because user can make his own changes, e.g. replace with suggestion
    }
    
    findSuggs(arrSearch, word) {
        if (arrSearch) { // simple suggs or fails with suggs
            let index = arrSearch.findIndex(el => {
                return (el.hasOwnProperty("word") ? el.word : el.error) === word.toLowerCase();
            });

            if (index > -1) {
                return arrSearch[index].hasOwnProperty("suggs") ? arrSearch[index].suggs.map(s => WordMark.markCharsDiff(word.toLowerCase(), s)) : false;
            }
        }
        
        return null;
    }
    
    findWordMark(id) {
        return this.wordMarks.find(el => {
            return el.id === id;
        });
    }

    wordReg(word, modifier) {
        return new RegExp(`(^|\\s|[.?!„'(/,:;<>=&#*_+-])(${word})(?=\\s|[.?!,…:;"”'()/<>=&#*_+-]|$)`, "g" + (modifier || "")); // not just \\W or \\b due to lack of polish characters support
    }
    
    unpolish(txt) {
        return txt.replace('ó', 'o').replace('ł', 'l').replace('ą', 'a').replace('ę', 'e').replace('ś', 's').replace('ń', 'n').replace('ć', 'c').replace('ż', 'z').replace('ź', 'z');
    }
}

class WordMark {
    constructor(id, word, suggs, type) {
        this.id = id;
        this.wordCorr = word; // original after-correction word
        this.wordShow = word; // currently displayed word (may change due to user edit or replace with suggestion)
        this.suggs = suggs;
        this.type = type;
        this.el = null;
    }

    editStart() {
        let range = document.createRange();
        let sel = window.getSelection();

        this.el.setAttribute("contenteditable", true);
        
        range.setStart(this.el.childNodes[0], this.el.textContent.length);
        range.collapse(true);
        
        sel.removeAllRanges();
        sel.addRange(range);
    }

    editEnd() {
        let wordEdit = this.el.textContent;
        let corrEqual = (wordEdit === this.wordCorr);
        let menuEl = this.el.nextSibling;

        this.wordShow = wordEdit;
        this.el.setAttribute("contenteditable", false);
        this.el.classList.toggle("iko-corr-user", !corrEqual);
        this.suggsDisable(menuEl, wordEdit);
        this.el.blur();

        menuEl.querySelector(".iko-mark-btn-rest").disabled = corrEqual;
        menuEl.querySelector(".iko-mark-btn-edit").disabled = wordEdit === ""; // word removed - it's not possible to edit it anymore, so an edit button has to be disabled 
        
        return corrEqual;
    }

    replaceWithSugg(btnEl) {
        let suggWord = btnEl.textContent;
        let menuEl = btnEl.parentNode;

        if (this.wordCorr.match(/^[A-ZŻŹŁĆŚÓ]/)) {
            suggWord = this.wordCorr === this.wordCorr.toUpperCase() ? suggWord.toUpperCase() : suggWord[0].toUpperCase() + suggWord.substr(1);
        }

        this.wordShow = suggWord;
        this.el.textContent = suggWord;
        this.el.classList.add("iko-corr-user");
        this.suggsDisable(menuEl);
        
        btnEl.disabled = true;
        menuEl.querySelector(".iko-mark-btn-rest").disabled = false;
        menuEl.querySelector(".iko-mark-btn-edit").disabled = false; // edit button can be disabled only if user has removed a word in edition mode (then further edition is unavailable)
    }
    
    restore(btnEl) {
        var menuEl = btnEl.parentNode;
    
        this.wordShow = this.wordCorr;
        this.el.textContent = this.wordCorr;
        this.el.classList.remove("iko-corr-user");
        
        btnEl.disabled = true;
        this.suggsDisable(menuEl);
        
        menuEl.querySelector(".iko-mark-btn-edit").disabled = false; 
    }
    
    suggsDisable(menuEl, word = null) {
        each("iko-sugg", el => {
            el.disabled = word && word.toLowerCase() === el.textContent;
        }, menuEl);
    }
    
    static markCharsDiff(wordOrig, wordToUL) {
        if (wordOrig && wordToUL.trim().length > 1) {
            let wordUL = "";

            for (let j = 0; j < wordToUL.length; j++) {
                let [start, length] = j > 0 ? [j - 1, 3] : [0, 2];
                let wordOrigSubstr = wordOrig.substr(start, length);

                if (wordToUL[j] !== ' ' && wordOrigSubstr.indexOf(wordToUL[j]) === -1) {
                    wordUL += `<span>${wordToUL[j]}</span>`;
                } else {
                    wordUL += wordToUL[j];
                }
            }

            return wordUL.replace(/<\/span><span>/g, "");
        }
        
        return wordToUL;
    }
    
    static action(btnEl) {
        var wordMarkEl = btnEl.parentNode.previousSibling;
        var wordMark = panel.correction.txtCorrected.findWordMark(wordMarkEl.id);
        
        wordMark.el = wordMarkEl;

        if (btnEl.classList.contains("iko-mark-btn-rev")) {
            wordMark.reverse(btnEl);
        } else if (btnEl.classList.contains("iko-mark-btn-edit")) {
            wordMark.editStart();
        } else if (btnEl.classList.contains("iko-mark-btn-rest")) {
            wordMark.restore(btnEl);
        } else {
            wordMark.replaceWithSugg(btnEl);
        }
    }
    
    static actionBtnsHTML() {
        return '<button class="iko-mark-btn iko-mark-btn-rest" disabled>[przywróć]</button><button class="iko-mark-btn iko-mark-btn-edit">[edytuj]</button>';
    }
    
    static onEditEnd(e) {
        const el = e.target;
            
        if (el && el.classList.contains("iko-corr")) { 
            if (e.type === "keydown" && e.keyCode !== 13) { // 13 == Enter
                return; 
            }
            
            panel.correction.txtCorrected.findWordMark(el.id).editEnd();
        } else if (e.keyCode === 90 && e.ctrlKey && panel.correction.txtOriginAll) {
            panel.acceptUndo(e);
        }
    }
}

class WordMarkSucc extends WordMark {
    constructor(wordErr, comments, ...args) {
        super(...args);
        
        this.wordError = wordErr; // corrected word from source text
        this.wordShow = WordMark.markCharsDiff(wordErr, this.wordCorr);
        this.comments = comments;
        this.type = "succ";
    }
    
    editStart() {
        this.el.textContent = this.el.textContent.replace(/<\/?u>/g, "");
        super.editStart();
    }
    
    editEnd() {
        const corrEqual = super.editEnd();
        
        let btnRevEl = this.el.nextSibling.querySelector(".iko-mark-btn-rev");
        if (btnRevEl) btnRevEl.disabled = !corrEqual;
        
        this.el.classList.toggle("iko-corr-rev", this.wordShow === this.wordError);
        
        if (corrEqual) {
            this.wordShow = WordMark.markCharsDiff(this.wordError, this.wordCorr);
            this.el.innerHTML = this.wordShow;
        }
    }
    
    replaceWithSugg(btnEl) {
        super.replaceWithSugg(btnEl);
        
        let btnRevEl = btnEl.parentNode.querySelector(".iko-mark-btn-rev");
        if (btnRevEl) btnRevEl.disabled = true;
        this.el.classList.remove("iko-corr-rev");
    }
    
    reverse(btnEl) {
        this.el.textContent = this.wordError;
        this.el.classList.add("iko-corr-rev");
        this.el.classList.remove("iko-corr-user");
        
        btnEl.disabled = true;
        btnEl.parentNode.querySelector(".iko-mark-btn-rest").disabled = false;
        btnEl.parentNode.querySelector(".iko-mark-btn-edit").disabled = this.wordError === "";
    }
    
    restore(btnEl) {
        super.restore(btnEl);
        
        this.wordShow = WordMark.markCharsDiff(this.wordError, this.wordShow);
        this.el.innerHTML = this.wordShow;
        this.el.classList.remove("iko-corr-rev");
        
        let btnRevEl = btnEl.parentNode.querySelector(".iko-mark-btn-rev");
        if (btnRevEl) btnRevEl.disabled = false;
    }
    
    getCommentsHTML() {
        if (this.comments) {
            let [firstComm] = this.comments;
            this.comments[0] = firstComm[0].toUpperCase() + firstComm.substr(1);
            let html = `<ul><li>${this.comments.join(",</li><li>")}.</li></ul>`;
            
            return html.replace(/; ?(https?.+?)(?=<|,)/g, ` <a href="$1" target="_blank" rel="noopener noreferrer"><img src="${chrome.runtime.getURL("img/info-15.png")}" /></a>`);
        }
        
        return "";
    }
}

class iKorektorPanel {
    constructor() {
        this.lnkUrl = "https://ikorektor.pl/";
        this.apiUrl = "https://api.ikorektor.pl";
        this.txtEl = null;
        this.infEl = null;
        this.selection = null;
        this.selRange = null;
        this.correction = null; // current succeeded correction
        this.corrBtn = null;
        this.addFooter = false;
        this.conf = {
            txtLmt: 5000,
            txtLmtPrem: 10000,
            charsLmt: 50000,
            prem: null,
            btn: null,
            corr: null,
            session: null,
            draggable: false,
            replaceTxtarea: false, // auto replacement right after correction
            replaceContent: false
        };
    }
    
    init() {
        chrome.storage.sync.get(this.conf, settings => {
            this.conf = Object.assign(this.conf, settings);
            this.corrBtn = new CorrectionButton();
            this.checkActiveEl();
            this.checkSelection(null); // check if selection exists and if so, show correction button
            this.listenScriptsMsg();

            document.addEventListener("click", this.onClick);
            document.addEventListener("mouseup", this.checkSelection); // we cannot depend on click event in this case - selected text can be large, so the mousedown and mouseup events' target elements can differ - then click event will not fire

            if (this.txtEl || this.selection) {
                Correction.init();
            }
        });
    }
    
    checkActiveEl() {
        let el = document.activeElement;
        if (el && this.isTxtArea(el)) {
            this.corrBtn.show(null);
        }
    }
    
    checkSelection(e) { // "this" not refers to class object when fired as event callback!!! 
        if ((panel.corrBtn.el && panel.corrBtn.el.disabled) || (e && e.target && (e.target.id === "iko-do" || e.target.closest("#iko-inf")))) // or if there is selection in contentEditable element and btnEl was clicked right now; or in inf element
            return;

        panel.selection = window.getSelection();
        
        if (panel.selection.isCollapsed) {
            panel.selection = null;
            return;
        }

        panel.corrBtn.showOnContent();
    }
    
    listenScriptsMsg() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.message) {
                case "OPT_CHANGED":
                    chrome.storage.sync.get(this.conf, settings => {
                        this.conf = Object.assign(this.conf, settings);
                        this.corrBtn && this.corrBtn.update();
                        this.infEl && this.toggleDraggable();
                        
                        if (this.correction)
                            this.correction.txtOrigin = ""; // do not block correction with the same text, because correction settings may have changed
                    });
                    break;
                case "TOGGLE":
                    this.toggle(); //sendResponse({message: this.toggle()});
                    break;
            }
        });
    }
    
    toggle() {        
        this.checkActiveEl();
        this.checkSelection(null);
        
        if (this.txtEl || this.selection) { 
            Correction.init();
        }
    }
    
    onClick(e) {
        let el = e.target;
        if (!el) return; //|| !panel.active

        if (!(panel.corrBtn.el && panel.corrBtn.el.disabled) && panel.isTxtArea(el)) {
            panel.corrBtn.show();
        } else if (el.classList.contains("iko-mark-btn")) {
            WordMark.action(el);
        } else if (el.parentNode.classList.contains("iko-mark-btn")) {
            WordMark.action(el.parentNode);
        } else if (el.parentNode.id === "iko-lmt") {
            panel.slide(el.parentNode);
        } else if (el.parentNode.parentNode.id === "iko-lmt") {
            panel.slide(el.parentNode.parentNode);
        } else {
            switch (el.id) {
                case "iko-do":
                    Correction.init();
                    break;
                case "iko-accept":
                    panel.accept(el.parentNode);
                    break;
                case "iko-cancel":
                    panel.infEl.style.display = "none";
                    panel.txtEl ? panel.txtEl.focus() : panel.corrBtn.el.style.display = "none";
                    break;
                default:
                    panel.corrBtn.hide();
            }
        }
    }
    
    slide(el) {
        let height = el.offsetHeight / el.childElementCount;
        let top = parseInt(el.style.top);
        el.style.top = el.style.top === `-${el.offsetHeight - height}px` ? 0 : (isNaN(top) ? -height : top - height) + "px";
    }
    
    showLimits() {
        $("iko-txt-limit").textContent = num(this.conf.prem ? this.conf.txtLmtPrem : this.conf.txtLmt);
        $("iko-chars-limit").textContent = this.conf.prem ? "bez limitu" : num(this.conf.charsLmt);
    }
    
    getTxtLimit() {
        return this.conf.prem ? this.conf.txtLmtPrem : this.conf.txtLmt;
    }
    
    isTxtArea(el) {
        let tag = el.tagName.toLowerCase();

        if (tag === "textarea" || el.contentEditable === "true" || (this.corrBtn.settings.showOnInputs && this.isTxtInput(el))) {
            if (this.txtEl !== el && this.correction) {
                this.correction.txtOriginAll = ""; // reset Ctrl+Z text, because active element has changed
            } 

            this.txtEl = el;
            
            return true;
        } else { // Facebook:
            let editableParentEl = el.closest("[contenteditable=true]");
            
            if (editableParentEl) {
                this.txtEl = editableParentEl;
                return true;
            }
        }
        
        return false;
    }
    
    isTxtInput(el) {
        return el && el.tagName.toLowerCase() === "input" && el.type === "text";
    }
    
    premCheck(data) {
        if (data.hasOwnProperty("prem")) {
            let prem = Object.assign({}, this.conf.prem);
            
            if (data.prem.hasOwnProperty("error")) { // prem expired
                prem.dateExpire = data.prem.dateExpire;
                this.conf.prem = null; 
            } else {
                prem.daysUsage = data.prem.daysUsage;
            }
            
            chrome.storage.sync.set({prem: prem});
        }
    }
    
    premAdv() {
        return this.conf.prem ? "" : ` Aby zwiększyć limit, aktywuj pakiet ${this.lnk("pro", "iKorektorPro")}.`;
    }
    
    getExtensionUrl() {
        let extUrl = chrome.extension.getURL("");
        let isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(" OPR/") >= 0;
        return isOpera ? extUrl.replace(/chrome|moz/, "opera") : extUrl;
    }

    getAreaTxt() {
        let txt;
        
        if (this.txtEl.contentEditable === "true") {
            txt = this.getContentEditableTxt();
        } else {
            let selStart = this.txtEl.selectionStart;
            let selEnd = this.txtEl.selectionEnd;
            txt = (selStart === selEnd) ? this.txtEl.value.trim() : this.txtEl.value.slice(selStart, selEnd);
        }
        
        return txt.replace(/\n\n\n+/g, "\n\n"); // do not trim every text - we want to restore leading and ending white spaces on selected text for proper correction accept/replace
    }
    
    getContentEditableTxt() {
        if (panel.selection.isCollapsed || panel.selection.focusNode.parentNode !== panel.txtEl) { // 2nd condition for text selected outside active element (text area), only with conf.btnOnContent disabled probably
            panel.selection = null; // reset selection eventually used in element, can make a problem in further whole text correction and accept/replace
        } else {
            panel.selRange = panel.selection.getRangeAt(0);
            return panel.selection.toString(); // do not trim(!)
        }

        return panel.txtEl.innerText.trim(); //txtEl.innerHTML.trim().replace(/(<\/?(br|p|div|span).*?>)/ig, "$1\n");
    }

    show(inf, isErr) {
        if (!this.infEl) {
            this.set();
            return this.show(inf, isErr);
        }

        panel.corrBtn.el.disabled = false;
        
        this.infEl.style.top = (parseInt(panel.corrBtn.el.style.top, 10) + panel.corrBtn.el.offsetHeight + 9) + "px";
        this.infEl.style.right = panel.corrBtn.el.style.right;
        this.infEl.style.left = "auto"; // reset value set by dragElement()
        this.infEl.style.display = "block";
        this.infEl.classList.toggle("iko-to-right", this.isOnRight());
        
        const txtCorrEl = $("iko-txt-corr");
        
        if (inf) {
            txtCorrEl.innerHTML = inf;//.replace(/(&lt;\/?(div|p|span)&gt;)\s*/g, '<span class="iko-corr-data">$1</span>');
            txtCorrEl.classList.toggle("iko-corr-err", isErr);
            
            $("iko-accept").disabled = isErr;
            $("iko-txt-len").textContent = panel.correction ? num(panel.correction.txtOrigin.length) : 0;
            
            panel.showLimits();
        }
        
        let succs = inf.match(/-succ/g);
        $("iko-corr-cnt").textContent = succs ? succs.length : 0;
        fadeIn(this.infEl);
    }
    
    set() {
        let req = new XMLHttpRequest();
        req.open("GET", chrome.runtime.getURL("views/panel.html"), false); 
        req.send(null);
        
        document.body.insertAdjacentHTML("beforeend", req.responseText);
        
        this.infEl = $("iko-inf");
        this.toggleDraggable();
        
        $("iko-txt-area").style.setProperty("background-image", `url(${chrome.runtime.getURL("img/linedpaper_min.png")})`);
        $("iko-sett").href = chrome.runtime.getURL("views/options.html") + "?tab=true";
        
        if (chrome.runtime.getURL("").indexOf("chrome") > -1) {
            this.infEl.classList.add("iko-chrome");
        }
        
        document.addEventListener("keydown", WordMark.onEditEnd);
        document.addEventListener("focusout", WordMark.onEditEnd);
    }
    
    setReportTxt() {
        const el = $("iko-report");
        el.href = el.href.replace(/report.*/, "report=" + encodeURIComponent(this.correction.txtOrigin));
    }
    
    isOnRight() {
        var right = parseInt(this.infEl.style.right);
        
        if (window.innerWidth / 2 < right) {
            this.infEl.style.right = (right - this.infEl.offsetWidth + 30) + "px";
            return true;
        }
        
        return false;
    }
    
    toggleDraggable() {
        this.infEl.classList.toggle("iko-draggable", this.conf.draggable);
        
        if (this.conf.draggable) {
            dragElement(this.infEl);
        } else {
            this.infEl.onmousedown = null;
        }
    }
    
    accept(el) {
        const txtCorrHTML = $("iko-txt-corr").innerHTML;
        const txtCorr = this.correction.txtCorrected.stripMarksHTML(txtCorrHTML); // remove marks HTML tags

        if (this.txtEl) {
            this.replaceTxtarea(Correction.decodeTags(txtCorr)); // decode user's HTML tags for text inputs
            this.txtEl.focus();
        } else {
            this.replaceContent(txtCorr);
            this.corrBtn.el.style.display = "none";
        }
        
        el.style.display = "none";
        this.corrBtn.el.disabled = false;
    }
    
    acceptUndo(e) {
        e.preventDefault();

        if (this.txtEl.contentEditable === "true") {
            this.txtEl.innerHTML = this.correction.txtOriginAll;
        } else {
            this.txtEl.value = this.correction.txtOriginAll;
        }

        this.correction.txtOriginAll = "";
    }
    
    replaceTxtarea(txtCorr) {
        if (this.txtEl.contentEditable === "true") {
            this.replaceContentEditable(txtCorr);
        } else {
            let selStart = panel.txtEl.selectionStart;
            let selEnd = panel.txtEl.selectionEnd;
            this.txtEl.value = selStart === selEnd 
                             ? txtCorr + this.getFooter() 
                             : this.txtEl.value.substr(0, selStart) + this.correction.restoreWhiteSpaces(txtCorr) + this.txtEl.value.substr(selEnd);
        }
    }
    
    replaceContentEditable(txtCorr) {
        if (this.checkContentEditableHTML(txtCorr)) {
            if (this.selection) { // check if contentEditable element has selection
                this.replaceContent(txtCorr); // if so, then replace as a normal content selection
            } else {
                txtCorr += this.getFooter();
                this.txtEl.innerHTML = txtCorr.replace(/\n/g, "<br>");
            }
        }
    }
    
    checkContentEditableHTML(txtCorr) {
        if (this.txtEl.innerHTML.match(/<\/(div|p|span)>/)) {
            if (this.txtEl.querySelector("div[data-contents]")) { // Facebook
                alert("Zamiana mogłaby spowodować problemy z dalszą edycją lub dodaniem treści na stronę. Tekst poprawiony zostanie automatycznie skopiowany do schowka, wklej go manualnie w pole tekstowe (Ctrl+V).");
                
                const txtCorrEl = $("iko-txt-corr");
                txtCorr += this.getFooter();
                txtCorrEl.innerHTML = txtCorr.replace(/\n/g, "<br>"); // TODO: przetestować korektę takiego samego tekstu
                selectTxt(txtCorrEl);
                document.execCommand("copy");
                
                return false;
            } else if (!confirm("Zamiana spowoduje utratę dodatkowych danych określających np. wygląd tekstu. Czy kontynuować?")) {
                return false;
            }
        }
        
        return true;
    }
    
    replaceContent(txtCorr) {
        const txt = this.correction.restoreWhiteSpaces(txtCorr);
        const txtRows = txt.split("\n");

        this.selRange.deleteContents();

        for (let i = txtRows.length - 1; i >= 0; i--) {
            this.selRange.insertNode(document.createTextNode(txtRows[i]));
            i && this.selRange.insertNode(document.createElement("br"));
        }

        this.selection.removeAllRanges(); // remove selection, we already saved it's state in panel.selRange
    }
    
    getFooter() {
        if (!this.conf.prem && this.addFooter && this.txtEl.tagName.toLowerCase() !== "input") {
            this.addFooter = false; // add the footer only once at current page session
            return "\n\nTekst został sprawdzony przez iKorektor – https://ikorektor.pl";
        }
        
        return "";
    }

    lnk(uri, txt) {
        return `<a href="${this.lnkUrl + uri}" target="_blank" rel="noopener noreferrer">${txt}</a>`;
    }
}

var panel = new iKorektorPanel();
panel.init();