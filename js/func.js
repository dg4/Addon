function $(id) {
    return document.getElementById(id);
}

function slideToggle(el, heightOrig) {
    el.style.transition = "height 500ms";
    const {height} = el.ownerDocument.defaultView.getComputedStyle(el, null);
    el.style.setProperty("height", (parseInt(height, 10) === 0 ? heightOrig : 0) + "px");
}

function fadeIn(el, ms) {
    el.style.opacity = 0;
    let opacity = 0;

    const timer = setInterval(function() {
        opacity += 50 / (ms || 500);

        if (opacity >= 1) {
            clearInterval(timer);
            opacity = 1;
        }

        el.style.opacity = opacity;
    }, 50);
}

function num(num) {
    var n = parseInt(num);
    return n && n.toString().length > 4 ? n.toLocaleString("en-US").replace(/,/g, " ") : num;
}

function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function each(cls, func, el = document) {
    [].forEach.call(el.getElementsByClassName(cls), func);
}

function dateFormat(date) {
    var lz = function(val) {
        return ("0" + val).slice(-2); // ensure leading zero
    };
    var d = new Date(date);
    return lz(d.getDate()) + "." + lz(d.getMonth() + 1) + "." + d.getFullYear() + ", " + lz(d.getHours()) + ":" + lz(d.getMinutes());
}

function selectTxt(el) {
    if (document.body.createTextRange) {
        var range = document.body.createTextRange();
        range.moveToElementText(el);
        range.select();
    } else if (window.getSelection) {
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

function copyToClipboard() {
    var result = false;

    try {
        result = document.execCommand("copy");
    } catch (err) {
        console.log("Copy error: " + err);
    }

    return result;
}

function dragElement(el) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    el.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        //e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function getOffset(el) {
    const box = el.getBoundingClientRect();
    return {
        top: box.top + window.pageYOffset - document.documentElement.clientTop,
        left: box.left + window.pageXOffset - document.documentElement.clientLeft
    };
}

function getWordForm(cnt, singular, plural, pluralGenitive) {
    if (cnt === 1)
        return singular;

    let rmnd10 = cnt % 10;
    let rmnd100 = cnt % 100;

    if (rmnd10 > 4 || rmnd10 < 2 || (rmnd100 < 15 && rmnd100 > 11))
        return pluralGenitive;

    return plural;
}