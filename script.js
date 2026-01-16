import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } 
from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, query, where, getDocs, runTransaction, onSnapshot } 
from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- ТВІЙ КОНФІГ ---
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
let unsubscribe = null; // Для зупинки прослуховування при виході

const showNotify = (msg) => {
    const n = document.getElementById('notify');
    if (n) {
        n.innerText = msg;
        n.classList.add('show');
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

// --- АВТОРИЗАЦІЯ ---
window.register = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('password').value;
    try {
        const cred = await createUserWithEmailAndPassword(auth, e, p);
        await setDoc(doc(db, "users", cred.user.uid), {
            email: e, balance: 0, bank: 0, isAdmin: false
        });
        showNotify("Реєстрація успішна!");
    } catch (err) { showNotify("Помилка: " + err.message); }
};

window.login = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('password').value;
    try { await signInWithEmailAndPassword(auth, e, p); } 
    catch (err) { showNotify("Помилка входу: " + err.message); }
};

window.logout = () => {
    if (unsubscribe) unsubscribe(); // Зупиняємо авто-оновлення перед виходом
    signOut(auth);
};

// --- ГОЛОВНА ФУНКЦІЯ АВТО-ОНОВЛЕННЯ (REAL-TIME) ---
function startAutoUpdate(uid) {
    if (unsubscribe) unsubscribe(); // Про всяк випадок чистимо старі підписки

    // Слухаємо документ користувача в реальному часі
    unsubscribe = onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Дані оновлено автоматично!");
            
            // Оновлюємо цифри на екрані миттєво
            document.getElementById('mainBalance').innerText = data.balance || 0;
            document.getElementById('bankBalance').innerText = data.bank || 0;
        }
    }, (error) => {
        console.error("Помилка авто-оновлення:", error);
    });
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('navMenu').style.display = 'flex';
        
        // Перевіряємо наявність профілю
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            await setDoc(userRef, { email: user.email, balance: 0, bank: 0 });
        }

        window.showPage('home');
        // ЗАПУСКАЄМО АВТО-ОНОВЛЕННЯ
        startAutoUpdate(user.uid);
    } else {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('navMenu').style.display = 'none';
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    }
});

// --- ГРОШОВІ ОПЕРАЦІЇ ---
window.sendMoneyToUser = async () => {
    const targetEmail = document.getElementById('transferToEmail').value.trim();
    const amount = Number(document.getElementById('transferToAmount').value);

    if (!targetEmail || amount <= 0) return showNotify("Введіть email та суму");
    if (targetEmail === currentUser.email) return showNotify("Не можна переказувати собі");

    try {
        const uid = await getUserIdByEmail(targetEmail);
        if (!uid) return showNotify("Користувача не знайдено");

        await runTransaction(db, async (transaction) => {
            const senderRef = doc(db, "users", currentUser.uid);
            const receiverRef = doc(db, "users", uid);
            const senderSnap = await transaction.get(senderRef);
            
            if (senderSnap.data().balance < amount) throw "Недостатньо коштів";

            transaction.update(senderRef, { balance: increment(-amount) });
            transaction.update(receiverRef, { balance: increment(amount) });
        });

        showNotify(`Переказано ${amount} грн для ${targetEmail}`);
        document.getElementById('transferToEmail').value = "";
        document.getElementById('transferToAmount').value = "";
    } catch (err) {
        showNotify("Помилка: " + (typeof err === 'string' ? err : err.message));
    }
};

window.transferToBank = async () => {
    const amount = Number(document.getElementById('transferAmount').value);
    if (amount <= 0) return;
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.data().balance < amount) return showNotify("Мало коштів");
    await updateDoc(userRef, { balance: increment(-amount), bank: increment(amount) });
};

window.withdrawFromBank = async () => {
    const amount = Number(document.getElementById('transferAmount').value);
    if (amount <= 0) return;
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.data().bank < amount) return showNotify("У сейфі порожньо");
    await updateDoc(userRef, { balance: increment(amount), bank: increment(-amount) });
};

// --- АДМІНКА ---
window.verifyAdmin = async () => {
    const code = document.getElementById('adminCodeInput').value;
    const snap = await getDoc(doc(db, "settings", "admin_config"));
    if (snap.exists() && snap.data().code === code) {
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminControls').style.display = 'block';
    } else { showNotify("Невірний код"); }
};

async function getUserIdByEmail(email) {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].id;
}

window.adminAddMoney = async () => {
    const email = document.getElementById('targetUserEmail').value;
    const amount = Number(document.getElementById('adminAmount').value);
    const uid = await getUserIdByEmail(email);
    if(uid) {
        await updateDoc(doc(db, "users", uid), { balance: increment(amount) });
        showNotify("Додано!");
    } else { showNotify("Не знайдено"); }
};

window.adminRemoveMoney = async () => {
    const email = document.getElementById('targetUserEmail').value;
    const amount = Number(document.getElementById('adminAmount').value);
    const uid = await getUserIdByEmail(email);
    if(uid) {
        await updateDoc(doc(db, "users", uid), { balance: increment(-amount) });
        showNotify("Списано!");
    }
};