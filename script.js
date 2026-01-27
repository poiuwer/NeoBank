import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, query, where, 
    getDocs, runTransaction, onSnapshot, addDoc, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDdV2pkAB3oOKZMTP_zPs-Bg4Bx0stAYXg",
  authDomain: "neobank-37e78.firebaseapp.com",
  projectId: "neobank-37e78",
  storageBucket: "neobank-37e78.firebasestorage.app",
  messagingSenderId: "549306795136",
  appId: "1:549306795136:web:c7f79236a272e60574d265",
  measurementId: "G-09F4T961L2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = null;
let unsubscribeBalance = null;
let unsubscribeHistory = null;
let foundUserUid = null;
let historyLimit = 10; 
let staffHistoryLimit = 5;

document.addEventListener('DOMContentLoaded', () => {
    setupCustomSelects();
});

function setupCustomSelects() {
    document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
        const select = wrapper.querySelector('.custom-select');
        const trigger = select.querySelector('.custom-select__trigger');
        const options = select.querySelectorAll('.custom-option');
        const input = wrapper.querySelector('input[type="hidden"]');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            select.classList.toggle('open');
        });

        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                select.classList.remove('open');
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                trigger.querySelector('span').textContent = option.textContent;
                input.value = option.getAttribute('data-value');
            });
        });

        window.addEventListener('click', (e) => {
            if (!select.contains(e.target)) select.classList.remove('open');
        });
    });
}

const showNotify = (msg, type = 'info') => {
    const n = document.getElementById('notify');
    n.innerText = msg;
    n.className = 'notification show';
    n.style.borderLeftColor = (type === 'error') ? '#ff4757' : (type === 'success' ? '#2ecc71' : '#00d2ff');
    setTimeout(() => n.classList.remove('show'), 3000);
};

window.showPage = (pageId) => {
    if (currentUserData && currentUserData.isFrozen && pageId !== 'profile') {
        return showNotify("Акаунт заблоковано. Зверніться до підтримки.", 'error');
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');

    document.querySelectorAll('.menu-items button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick')?.includes(`'${pageId}'`)) btn.classList.add('active');
    });

    if (pageId === 'settings' && currentUserData) {
        document.getElementById('settingsName').value = currentUserData.name || "";
    }
};

window.copyTag = () => {
    if (currentUserData?.userCode) {
        navigator.clipboard.writeText("@" + currentUserData.userCode);
        showNotify("Тег скопійовано!", "success");
    }
};

window.loginWithGoogle = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (err) { showNotify(err.message, 'error'); }
};

window.logout = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        document.getElementById('auth-section').style.display = 'none';
        
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        
        if (!snap.exists()) {
            await setDoc(userRef, { 
                email: user.email, 
                balance: 0, 
                bank: 0, 
                wlo: 0,
                userCode: null,
                role: 'user', 
                isFrozen: false,
                transferBlocked: false
            });
            showSetupScreen();
        } else {
            const data = snap.data();
            if (!data.userCode) {
                showSetupScreen();
            } else {
                if(data.isFrozen) showNotify("Ваш акаунт заблоковано адміністрацією", "error");
                initAppSession(user, data);
            }
        }
    } else {
        resetApp();
    }
});

function resetApp() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('navMenu').style.display = 'none';
    document.getElementById('navUserName').style.display = 'none';
    document.body.className = ''; 
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    if (unsubscribeBalance) unsubscribeBalance();
    if (unsubscribeHistory) unsubscribeHistory();
}

function showSetupScreen() {
    document.getElementById('setup-section').style.display = 'block';
    document.getElementById('navMenu').style.display = 'none';
}

function initAppSession(user, data) {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('navMenu').style.display = 'flex';
    document.getElementById('navUserName').style.display = 'block';
    document.getElementById('navUserName').innerText = data.name || "User";
    
    updateUI(data);
    applyRoleTheme(data.role);
    window.showPage('home');

    const userRef = doc(db, "users", user.uid);
    if (unsubscribeBalance) unsubscribeBalance();
    unsubscribeBalance = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            currentUserData = docSnap.data();
            updateUI(currentUserData);
            applyRoleTheme(currentUserData.role);
            if(currentUserData.isFrozen) showNotify("УВАГА: Акаунт заблоковано!", 'error');
        }
    });
    
    historyLimit = 10;
    startHistoryListener(user.uid, historyLimit);
}

function updateUI(data) {
    const displayName = data.name || "Користувач";
    document.getElementById('homeUserName').innerText = displayName;
    document.getElementById('profileNameDisplay').innerText = displayName;
    document.getElementById('profileCodeDisplay').innerText = data.userCode || "---";
    
    const balance = (data.balance || 0).toLocaleString();
    document.getElementById('mainBalance').innerText = balance;
    document.getElementById('homeMainBalance').innerText = balance;
    
    document.getElementById('bankBalance').innerText = (data.bank || 0).toLocaleString();
    document.getElementById('wloBalance').innerText = (data.wlo || 0).toLocaleString();
}

function applyRoleTheme(role) {
    document.body.classList.remove('theme-admin', 'theme-moderator');
    const badge = document.getElementById('roleBadgeDisplay');
    const pBadge = document.getElementById('profileRoleBadge');
    const staffBtn = document.getElementById('staffPanelButtonCard');
    const avatar = document.getElementById('profileAvatarIcon');

    badge.style.display = 'none';
    pBadge.style.display = 'none';
    staffBtn.style.display = 'none';
    avatar.innerHTML = '<i class="fas fa-user"></i>';

    if (role === 'admin') {
        document.body.classList.add('theme-admin');
        badge.innerText = "ADMIN"; badge.style.display = 'block';
        pBadge.innerText = "ADMIN"; pBadge.style.display = 'block';
        staffBtn.style.display = 'block';
        avatar.innerHTML = '<i class="fas fa-crown"></i>';
    } else if (role === 'moderator') {
        document.body.classList.add('theme-moderator');
        badge.innerText = "MODERATOR"; badge.style.display = 'block';
        pBadge.innerText = "MODERATOR"; pBadge.style.display = 'block';
        staffBtn.style.display = 'block';
        avatar.innerHTML = '<i class="fas fa-user-shield"></i>';
    }
}

window.activateRole = async () => {
    const inputKey = document.getElementById('accessKeyInput').value.trim();
    if (!inputKey) {
        showNotify("Введіть код", 'warning');
        return;
    }

    try {
        const q = query(collection(db, "settings"), where("code", "==", inputKey));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const docSnap = querySnapshot.docs[0];
            const docData = docSnap.data();
            const newRole = docData.role; 

            if (newRole) {
                await updateDoc(doc(db, "users", currentUser.uid), { role: newRole });
                showNotify(`Доступ отримано: ${newRole.toUpperCase()}`, 'success');
                document.getElementById('accessKeyInput').value = "";
            } else {
                showNotify("Код вірний, але роль не налаштована в БД", 'error');
            }
        } else {
            showNotify("Невірний код доступу", 'error');
        }
    } catch (e) {
        console.error("Помилка activateRole:", e);
        showNotify("Помилка обробки запиту", 'error');
    }
};

window.staffSearchUser = async () => {
    let code = document.getElementById('staffTargetCode').value.trim().toLowerCase();
    if(code.startsWith('@')) code = code.substring(1);
    
    if(!code) return showNotify("Введіть тег", 'error');

    const q = query(collection(db, "users"), where("userCode", "==", code));
    const snap = await getDocs(q);

    if(snap.empty) {
        document.getElementById('staffUserInfo').style.display = 'none';
        return showNotify("Користувача не знайдено", 'error');
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data();
    foundUserUid = docSnap.id;

    document.getElementById('staffUserInfo').style.display = 'block';
    
    document.getElementById('staffFullDataName').innerText = data.name;
    document.getElementById('staffFullDataTag').innerText = data.userCode;
    document.getElementById('staffFullDataUid').innerText = foundUserUid;
    document.getElementById('staffFullDataEmail').innerText = data.email;
    document.getElementById('staffFullDataBal').innerText = data.balance;
    document.getElementById('staffFullDataBank').innerText = data.bank;
    document.getElementById('staffFullDataWlo').innerText = data.wlo;
    document.getElementById('staffFullDataFrozen').innerText = data.isFrozen ? "ТАК" : "НІ";
    document.getElementById('staffFullDataBlock').innerText = data.transferBlocked ? "ТАК" : "НІ";

    const currWrap = document.getElementById('adminCurrencyWrapper');
    const modDisp = document.getElementById('moderatorCurrencyDisplay');
    const controls = document.getElementById('adminControlsOnly');

    if(currentUserData.role === 'admin') {
        controls.style.display = 'block';
        currWrap.style.display = 'block';
        modDisp.style.display = 'none';
    } else {
        controls.style.display = 'none';
        currWrap.style.display = 'none';
        modDisp.style.display = 'block';
    }

    staffHistoryLimit = 5;
    loadStaffHistory(foundUserUid);
};

window.loadMoreStaffHistory = () => {
    if(!foundUserUid) return;
    staffHistoryLimit = 50;
    loadStaffHistory(foundUserUid);
    showNotify("Завантажено більше записів");
};

async function loadStaffHistory(uid) {
    const histDiv = document.getElementById('staffUserHistory');
    histDiv.innerHTML = "Завантаження...";
    
    const q = query(collection(db, "transactions"), where("uid", "==", uid), orderBy("timestamp", "desc"), limit(staffHistoryLimit));
    const snap = await getDocs(q);

    if(snap.empty) {
        histDiv.innerHTML = "Історія порожня";
        return;
    }

    histDiv.innerHTML = "";
    snap.forEach(d => {
        const t = d.data();
        const date = new Date(t.timestamp).toLocaleDateString();
        let details = t.details;
        if(details.includes('Admin correction')) details = 'Коригування адміністрацією';
        else if(details.includes('Moderator correction')) details = 'Коригування модератором';
        
        histDiv.innerHTML += `<div style="padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem;">
            ${date} | ${t.amount} ${t.currency} | ${details}
        </div>`;
    });
}

window.adminToggleFreeze = async () => {
    if(!foundUserUid || currentUserData.role !== 'admin') return;
    try {
        const ref = doc(db, "users", foundUserUid);
        const snap = await getDoc(ref);
        const currentFreeze = snap.data().isFrozen || false;
        
        await updateDoc(ref, { isFrozen: !currentFreeze });
        showNotify(currentFreeze ? "Користувача розблоковано" : "Користувача ЗАБЛОКОВАНО", 'success');
        window.staffSearchUser(); 
    } catch(e) { showNotify(e.message, 'error'); }
};

window.adminToggleTransferBlock = async () => {
    if(!foundUserUid || currentUserData.role !== 'admin') return;
    try {
        const ref = doc(db, "users", foundUserUid);
        const snap = await getDoc(ref);
        const currentBlock = snap.data().transferBlocked || false;
        
        await updateDoc(ref, { transferBlocked: !currentBlock });
        showNotify(currentBlock ? "Перекази дозволено" : "Перекази заборонено", 'success');
        window.staffSearchUser();
    } catch(e) { showNotify(e.message, 'error'); }
};

window.adminModifyMoney = async (multiplier) => {
    if(!foundUserUid) return;
    if(currentUserData.role !== 'admin' && currentUserData.role !== 'moderator') return;

    const amount = Number(document.getElementById('adminAmount').value);
    let currency = document.getElementById('adminCurrency').value;

    if(amount <= 0) return showNotify("Сума має бути > 0", 'error');

    if(currentUserData.role === 'moderator') {
        currency = 'WLO'; 
        if(amount > 10000) return showNotify("Лімит для модератора: 10 000 WLO", 'error');
    }

    const field = (currency === 'WLO') ? 'wlo' : 'balance';
    const finalAmount = amount * multiplier;
    const authorRole = currentUserData.role === 'admin' ? 'Admin' : 'Moderator';
    
    let detailsText = `${authorRole} correction (${multiplier > 0 ? '+' : '-'})`;

    try {
        await updateDoc(doc(db, "users", foundUserUid), { [field]: increment(finalAmount) });
        logTransaction(foundUserUid, 'admin_adj', Math.abs(finalAmount), currency, detailsText);
        showNotify("Баланс змінено", 'success');
        window.staffSearchUser();
    } catch (e) { showNotify("Помилка", 'error'); }
};

window.saveUserTag = async () => {
    const name = document.getElementById('setupName').value.trim();
    const code = document.getElementById('setupCode').value.trim().toLowerCase();
    
    if (!name || code.length < 3) return showNotify("Мін. 3 символи", 'error');
    if (!/^[a-z0-9]+$/.test(code)) return showNotify("Тільки латиниця і цифри", 'error');

    const q = query(collection(db, "users"), where("userCode", "==", code));
    const snap = await getDocs(q);

    if (!snap.empty) return showNotify("Цей Tag вже зайнятий!", 'error');

    try {
        await updateDoc(doc(db, "users", currentUser.uid), { name: name, userCode: code });
        const updatedSnap = await getDoc(doc(db, "users", currentUser.uid));
        initAppSession(currentUser, updatedSnap.data());
    } catch (e) { showNotify(e.message, 'error'); }
};

window.saveSettings = async () => {
    const newName = document.getElementById('settingsName').value.trim();
    if (!newName) return showNotify("Ім'я не може бути пустим", 'error');
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { name: newName });
        showNotify("Профіль оновлено!", 'success');
    } catch (e) { showNotify("Помилка збереження", 'error'); }
};

async function logTransaction(uid, type, amount, currency, details) {
    await addDoc(collection(db, "transactions"), {
        uid, type, amount, currency, details, timestamp: Date.now()
    });
}

window.loadMoreHistory = () => {
    historyLimit = 50; 
    startHistoryListener(currentUser.uid, historyLimit);
    showNotify("Завантажено більше транзакцій");
};

function startHistoryListener(uid, lim) {
    if (unsubscribeHistory) unsubscribeHistory();
    const q = query(collection(db, "transactions"), where("uid", "==", uid), orderBy("timestamp", "desc"), limit(lim));
    
    unsubscribeHistory = onSnapshot(q, (snapshot) => {
        const listDiv = document.getElementById('transactionList');
        if (snapshot.empty) {
            listDiv.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">Історія чиста</p>';
            return;
        }
        listDiv.innerHTML = '';
        snapshot.forEach((doc) => {
            const t = doc.data();
            const date = new Date(t.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            let pf = "", displayText = "";
            
            if(t.type === 'transfer_in') { 
                pf = "+"; 
                displayText = t.details.includes('From:') 
                    ? `Від: ${t.details.split('From:')[1]}` 
                    : "Отримання коштів";
            }
            else if(t.type === 'transfer_out') { 
                pf = "-"; 
                displayText = t.details.includes('To:') 
                    ? `Кому: ${t.details.split('To:')[1]}` 
                    : "Переказ коштів";
            }
            else if(t.type === 'bank_deposit') { 
                pf = "-"; 
                displayText = "Депозит у сейф"; 
            }
            else if(t.type === 'bank_withdraw') { 
                pf = "+"; 
                displayText = "Зняття з сейфу"; 
            }
            else if(t.type === 'exchange') { 
                displayText = "Обмін валют (WLO)"; 
            }
            else if(t.type === 'admin_adj') { 
                pf = (t.details.includes('+')) ? "+" : "-";
                if(t.details.includes('Admin')) displayText = "Коригування адміністрацією";
                else if(t.details.includes('Moderator')) displayText = "Коригування модератором";
                else displayText = t.details;
            }
            else { displayText = t.details; }

            listDiv.innerHTML += `
                <div class="transaction-item" style="display:flex; justify-content:space-between; padding:15px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div>
                        <div style="font-weight:600; color: #eee;">${displayText}</div>
                        <div style="font-size:0.75rem; opacity:0.5;">${date}</div>
                    </div>
                    <div style="font-weight:bold; color: var(--accent);">${pf}${t.amount} ${t.currency}</div>
                </div>`;
        });
    });
}

async function getUserIdByCode(code) {
    const q = query(collection(db, "users"), where("userCode", "==", code));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].id;
}

window.sendMoneyToUser = async () => {
    if (currentUserData.isFrozen || currentUserData.transferBlocked) {
        return showNotify("Перекази для вас заблоковані", 'error');
    }

    let targetCode = document.getElementById('transferToCode').value.trim().toLowerCase();
    if(targetCode.startsWith('@')) targetCode = targetCode.substring(1);
    const amount = Number(document.getElementById('transferToAmount').value);
    const currency = document.getElementById('transferCurrency').value;

    if (!targetCode || amount <= 0) return showNotify("Перевірте дані", 'error');
    if (targetCode === currentUserData.userCode) return showNotify("Собі переказати не можна", 'error');

    const field = (currency === 'WLO') ? 'wlo' : 'balance';
    const label = (currency === 'WLO') ? 'WLO' : '₴';

    try {
        const targetUid = await getUserIdByCode(targetCode);
        if (!targetUid) return showNotify("Користувача не знайдено", 'error');

        await runTransaction(db, async (t) => {
            const senderRef = doc(db, "users", currentUser.uid);
            const receiverRef = doc(db, "users", targetUid);
            
            const senderSnap = await t.get(senderRef);
            const receiverSnap = await t.get(receiverRef);
            
            if(!receiverSnap.exists()) throw "Отримувач не знайдений";

            const receiverData = receiverSnap.data();
            if(receiverData.isFrozen || receiverData.transferBlocked) {
                throw "Отримувач не може приймати кошти (Блок)";
            }

            if ((senderSnap.data()[field] || 0) < amount) throw `Недостатньо ${label}`;

            t.update(senderRef, { [field]: increment(-amount) });
            t.update(receiverRef, { [field]: increment(amount) });
            
            logTransaction(currentUser.uid, 'transfer_out', amount, label, `To: @${targetCode}`);
            logTransaction(targetUid, 'transfer_in', amount, label, `From: @${currentUserData.userCode}`);
        });
        showNotify("Надіслано!", 'success');
        document.getElementById('transferToAmount').value = "";
    } catch (e) { showNotify(typeof e === 'string' ? e : e.message, 'error'); }
};

window.transferToBank = async () => {
    if (currentUserData.isFrozen) return showNotify("Акаунт заморожено", 'error');
    const val = Number(document.getElementById('transferBankAmount').value);
    if (val > 0 && currentUserData.balance >= val) {
        await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(-val), bank: increment(val) });
        logTransaction(currentUser.uid, 'bank_deposit', val, '₴', 'Deposit');
        document.getElementById('transferBankAmount').value = "";
        showNotify("Успішно покладено", 'success');
    } else showNotify("Недостатньо коштів", 'error');
};

window.withdrawFromBank = async () => {
    if (currentUserData.isFrozen) return showNotify("Акаунт заморожено", 'error');
    const val = Number(document.getElementById('transferBankAmount').value);
    if (val > 0 && currentUserData.bank >= val) {
        await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(val), bank: increment(-val) });
        logTransaction(currentUser.uid, 'bank_withdraw', val, '₴', 'Withdraw');
        document.getElementById('transferBankAmount').value = "";
        showNotify("Успішно знято", 'success');
    } else showNotify("Недостатньо в сейфі", 'error');
};

window.exchangeToWlo = async () => {
    if (currentUserData.isFrozen) return showNotify("Операції заборонено", 'error');
    const val = Number(document.getElementById('exchangeAmount').value);
    if (val > 0 && currentUserData.balance >= val) {
        await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(-val), wlo: increment(val * 10) });
        logTransaction(currentUser.uid, 'exchange', val, '₴', `Exchange`);
        showNotify("Обмін успішний!", 'success');
        document.getElementById('exchangeAmount').value = "";
    } else showNotify("Помилка обміну", 'error');
};