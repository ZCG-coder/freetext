const hostname = "https://67dad9cea7ef9711c05b.appwrite.global";

async function sha1(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// credits to https://stackoverflow.com/a/13419367/14868780
function parseQuery(queryString) {
    let query = {};
    let pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
    for (let i = 0; i < pairs.length; i++) {
        let pair = pairs[i].split('=');
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
    }
    return query;
}

function getAccount() {
    const client = new Client().setProject('freemsg');
    const account = new Account(client);

    return account;
}

function handleLogin() {
    window.location.replace("/freetext/chats.html")
}

function loginAddin() {
    function processForm(e) {
        if (e.preventDefault) e.preventDefault();

        const passwd = document.getElementById("ft-passwd").value;
        const email = document.getElementById("ft-email").value;

        const account = getAccount();
        const promise = account.createEmailPasswordSession(email, passwd);

        promise.then(function(response) {
            console.log(response); // Success
            handleLogin();
        }, function(error) {
            // Alert the user about the failure
            document.getElementById("ft-login-error").innerText = error.message.toLowerCase();
        });

        return false;
    }

    const form = document.getElementById('ft-login-form');
    form.addEventListener("submit", processForm)
}

async function chatsAddin() {
    const account = getAccount();
    let userObj;
    try {
        userObj = await account.get();
    } catch (err) {
        window.location.replace("/freetext/login.html");
        return;
    }

    const chatsBody = document.getElementById("ft-grps-body");
    const groupResponse = await fetch(`${hostname}/groups`, {
        method: "GET",
        headers: {
            "x-ft-user-id": userObj["$id"],
            "x-ft-email": userObj["email"]
        },
    });
    const groupsResponseJSON = await groupResponse.json();

    for (i of groupsResponseJSON.documents) {
        const name = i.name;
        const members = i.members.slice(0, 3); // Be extra careful not to overload the UI with information.
        const id = i.$id;

        const msgResponse = await fetch(`${hostname}/msg?last=1`, {
            method: "GET",
            headers: {
                "x-ft-user-id": userObj["$id"],
                "x-ft-email": userObj["email"],
                "x-ft-msg-group": id
            },
        })
        let msgResponseJSON = await msgResponse.json();
        msgResponseJSON = msgResponseJSON[0];

        if (msgResponseJSON) {
            const lastMsgSender = msgResponseJSON.sender;
            const lastMsgDate = msgResponseJSON.received;
            const text = msgResponseJSON.text[0].slice(0, 25) + "...";
            chatsBody.innerHTML += `
            <tr>
                <td><input type="checkbox"></td>
                <td><a href="/freetext/view.html?id=${id}">${name}</a></td>
                <td>(${lastMsgSender}) ${text}</td>
                <td>${lastMsgDate}</td>
            </tr>
            `;
        } else {
            chatsBody.innerHTML += `
            <tr>
                <td><input type="checkbox"></td>
                <td><a href="/freetext/view.html?id=${id}">${name}</a></td>
                <td><i>empty</i></td>
                <td>n/a</td>
            </tr>
            `;
        }

    }
}

async function updateMsgs() {
    const queries = parseQuery(window.location.search.substring(1));
    if (!queries.id)
        window.location.replace("/freetext/chats.html");

    const msgResponse = await fetch(`${hostname}/msg`, {
        method: "GET",
        headers: {
            "x-ft-user-id": window.userObj["$id"],
            "x-ft-email": window.userObj["email"],
            "x-ft-msg-group": queries.id
        },
    })
    const msgResponseJSON = await msgResponse.json();
    const element = document.getElementById("ft-chat-msgs-area");
    element.innerHTML = "<i>loading</i>";
    let html = "";

    for (i of msgResponseJSON) {
        let text = "";
        for (line of i.text)
            text += `    ${line}\n`
        html += `<p>
            <table>
                <tr>
                    <td><b>from</b></td>
                    <td>${i.sender}</td>
                </tr>
                <tr>
                    <td><b>date</b></td>
                    <td>${i.received}</td>
                </tr>
            </table>

            <pre>${text}</pre>
        </p><hr>`;
    }
    element.innerHTML = html;
    window.scrollTo(0, document.body.scrollHeight);
}

async function chatViewAddin() {
    const account = getAccount();
    let userObj;
    try {
        window.userObj = await account.get();
    } catch (err) {
        window.location.replace("/freetext/login.html");
        return;
    }
    await updateMsgs()
}

async function sendMsg() {
    function chunkString(str, len) {
        const size = Math.ceil(str.length / len)
        const r = Array(size)
        let offset = 0

        for (let i = 0; i < size; i++) {
            r[i] = str.substr(offset, len)
            offset += len
        }

        return r
    }

    const queries = parseQuery(window.location.search.substring(1));
    if (!queries.id)
        window.location.replace("/freetext/chats.html");
    const msgBoxElem = document.getElementById("ft-chat-msg");
    const msg = msgBoxElem.value;
    if (!msg)
        return;

    const obj = { "msg": chunkString(msg, 1073741824) };
    const sendResponse = await fetch(`${hostname}/msg`, {
        method: "POST",
        body: JSON.stringify(obj),
        headers: {
            "x-ft-user-id": userObj["$id"],
            "x-ft-email": userObj["email"],
            "x-ft-msg-group": queries.id
        },
    });
    if (!sendResponse.ok)
        alert("error: message cannot be sent")

    msgBoxElem.value = "";
    await updateMsgs();
}

async function logout() {
    try {
        const account = getAccount();
        await account.deleteSession("current");
    } catch (err) {}
    window.location.replace("/freetext/index.html");
}

window.addEventListener("DOMContentLoaded", async function() {
    if (window.ftLogin) {
        const account = getAccount();
        try {
            await account.get();
            document.getElementById("ft-login-info").innerText = "please wait...";
            handleLogin();
        } catch (err) {}
        loginAddin();
    } else if (window.ftChats) {
        chatsAddin();
    } else if (window.viewMode) {
        chatViewAddin();
        document.getElementById("ft-chat-send").onclick = async function() { await sendMsg(); }
    }
});
