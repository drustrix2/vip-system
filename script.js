import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
    getDatabase, ref, onValue, push, set, update, remove, get
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import {
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// ====== CONFIG ======
const firebaseConfig = {
    apiKey: "AIzaSyAg5S0_3O1EicYWqY8jVulF_bF_0kspmDg",
    authDomain: "vip-system-d8317.firebaseapp.com",
    databaseURL: "https://vip-system-d8317-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "vip-system-d8317",
    storageBucket: "vip-system-d8317.firebasestorage.app",
    messagingSenderId: "584414132253",
    appId: "1:584414132253:web:5a4ca54246fb66d0ed6ef4"
};

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

// ====== STATE ======
let isAdmin = false;
let currentUser = null;
let vipsData = {};
let currentPopupKey = null;
let deletePopupKey = null;
let countdownInterval = null;

// ====== ELEMENTS ======
const loginModal   = document.getElementById("loginModal");
const adminModal   = document.getElementById("adminModal");
const adminPassEl  = document.getElementById("adminPass");
const emailEl      = document.getElementById("email");
const msgEl        = document.getElementById("msg");
const adminMsgEl   = document.getElementById("admin-msg");
const vipListEl    = document.getElementById("vip-list");
const histListEl   = document.getElementById("history-list");
const vipCountEl   = document.getElementById("vip-count");
const expCountEl   = document.getElementById("expired-count");
const histCountEl  = document.getElementById("history-count");
const addDaysPopup = document.getElementById("addDaysPopup");
const deletePopup  = document.getElementById("deletePopup");
const openModalBtn = document.getElementById("openModalBtn");
const openAdminBtn = document.getElementById("openAdminBtn");

// ====== MODAL OPEN/CLOSE ======
openModalBtn.addEventListener("click", () => {
    loginModal.classList.add("active");
});
document.getElementById("closeBtn").addEventListener("click", () => {
    loginModal.classList.remove("active");
    msgEl.textContent = "";
});

openAdminBtn.addEventListener("click", () => {
    adminModal.classList.add("active");
});
document.getElementById("closeAdminBtn").addEventListener("click", () => {
    adminModal.classList.remove("active");
});

// ====== TABS ======
document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    });
});

// ====== LOGIN ======
document.getElementById("loginBtn").addEventListener("click", async () => {
    const email    = emailEl.value.trim();
    const password = adminPassEl.value;
    if (!email || !password) {
        msgEl.style.color = "#f44336";
        msgEl.textContent = "❌ ใส่อีเมลและรหัสผ่าน";
        return;
    }
    msgEl.style.color = "#aaa";
    msgEl.textContent = "⏳ กำลังเข้าสู่ระบบ...";
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
        msgEl.style.color = "#f44336";
        msgEl.textContent = "❌ อีเมลหรือรหัสผ่านผิด";
    }
});

// ====== LOGOUT ======
document.getElementById("logoutBtn").addEventListener("click", async () => {
    await signOut(auth);
    isAdmin = false;
    currentUser = null;
    adminModal.classList.remove("active");
    openAdminBtn.style.display = "none";
    openModalBtn.style.display = "";
    emailEl.value = "";
    adminPassEl.value = "";
    renderVips();
});

// ====== CHECK ADMIN ======
async function checkAdmin(uid) {
    const snap = await get(ref(db, `admins/${uid}`));
    return snap.exists();
}

// ====== AUTH STATE CHANGE ======
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        isAdmin = false;
        currentUser = null;
        openAdminBtn.style.display = "none";
        openModalBtn.style.display = "";
        renderVips();
        return;
    }
    currentUser = user;
    isAdmin = await checkAdmin(user.uid);

    if (isAdmin) {
        // ปิด login modal, เปิดปุ่ม Admin Panel
        loginModal.classList.remove("active");
        openModalBtn.style.display = "none";
        openAdminBtn.style.display = "";
        adminMsgEl.style.color = "#4caf50";
        adminMsgEl.textContent = `✅ ล็อกอินแล้ว: ${user.email}`;
        msgEl.textContent = "";
    } else {
        msgEl.style.color = "#f44336";
        msgEl.textContent = "❌ บัญชีนี้ไม่ใช่แอดมิน";
        await signOut(auth);
    }
    renderVips();
});

// ====== เพิ่ม VIP ใหม่ ======
document.getElementById("addVipBtn").addEventListener("click", async () => {
    if (!isAdmin) return;

    const name = document.getElementById("vipName").value.trim();
    const days = parseInt(document.getElementById("vipDays").value) || 0;
    const note = document.getElementById("vipNote").value.trim();

    if (!name) { adminMsgEl.style.color = "#f44336"; adminMsgEl.textContent = "❌ ใส่ชื่อก่อน"; return; }
    if (days < 1) { adminMsgEl.style.color = "#f44336"; adminMsgEl.textContent = "❌ จำนวนวันต้องมากกว่า 0"; return; }

    const expiryTimestamp = Date.now() + days * 86400000;
    await set(push(ref(db, "vips")), {
        name, days, note,
        expiryTimestamp,
        addedAt: Date.now(),
        createdBy: currentUser.uid
    });

    adminMsgEl.style.color = "#4caf50";
    adminMsgEl.textContent = `✅ เพิ่ม "${name}" สำเร็จ`;
    document.getElementById("vipName").value = "";
    document.getElementById("vipDays").value = "";
    document.getElementById("vipNote").value = "";
});

// ====== ลบ VIP ======
async function deleteVip(key) {
    if (!isAdmin) return;
    const snap = await get(ref(db, `vips/${key}`));
    if (!snap.exists()) return;
    const vip = snap.val();
    await push(ref(db, "history"), { ...vip, removedAt: Date.now(), reason: "ถูกลบโดยแอดมิน" });
    await remove(ref(db, `vips/${key}`));
}

// ====== POPUP เพิ่มวัน ======
document.getElementById("popup-cancel").addEventListener("click", () => {
    addDaysPopup.classList.remove("active");
    document.getElementById("popup-days").value = "";
    currentPopupKey = null;
});

document.getElementById("popup-confirm").addEventListener("click", async () => {
    const days = parseInt(document.getElementById("popup-days").value);
    if (!days || days < 1) { alert("ใส่จำนวนวันให้ถูกต้อง"); return; }

    const snap = await get(ref(db, `vips/${currentPopupKey}`));
    if (!snap.exists()) return;

    const vip = snap.val();
    const newExpiry = (vip.expiryTimestamp || Date.now()) + days * 86400000;

    await update(ref(db, `vips/${currentPopupKey}`), {
        expiryTimestamp: newExpiry,
        days: Math.ceil((newExpiry - Date.now()) / 86400000)
    });

    addDaysPopup.classList.remove("active");
    document.getElementById("popup-days").value = "";
    currentPopupKey = null;
});


// ====== DELETE CONFIRM POPUP ======
document.getElementById("delete-cancel").addEventListener("click", () => {
    deletePopup.classList.remove("active");
    deletePopupKey = null;
});

document.getElementById("delete-confirm").addEventListener("click", async () => {
    if (!deletePopupKey) return;
    await deleteVip(deletePopupKey);
    deletePopup.classList.remove("active");
    deletePopupKey = null;
});

// ====== FORMAT COUNTDOWN ======
function formatCountdown(ms) {
    if (ms <= 0) return "หมดอายุแล้ว";
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${d} วัน ${h} ชั่วโมง ${m} นาที`;
}

// ====== RENDER VIP ======
function renderVips() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    vipListEl.innerHTML = "";

    const now = Date.now();
    const keys = Object.keys(vipsData);
    let expiredCount = 0;

    vipCountEl.textContent = keys.length;

    if (keys.length === 0) {
        vipListEl.innerHTML = "<p style='color:#555;padding:20px;'>ยังไม่มีสมาชิก VIP</p>";
    }

    keys.forEach(key => {
        const vip = vipsData[key];
        const expiry = vip.expiryTimestamp || 0;
        const remaining = expiry - now;
        const expired = remaining <= 0;
        if (expired) expiredCount++;

        const div = document.createElement("div");
        div.className = `vip-card ${expired ? "expired-vip" : "active-vip"}`;
        div.innerHTML = `
            <h3>${vip.name || key}</h3>
            <span class="status-badge ${expired ? "badge-expired" : "badge-active"}">
                ${expired ? "● หมดอายุ" : "● VIP"}
            </span>
            <p>📝 ${vip.note || "-"}</p>
            <div class="countdown ${expired ? "red" : "green"}" data-key="${key}">
                ${formatCountdown(remaining)}
            </div>
            ${isAdmin ? `
            <div class="card-actions">
                <button class="btn-add-days" data-key="${key}" data-name="${vip.name}">➕ เพิ่มวัน</button>
                <button class="btn-delete" data-key="${key}">🗑 ลบ</button>
            </div>` : ""}
        `;
        vipListEl.appendChild(div);
    });

    expCountEl.textContent = expiredCount;

    if (isAdmin) {
        document.querySelectorAll(".btn-add-days").forEach(btn => {
            btn.addEventListener("click", () => {
                currentPopupKey = btn.dataset.key;
                document.getElementById("popup-name").textContent = `สมาชิก: ${btn.dataset.name}`;
                addDaysPopup.classList.add("active");
            });
        });
        document.querySelectorAll(".btn-delete").forEach(btn => {
            btn.addEventListener("click", () => {
                const name = vipsData[btn.dataset.key]?.name || btn.dataset.key;
                deletePopupKey = btn.dataset.key;
                document.getElementById("delete-name-text").textContent = name;
                deletePopup.classList.add("active");
            });
        });
    }

    countdownInterval = setInterval(() => {
        document.querySelectorAll(".countdown[data-key]").forEach(el => {
            const vip = vipsData[el.dataset.key];
            if (!vip) return;
            const rem = (vip.expiryTimestamp || 0) - Date.now();
            el.textContent = formatCountdown(rem);
            el.className = `countdown ${rem <= 0 ? "red" : "green"}`;
        });
    }, 30000);
}

// ====== RENDER HISTORY ======
function renderHistory(data) {
    histListEl.innerHTML = "";
    if (!data) {
        histListEl.innerHTML = "<p style='color:#555;padding:20px;'>ยังไม่มีประวัติ</p>";
        histCountEl.textContent = "0";
        return;
    }
    const keys = Object.keys(data);
    histCountEl.textContent = keys.length;
    keys.slice().reverse().forEach(key => {
        const h = data[key];
        const isDeleted = h.reason === "ถูกลบโดยแอดมิน";
        const div = document.createElement("div");
        div.className = `vip-card ${isDeleted ? "deleted-vip" : "expired-vip"}`;
        div.innerHTML = `
            <h3>${h.name || key}</h3>
            <span class="status-badge ${isDeleted ? "badge-deleted" : "badge-expired"}">
                ${isDeleted ? "🗑 ถูกลบโดยแอดมิน" : "⏰ หมดอายุ"}
            </span>
            <p>📝 ${h.note || "-"}</p>
            <div class="history-meta">
                <span>🗓 ${h.removedAt ? new Date(h.removedAt).toLocaleString("th-TH") : "-"}</span>
                ${h.addedAt ? `<span>➕ เพิ่มเมื่อ ${new Date(h.addedAt).toLocaleDateString("th-TH")}</span>` : ""}
            </div>
        `;
        histListEl.appendChild(div);
    });
}

// ====== FIREBASE LISTENERS ======
onValue(ref(db, "vips"), async (snap) => {
    const raw = snap.val() || {};
    const now = Date.now();

    for (const [key, vip] of Object.entries(raw)) {
        if (vip.expiryTimestamp && vip.expiryTimestamp < now) {
            await push(ref(db, "history"), { ...vip, removedAt: now, reason: "หมดอายุ" });
            await remove(ref(db, `vips/${key}`));
            delete raw[key];
        }
    }

    vipsData = raw;
    renderVips();
});

onValue(ref(db, "history"), async (snap) => {
    const data = snap.val();
    if (!data) { renderHistory(null); return; }

    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    // ลบ entry ที่เก่ากว่า 30 วัน
    const cleaned = { ...data };
    for (const [key, h] of Object.entries(data)) {
        if (h.removedAt && (now - h.removedAt) > THIRTY_DAYS) {
            await remove(ref(db, `history/${key}`));
            delete cleaned[key];
        }
    }

    // ถ้ายังเหลือมากกว่า 30 รายการ ลบรายการเก่าสุดออก
    const remaining = Object.entries(cleaned)
        .sort((a, b) => (a[1].removedAt || 0) - (b[1].removedAt || 0));
    if (remaining.length > 30) {
        const toDelete = remaining.slice(0, remaining.length - 30);
        for (const [key] of toDelete) {
            await remove(ref(db, `history/${key}`));
            delete cleaned[key];
        }
    }

    renderHistory(cleaned);
});
