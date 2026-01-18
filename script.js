import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } 
from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, query, where, getDocs, runTransaction, onSnapshot } 
from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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
let unsubscribe = null;

document.addEventListener('DOMContentLoaded', () => {
    setupCustomSelects();
});

function setupCustomSelects() {
    document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
        const select = wrapper.querySelector('.custom-select');
        const trigger = select.querySelector('.custom-select__trigger');
        const options = select.querySelectorAll('.custom-option');
        const input = wrapper.querySelector('input[type="hidden"]');

        trigger.addEventListener('click', () => {
            select.classList.toggle('open');
        });

        options.forEach(option => {
            option.addEventListener('click', () => {
                select.classList.remove('open');
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                trigger.querySelector('span').textContent = option.textContent;
                input.value = option.getAttribute('data-value');
            });
        });

        window.addEventListener('click', (e) => {
            if (!select.contains(e.target)) {
                select.classList.remove('open');
            }
        });
    });
}

const showNotify = (msg, type = 'info') => {
    const n = document.getElementById('notify');
    if (n) {
        n.innerText = msg;
        n.classList.add('show');
        if(type === 'error') n.style.borderLeftColor = '#ff4757';
        else n.style.borderLeftColor = '#00d2ff';
        setTimeout(() => n.classList.remove('show'), 3000);
    }
};

window.showPage = (pageId) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');

    document.querySelectorAll('.menu-items button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick')?.includes(`'${pageId}'`)) {
            btn.classList.add('active');
        }
    });
};

window.register = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('password').value;
    try {
        const cred = await createUserWithEmailAndPassword(auth, e, p);
        await setDoc(doc(db, "users", cred.user.uid), {
            email: e, balance: 0, bank: 0, wlo: 0
        });
        showNotify("Вітаємо в NeoBank!");
    } catch (err) { showNotify(err.message, 'error'); }
};

window.login = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('password').value;
    try { await signInWithEmailAndPassword(auth, e, p); } 
    catch (err) { showNotify("Перевірте дані входу", 'error'); }
};

window.logout = () => {
    if (unsubscribe) unsubscribe();
    signOut(auth);
};

function startAutoUpdate(uid) {
    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('mainBalance').innerText = (data.balance || 0).toLocaleString();
            document.getElementById('bankBalance').innerText = (data.bank || 0).toLocaleString();
            document.getElementById('wloBalance').innerText = (data.wlo || 0).toLocaleString();
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('navMenu').style.display = 'flex';
        
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            await setDoc(userRef, { email: user.email, balance: 0, bank: 0, wlo: 0 });
        }
        window.showPage('home');
        startAutoUpdate(user.uid);
    } else {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('navMenu').style.display = 'none';
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    }
});

window.sendMoneyToUser = async () => {
    const targetEmail = document.getElementById('transferToEmail').value.trim();
    const amount = Number(document.getElementById('transferToAmount').value);
    const currency = document.getElementById('transferCurrency').value;

    if (!targetEmail || amount <= 0) return showNotify("Заповніть всі поля", 'error');
    if (targetEmail === currentUser.email) return showNotify("Переказ собі неможливий", 'error');

    const fieldName = currency === 'UAH' ? 'balance' : 'wlo';

    try {
        const uid = await getUserIdByEmail(targetEmail);
        if (!uid) return showNotify("Користувача не знайдено", 'error');

        await runTransaction(db, async (transaction) => {
            const senderRef = doc(db, "users", currentUser.uid);
            const receiverRef = doc(db, "users", uid);
            const senderSnap = await transaction.get(senderRef);
            
            const currentBal = senderSnap.data()[fieldName] || 0;
            if (currentBal < amount) throw "Недостатньо коштів на рахунку";

            transaction.update(senderRef, { [fieldName]: increment(-amount) });
            transaction.update(receiverRef, { [fieldName]: increment(amount) });
        });

        showNotify(`Успішно надіслано ${amount} ${currency}`);
        document.getElementById('transferToEmail').value = "";
        document.getElementById('transferToAmount').value = "";
    } catch (err) {
        showNotify(typeof err === 'string' ? err : err.message, 'error');
    }
};

window.transferToBank = async () => {
    const amount = Number(document.getElementById('transferAmount').value);
    if (amount <= 0) return;
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.data().balance < amount) return showNotify("Недостатньо гривень", 'error');
    await updateDoc(userRef, { balance: increment(-amount), bank: increment(amount) });
    document.getElementById('transferAmount').value = "";
};

window.withdrawFromBank = async () => {
    const amount = Number(document.getElementById('transferAmount').value);
    if (amount <= 0) return;
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.data().bank < amount) return showNotify("Недостатньо коштів у сейфі", 'error');
    await updateDoc(userRef, { balance: increment(amount), bank: increment(-amount) });
    document.getElementById('transferAmount').value = "";
};

window.verifyAdmin = async () => {
    const code = document.getElementById('adminCodeInput').value;
    const snap = await getDoc(doc(db, "settings", "admin_config"));
    if (snap.exists() && snap.data().code === code) {
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminControls').style.display = 'block';
    } else { showNotify("Доступ заборонено", 'error'); }
};

async function getUserIdByEmail(email) {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].id;
}

window.adminAddMoney = async () => {
    const email = document.getElementById('targetUserEmail').value;
    const amount = Number(document.getElementById('adminAmount').value);
    const targetField = document.getElementById('adminCurrency').value;

    const uid = await getUserIdByEmail(email);
    if(uid) {
        await updateDoc(doc(db, "users", uid), { [targetField]: increment(amount) });
        showNotify(`Додано ${amount} на ${targetField}`);
    } else { showNotify("Користувача не знайдено", 'error'); }
};

window.adminRemoveMoney = async () => {
    const email = document.getElementById('targetUserEmail').value;
    const amount = Number(document.getElementById('adminAmount').value);
    const targetField = document.getElementById('adminCurrency').value;

    const uid = await getUserIdByEmail(email);
    if(uid) {
        await updateDoc(doc(db, "users", uid), { [targetField]: increment(-amount) });
        showNotify(`Списано ${amount} з ${targetField}`);
    } else { showNotify("Користувача не знайдено", 'error'); }
};