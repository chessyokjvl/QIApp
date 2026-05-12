const API_URL = "https://script.google.com/macros/s/AKfycbxsOV5e5N46UYeAg2et9Q2kQCeZF-PY6hfcKVv_-YUPCy2lDRjMNMj8PZxrX14ksi1zzw/exec";

// สถานะแอปพลิเคชัน
let appState = {
    user: null,
    activities: [],
    users: [],
    types: [],
    calendarInstance: null,
    charts: {}
};

// --- Security: Hashing Function ---
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- API Fetcher ---
async function callAPI(action, payload = {}) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action, payload })
        });
        return await response.json();
    } catch (err) {
        Swal.fire('Error', 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', 'error');
        return { status: 'error' };
    }
}

// --- Authentication ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;
    const hashedPass = await hashPassword(pass); // เข้ารหัสก่อนส่ง!

    const res = await callAPI('login', { username: user, password: hashedPass });
    
    if (res.status === 'success') {
        appState.user = res.user;
        initApp();
    } else {
        Swal.fire('ล้มเหลว', res.message, 'error');
    }
});

function loginGuest() {
    appState.user = { id: 'guest', name: 'Guest User', role: 'Guest', profile_img: '' };
    initApp();
}

function logout() {
    appState.user = null;
    document.getElementById('view-app').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
}

// --- App Initialization & Navigation ---
async function initApp() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    
    // อัปเดตข้อมูลผู้ใช้ใน Sidebar
    document.getElementById('userNameDisplay').innerText = appState.user.name;
    document.getElementById('userRoleDisplay').innerText = appState.user.role;
    if(appState.user.profile_img) document.getElementById('userAvatar').src = appState.user.profile_img;

    // จัดการสิทธิ์
    const adminMenu = document.getElementById('adminMenu');
    const actionBtns = document.querySelectorAll('.id-action-btn'); 
    
    if (appState.user.role === 'Admin') {
        adminMenu.classList.remove('hidden');
        actionBtns.forEach(btn => btn.style.display = 'block');
    } else if (appState.user.role === 'Guest') {
        adminMenu.classList.add('hidden');
        actionBtns.forEach(btn => btn.style.display = 'none'); 
    } else {
        adminMenu.classList.add('hidden');
        actionBtns.forEach(btn => btn.style.display = 'block');
    }

    // โหลดข้อมูลทั้งหมด
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const data = await callAPI('getData');
    if (data.status === 'success') {
        appState.activities = data.activities || [];
        appState.users = data.users || [];
        appState.types = data.types || [];
        Swal.close();
        nav('dashboard'); 
    } else {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลจาก Google Sheets ได้', 'error');
    }
}

function nav(page) {
    // ซ่อนทุกหน้า
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    // ลบไฮไลต์ปุ่มเมนูทั้งหมด
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.classList.remove('bg-blue-50', 'text-blue-700');
    });

    // แสดงหน้าที่เลือก
    document.getElementById(`page-${page}`).classList.remove('hidden');
    
    // หาปุ่มเมนูที่กำลังเลือกอยู่แล้วใส่ไฮไลต์สี
    const activeBtn = document.querySelector(`[onclick="nav('${page}')"]`);
    if(activeBtn) {
        activeBtn.classList.add('bg-blue-50', 'text-blue-700');
    }

    // โหลด Component ของหน้านั้น
    if (page === 'dashboard') renderDashboard();
    if (page === 'calendar') renderCalendar();
}

// --- Render Functions ---
function renderDashboard() {
    // สรุป KPI
    document.getElementById('kpi-total').innerText = appState.activities.length;
    document.getElementById('kpi-ongoing').innerText = appState.activities.filter(a => a.status === 'Ongoing').length;
    document.getElementById('kpi-done').innerText = appState.activities.filter(a => a.status === 'Done').length;

    // วาด Chart (ตัวอย่าง Chart.js)
    const ctxType = document.getElementById('chartType');
    if(appState.charts.type) appState.charts.type.destroy();
    
    // Grouping ข้อมูลตาม Type แบบง่ายๆ
    const typeCount = appState.activities.reduce((acc, curr) => {
        acc[curr.type_id] = (acc[curr.type_id] || 0) + 1;
        return acc;
    }, {});

    appState.charts.type = new Chart(ctxType, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeCount).map(id => appState.types.find(t=>t.id==id)?.name || 'Unknown'),
            datasets: [{ data: Object.values(typeCount), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'] }]
        },
        options: { plugins: { title: { display: true, text: 'สัดส่วนกิจกรรมตามประเภท' } } }
    });
}

function renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (appState.calendarInstance) appState.calendarInstance.destroy();

    const events = appState.activities.map(a => ({
        id: a.id,
        title: a.title,
        start: a.start_date,
        end: a.end_date || a.deadline,
        color: appState.types.find(t => t.id == a.type_id)?.color || '#3788d8'
    }));

    appState.calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        events: events,
        eventClick: function(info) {
            // คลิกเพื่อเปิด Modal แสดงรายละเอียด / แก้ไขความก้าวหน้า
            if(appState.user.role === 'Guest') {
                Swal.fire(info.event.title, 'Guest ไม่สามารถแก้ไขได้', 'info');
            } else {
                Swal.fire({
                    title: info.event.title,
                    text: 'เปิดฟอร์มแก้ไขความก้าวหน้า (CRUD Modal)',
                    icon: 'info'
                });
            }
        }
    });
    appState.calendarInstance.render();
}

// --- Profile Update ---
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(appState.user.role === 'Guest') return Swal.fire('Error', 'Guest ไม่สามารถแก้ไขโปรไฟล์ได้', 'error');

    const pass = document.getElementById('profPass').value;
    const img = document.getElementById('profImg').value;
    
    let payload = { id: appState.user.id };
    if (img) payload.profile_img = img;
    if (pass) payload.new_password = await hashPassword(pass); // Hash ก่อนส่ง

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
    const res = await callAPI('updateProfile', payload);
    
    if(res.status === 'success') {
        Swal.fire('สำเร็จ', res.message, 'success');
        if(img) {
            appState.user.profile_img = img;
            document.getElementById('userAvatar').src = img;
        }
    } else {
        Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
    }
});
