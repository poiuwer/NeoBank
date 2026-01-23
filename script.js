import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup,
    createUserWithEmailAndPassword, signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, query, where, 
    getDocs, runTransaction, onSnapshot, addDoc, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- КОНФІГУРАЦІЯ (ВАШІ ДАНІ) ---
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

// --- Ініціалізація UI ---
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

// Модифікований перехід по сторінках з підвантаженням налаштувань
window.showPage = (pageId) => {
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

// --- AUTH SYSTEM ---

// Відправка листа через Firebase (Trigger Email Extension)
async function sendWelcomeEmail(email, name) {
    try {
        await addDoc(collection(db, "mail"), {
            to: email,
            message: {
                subject: "Вітаємо в NeoBank!",
                html: `Привіт, ${name}! Твій рахунок успішно створено. Твій унікальний ідентифікатор ще не обрано, зроби це в додатку.`
            }
        });
    } catch (e) { console.error("Email error:", e); }
}

window.loginWithGoogle = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (err) { showNotify(err.message, 'error'); }
};

window.registerEmail = async () => {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPass').value;
    if(!email || !pass) return showNotify("Введіть пошту та пароль", 'error');
    try { await createUserWithEmailAndPassword(auth, email, pass); } 
    catch (err) { showNotify(err.message, 'error'); }
};

window.loginEmail = async () => {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPass').value;
    if(!email || !pass) return showNotify("Заповніть поля", 'error');
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch (err) { showNotify("Помилка входу", 'error'); }
};

window.logout = () => signOut(auth);

// Головний слухач авторизації
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    
    if (user) {
        document.getElementById('auth-section').style.display = 'none';
        
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        
        // Новий користувач
        if (!snap.exists()) {
            await setDoc(userRef, { 
                email: user.email, 
                balance: 0, 
                bank: 0, 
                wlo: 0,
                userCode: null // Код ще не встановлено
            });
            // Відправка листа (запише в колекцію mail)
            sendWelcomeEmail(user.email, user.email.split('@')[0]);
            
            showSetupScreen();
        } else {
            const data = snap.data();
            // Якщо є аккаунт, але немає тегу - на налаштування
            if (!data.userCode) {
                showSetupScreen();
            } else {
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
    window.showPage('home');

    // Live update балансу
    const userRef = doc(db, "users", user.uid);
    if (unsubscribeBalance) unsubscribeBalance();
    unsubscribeBalance = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            currentUserData = docSnap.data();
            updateUI(currentUserData);
        }
    });
    
    startHistoryListener(user.uid);
}

function updateUI(data) {
    const displayName = data.name || "Користувач";
    document.getElementById('homeUserName').innerText = displayName;
    document.getElementById('profileNameDisplay').innerText = displayName;
    document.getElementById('profileCodeDisplay').innerText = data.userCode || "---";
    document.getElementById('mainBalance').innerText = (data.balance || 0).toLocaleString();
    document.getElementById('bankBalance').innerText = (data.bank || 0).toLocaleString();
    document.getElementById('wloBalance').innerText = (data.wlo || 0).toLocaleString();
}

// --- SETUP & SETTINGS ---

// Збереження унікального тегу
window.saveUserTag = async () => {
    const name = document.getElementById('setupName').value.trim();
    const code = document.getElementById('setupCode').value.trim().toLowerCase();
    
    if (!name || code.length < 3) return showNotify("Мін. 3 символи", 'error');
    if (!/^[a-z0-9]+$/.test(code)) return showNotify("Тільки латиниця і цифри", 'error');

    // Перевірка унікальності
    const q = query(collection(db, "users"), where("userCode", "==", code));
    const snap = await getDocs(q);

    if (!snap.empty) return showNotify("Цей Tag вже зайнятий!", 'error');

    try {
        await updateDoc(doc(db, "users", currentUser.uid), { name: name, userCode: code });
        // Оновлюємо сесію
        const updatedSnap = await getDoc(doc(db, "users", currentUser.uid));
        initAppSession(currentUser, updatedSnap.data());
    } catch (e) { showNotify(e.message, 'error'); }
};

// Збереження налаштувань (зміна імені)
window.saveSettings = async () => {
    const newName = document.getElementById('settingsName').value.trim();
    if (!newName) return showNotify("Ім'я не може бути пустим", 'error');
    
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { name: newName });
        showNotify("Профіль оновлено!", 'success');
    } catch (e) { showNotify("Помилка збереження", 'error'); }
};

// --- TRANSACTIONS ---

async function logTransaction(uid, type, amount, currency, details) {
    await addDoc(collection(db, "transactions"), {
        uid, type, amount, currency, details, timestamp: Date.now()
    });
}

function startHistoryListener(uid) {
    if (unsubscribeHistory) unsubscribeHistory();
    const q = query(collection(db, "transactions"), where("uid", "==", uid), orderBy("timestamp", "desc"), limit(15));
    
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
            let cl = "tr-neutral", pf = "";
            if(['transfer_in', 'bank_withdraw'].includes(t.type)) { cl = "tr-positive"; pf = "+"; }
            if(['transfer_out', 'bank_deposit'].includes(t.type)) { cl = "tr-negative"; pf = "-"; }
            if(t.type === 'exchange') cl = "tr-exchange";
            
            listDiv.innerHTML += `
                <div class="transaction-item ${cl}" style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div>
                        <div style="font-weight:600;">${t.details}</div>
                        <div style="font-size:0.8rem; opacity:0.6;">${date}</div>
                    </div>
                    <div style="font-weight:bold;">${pf}${t.amount} ${t.currency}</div>
                </div>`;
        });
    });
}

// Пошук ID по коду
async function getUserIdByCode(code) {
    const q = query(collection(db, "users"), where("userCode", "==", code));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].id;
}

window.sendMoneyToUser = async () => {
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
            
            if ((senderSnap.data()[field] || 0) < amount) throw `Недостатньо ${label}`;

            t.update(senderRef, { [field]: increment(-amount) });
            t.update(receiverRef, { [field]: increment(amount) });
            
            logTransaction(currentUser.uid, 'transfer_out', amount, label, `To: @${targetCode}`);
            logTransaction(targetUid, 'transfer_in', amount, label, `From: @${currentUserData.userCode}`);
        });
        showNotify("Надіслано!", 'success');
    } catch (e) { showNotify(typeof e === 'string' ? e : e.message, 'error'); }
};

window.transferToBank = async () => {
    const val = Number(document.getElementById('transferAmount').value);
    if (val > 0 && currentUserData.balance >= val) {
        await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(-val), bank: increment(val) });
        logTransaction(currentUser.uid, 'bank_deposit', val, '₴', 'Депозит');
        document.getElementById('transferAmount').value = "";
    } else showNotify("Недостатньо коштів", 'error');
};

window.withdrawFromBank = async () => {
    const val = Number(document.getElementById('transferAmount').value);
    if (val > 0 && currentUserData.bank >= val) {
        await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(val), bank: increment(-val) });
        logTransaction(currentUser.uid, 'bank_withdraw', val, '₴', 'Зняття');
        document.getElementById('transferAmount').value = "";
    } else showNotify("Недостатньо в сейфі", 'error');
};

window.exchangeToWlo = async () => {
    const val = Number(document.getElementById('exchangeAmount').value);
    if (val > 0 && currentUserData.balance >= val) {
        await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(-val), wlo: increment(val * 10) });
        logTransaction(currentUser.uid, 'exchange', val, '₴', `Купівля ${val*10} WLO`);
        showNotify("Обмін успішний!", 'success');
        document.getElementById('exchangeAmount').value = "";
    } else showNotify("Помилка обміну", 'error');
};

// --- ADMIN FUNCTIONS ---

// --- ADMIN FUNCTIONS ---

window.verifyAdmin = async () => {
    const enteredCode = document.getElementById('adminCodeInput').value;
    
    try {
        // Звертаємось до вашого документа admin_config у колекції settings
        const adminRef = doc(db, "settings", "admin_config");
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists()) {
            // Отримуємо значення поля 'code' з бази даних
            const secretCode = adminSnap.data().code;

            // Перевірка (враховуйте регістр: qWERadmin)
            if (enteredCode === secretCode) {
                document.getElementById('adminLogin').style.display = 'none';
                document.getElementById('adminControls').style.display = 'block';
                showNotify("Доступ дозволено", 'success');
            } else {
                showNotify("Невірний пароль", 'error');
            }
        } else {
            showNotify("Помилка: Налаштування не знайдені в БД", 'error');
        }
    } catch (e) {
        console.error("Admin verification error:", e);
        showNotify("Помилка підключення до БД", 'error');
    }
};

window.adminAddMoney = async () => {
    processAdminTx(1);
};

window.adminRemoveMoney = async () => {
    processAdminTx(-1);
};

async function processAdminTx(multiplier) {
    let targetCode = document.getElementById('targetUserCode').value.trim().toLowerCase();
    if(targetCode.startsWith('@')) targetCode = targetCode.substring(1);
    const amount = Number(document.getElementById('adminAmount').value);
    const currency = document.getElementById('adminCurrency').value;

    if (!targetCode || isNaN(amount) || amount <= 0) return showNotify("Перевірте дані", 'error');

    try {
        const uid = await getUserIdByCode(targetCode);
        if (!uid) return showNotify("Користувача не знайдено", 'error');

        const field = (currency === 'WLO') ? 'wlo' : 'balance';
        const finalAmount = amount * multiplier;

        await updateDoc(doc(db, "users", uid), { [field]: increment(finalAmount) });
        
        // Логування в історію
        logTransaction(uid, 'admin_adj', Math.abs(finalAmount), currency, multiplier > 0 ? 'Admin Deposit' : 'Admin Charge');
        
        showNotify("Баланс оновлено", 'success');
        document.getElementById('adminAmount').value = "";
    } catch (e) {
        showNotify("Помилка транзакції", 'error');
    }
}