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

// --- Modal Handlers ---
function openModal(type, id = null) {
    if(appState.user.role === 'Guest') return Swal.fire('ไม่อนุญาต', 'Guest ไม่สามารถจัดการข้อมูลได้', 'warning');
    
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    if (type === 'activity') {
        const selectType = document.getElementById('act-type');
        selectType.innerHTML = appState.types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        
        if (id) {
            const act = appState.activities.find(a => a.id === id);
            document.getElementById('modal-act-title').innerText = 'แก้ไขข้อมูลกิจกรรม';
            document.getElementById('act-id').value = act.id;
            document.getElementById('act-title').value = act.title;
            document.getElementById('act-type').value = act.type_id;
            document.getElementById('act-assignee').value = act.assignee;
            document.getElementById('act-start').value = act.start_date;
            document.getElementById('act-end').value = act.end_date || act.deadline;
            document.getElementById('act-progress').value = act.progress;
            document.getElementById('act-status').value = act.status;
            document.getElementById('act-result').value = act.result;
        } else {
            document.getElementById('activityForm').reset();
            document.getElementById('act-id').value = '';
            document.getElementById('modal-act-title').innerText = 'เพิ่มกิจกรรมใหม่';
        }
    }

    if (type === 'user') {
        if (id) {
            const user = appState.users.find(u => u.id === id);
            document.getElementById('user-id').value = user.id;
            document.getElementById('u-name').value = user.name;
            document.getElementById('u-user').value = user.username;
            document.getElementById('u-role').value = user.role;
            document.getElementById('u-status').value = user.status;
            document.getElementById('pass-field').querySelector('label').innerText = "Password (กรอกเมื่อต้องการเปลี่ยน)";
        } else {
            document.getElementById('userForm').reset();
            document.getElementById('user-id').value = '';
            document.getElementById('pass-field').querySelector('label').innerText = "Password (รหัสผ่านเริ่มต้น)";
        }
    }
}

function closeModal(type) {
    document.getElementById(`modal-${type}`).classList.add('hidden');
}

// --- Submit Activity ---
document.getElementById('activityForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        id: document.getElementById('act-id').value,
        title: document.getElementById('act-title').value,
        type_id: document.getElementById('act-type').value,
        assignee: document.getElementById('act-assignee').value,
        start_date: document.getElementById('act-start').value,
        end_date: document.getElementById('act-end').value,
        progress: document.getElementById('act-progress').value,
        status: document.getElementById('act-status').value,
        result: document.getElementById('act-result').value
    };

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
    const res = await callAPI('saveActivity', payload);
    if(res.status === 'success') {
        closeModal('activity');
        await initApp(); // รีโหลดข้อมูลใหม่
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
    }
});

// --- Table Rendering ---
function renderActivityTable() {
    const container = document.getElementById('activityTableContainer');
    let html = `
        <div class="flex justify-between mb-4">
            <input type="text" placeholder="ค้นหากิจกรรม..." onkeyup="filterTable(this)" class="border p-2 rounded-lg w-64">
            <button onclick="openModal('activity')" class="bg-blue-600 text-white px-4 py-2 rounded-lg id-action-btn"><i class="fas fa-plus mr-1"></i> เพิ่มกิจกรรม</button>
        </div>
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-gray-100">
                    <th class="p-3 border-b">กิจกรรม</th>
                    <th class="p-3 border-b">ประเภท</th>
                    <th class="p-3 border-b text-center">ความก้าวหน้า</th>
                    <th class="p-3 border-b">ผู้รับผิดชอบ</th>
                    <th class="p-3 border-b">ดำเนินการ</th>
                </tr>
            </thead>
            <tbody>
    `;

    appState.activities.forEach(act => {
        const type = appState.types.find(t => t.id == act.type_id);
        html += `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-3 font-medium">${act.title}</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-xs text-white" style="background:${type?.color}">${type?.name}</span></td>
                <td class="p-3">
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full" style="width: ${act.progress}%"></div>
                    </div>
                    <p class="text-[10px] text-center mt-1">${act.progress}%</p>
                </td>
                <td class="p-3 text-sm">${act.assignee}</td>
                <td class="p-3">
                    <div class="flex gap-2">
                        <button onclick="openModal('activity', '${act.id}')" class="text-blue-500 hover:text-blue-700"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteActivity('${act.id}')" class="text-red-500 hover:text-red-700 id-action-btn"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

// ฟังก์ชันลบกิจกรรม
async function deleteActivity(id) {
    const confirm = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: "ข้อมูลกิจกรรมจะหายไปอย่างถาวร!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if(confirm.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        const res = await callAPI('deleteActivity', { id: id });
        if(res.status === 'success') {
            await initApp();
            Swal.fire('ลบแล้ว!', 'ข้อมูลถูกลบเรียบร้อย', 'success');
        }
    }
}
