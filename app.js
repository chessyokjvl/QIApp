// URL ของ Google Apps Script ที่ Deploy ไว้
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

// ==========================================
// 1. SECURITY & API
// ==========================================
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function callAPI(action, payload = {}) {
    try {
        const response = await fetch(API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action, payload }) 
        });
        return await response.json();
    } catch (err) { 
        console.error(err);
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' }; 
    }
}

// ==========================================
// 2. AUTHENTICATION (Login / Logout)
// ==========================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    Swal.fire({ title: 'กำลังตรวจสอบข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const user = document.getElementById('loginUser').value;
    const pass = await hashPassword(document.getElementById('loginPass').value);
    
    const res = await callAPI('login', { username: user, password: pass });
    
    if (res.status === 'success') { 
        appState.user = res.user; 
        initApp(); 
    } else {
        Swal.fire('เข้าสู่ระบบล้มเหลว', res.message, 'error');
    }
});

function loginGuest() { 
    appState.user = { id: 'guest', name: 'ผู้เข้าชมทั่วไป', role: 'Guest', profile_img: '' }; 
    initApp(); 
}

function logout() {
    appState.user = null; 
    document.getElementById('loginForm').reset();
    document.getElementById('view-app').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
}

// ==========================================
// 3. APP INITIALIZATION & NAVIGATION
// ==========================================
async function initApp() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    
    // แสดงข้อมูล User ใน Sidebar
    document.getElementById('userNameDisplay').innerText = appState.user.name;
    document.getElementById('userRoleDisplay').innerText = appState.user.role;
    if(appState.user.profile_img) {
        document.getElementById('userAvatar').src = appState.user.profile_img;
    }

    // จัดการสิทธิ์การมองเห็นเมนูและปุ่มต่างๆ
    const isAdmin = appState.user.role === 'Admin';
    const isGuest = appState.user.role === 'Guest';
    
    document.getElementById('adminMenu').style.display = isAdmin ? 'block' : 'none';
    document.querySelectorAll('.id-action-btn').forEach(btn => {
        btn.style.display = isGuest ? 'none' : 'inline-flex';
    });

    // โหลดข้อมูลจาก Google Sheets
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const data = await callAPI('getData');
    
    if (data.status === 'success') {
        appState.activities = data.activities || [];
        appState.users = data.users || [];
        appState.types = data.types || [];
        Swal.close(); 
        nav('dashboard'); 
    } else {
        Swal.fire('ข้อผิดพลาด', 'โหลดข้อมูลไม่สำเร็จ', 'error');
    }
}

function nav(page) {
    // ซ่อนทุกหน้า และลบไฮไลต์เมนู
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('bg-blue-50', 'text-blue-700'));
    
    // แสดงหน้าที่เลือก
    document.getElementById(`page-${page}`).classList.remove('hidden');
    const activeBtn = document.querySelector(`[onclick="nav('${page}')"]`);
    if(activeBtn) activeBtn.classList.add('bg-blue-50', 'text-blue-700');

    // เรียกฟังก์ชัน Render ประจำหน้า
    if (page === 'dashboard') renderDashboard();
    if (page === 'calendar') renderCalendar();
    if (page === 'activities') renderActivityTable();
    if (page === 'gantt') renderGantt();
    if (page === 'users') renderUserTable();
    if (page === 'types') renderTypeTable();
}

// ==========================================
// 4. RENDER FUNCTIONS (วาดหน้าจอต่างๆ)
// ==========================================
function renderDashboard() {
    // สรุปตัวเลข KPI
    document.getElementById('kpi-total').innerText = appState.activities.length;
    document.getElementById('kpi-ongoing').innerText = appState.activities.filter(a => a.status === 'Ongoing').length;
    document.getElementById('kpi-done').innerText = appState.activities.filter(a => a.status === 'Done').length;
    
    // คำนวณ Deadline ภายใน 7 วัน
    const now = new Date(); 
    const next7Days = new Date(now); 
    next7Days.setDate(now.getDate() + 7);
    
    const deadlineCount = appState.activities.filter(a => {
        if(!a.deadline && !a.end_date) return false;
        const dDate = new Date(a.deadline || a.end_date);
        return dDate >= now && dDate <= next7Days && a.status !== 'Done';
    }).length;
    document.getElementById('kpi-deadline').innerText = deadlineCount;

    // สร้างกราฟวงกลมแยกตามประเภท
    const ctx = document.getElementById('chartType');
    if(appState.charts.type) appState.charts.type.destroy();
    
    const typeCount = appState.activities.reduce((acc, curr) => { 
        acc[curr.type_id] = (acc[curr.type_id] || 0) + 1; 
        return acc; 
    }, {});
    
    appState.charts.type = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeCount).map(id => appState.types.find(t=>t.id==id)?.name || 'ไม่ระบุประเภท'),
            datasets: [{ 
                data: Object.values(typeCount), 
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e'] 
            }]
        },
        options: { plugins: { title: { display: true, text: 'สัดส่วนกิจกรรมตามประเภท' } } }
    });
}

function renderActivityTable(filterDeadline = false) {
    const container = document.getElementById('activityTableContainer');
    const isGuest = appState.user.role === 'Guest';
    
    let html = `
        <div class="flex flex-col md:flex-row justify-between mb-4 gap-2">
            <input type="text" placeholder="ค้นหากิจกรรม..." onkeyup="filterTable(this, 'act-row')" class="border p-2 rounded-lg w-full md:w-64 outline-none focus:border-blue-500">
            <button onclick="openModal('activity')" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow transition id-action-btn" style="display: ${isGuest ? 'none' : 'inline-block'}">
                <i class="fas fa-plus mr-1"></i> เพิ่มกิจกรรม
            </button>
        </div>
        <table class="w-full text-left border-collapse text-sm whitespace-nowrap">
            <thead>
                <tr class="bg-gray-100 text-gray-700">
                    <th class="p-3 border-b rounded-tl-lg">กิจกรรม</th>
                    <th class="p-3 border-b">ประเภท</th>
                    <th class="p-3 border-b text-center">ความก้าวหน้า</th>
                    <th class="p-3 border-b">ผู้รับผิดชอบ</th>
                    <th class="p-3 border-b rounded-tr-lg">ดำเนินการ</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    let list = appState.activities;
    
    // กรณีถูกกดมาจาก Clickable Dashboard (Deadline 7 วัน)
    if (filterDeadline) {
        const now = new Date(); 
        const next7Days = new Date(now); 
        next7Days.setDate(now.getDate() + 7);
        list = list.filter(a => { 
            if(!a.deadline && !a.end_date) return false;
            const d = new Date(a.deadline || a.end_date); 
            return d >= now && d <= next7Days && a.status !== 'Done'; 
        });
    }

    if(list.length === 0) {
        html += `<tr><td colspan="5" class="text-center p-6 text-gray-400">ไม่พบข้อมูล</td></tr>`;
    }

    list.forEach(act => {
        const type = appState.types.find(t => t.id == act.type_id);
        html += `
        <tr class="border-b hover:bg-gray-50 act-row transition">
            <td class="p-3 font-medium text-gray-800">${act.title}</td>
            <td class="p-3"><span class="px-2 py-1 rounded text-white text-xs" style="background:${type?.color||'#9ca3af'}">${type?.name||'-'}</span></td>
            <td class="p-3">
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-blue-600 h-2 rounded-full" style="width: ${act.progress || 0}%"></div>
                </div>
                <p class="text-[10px] text-center mt-1 text-gray-500">${act.progress || 0}%</p>
            </td>
            <td class="p-3 text-gray-600">${act.assignee||'-'}</td>
            <td class="p-3">
                <div class="flex gap-3">
                    <button onclick="openModal('activity','${act.id}')" class="text-blue-500 hover:text-blue-700 transition"><i class="fas ${isGuest ? 'fa-eye' : 'fa-edit'}"></i></button>
                    ${!isGuest ? `<button onclick="deleteRecord('deleteActivity','${act.id}')" class="text-red-500 hover:text-red-700 transition id-action-btn"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>`;
    });
    
    container.innerHTML = html + `</tbody></table>`;
}

// ฟังก์ชันกรองตารางเมื่อพิมพ์ค้นหา
function filterTable(input, rowClass) {
    const filter = input.value.toLowerCase();
    document.querySelectorAll('.' + rowClass).forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(filter) ? '' : 'none';
    });
}

// ฟังก์ชันถูกเรียกจาก Clickable Dashboard
function filterTableByDeadline() { 
    nav('activities'); 
    setTimeout(() => renderActivityTable(true), 100); 
}

function renderGantt() {
    // กรองเอาเฉพาะกิจกรรมที่มีวันที่เริ่มและสิ้นสุด
    const tasks = appState.activities
        .filter(a => a.start_date && (a.end_date || a.deadline))
        .map(a => ({
            id: a.id, 
            name: a.title, 
            start: a.start_date, 
            end: a.end_date || a.deadline, 
            progress: a.progress || 0
        }));
        
    const container = document.getElementById('gantt-target');
    
    if(tasks.length === 0) { 
        container.innerHTML = '<p class="text-gray-500 text-center py-8">ต้องระบุวันที่เริ่มและสิ้นสุดกิจกรรม จึงจะแสดง Gantt Chart ได้</p>'; 
        return; 
    }
    
    container.innerHTML = '';
    new Gantt("#gantt-target", tasks, { 
        view_mode: 'Month', 
        date_format: 'YYYY-MM-DD' 
    });
}

function renderCalendar() {
    if (appState.calendarInstance) appState.calendarInstance.destroy();
    
    appState.calendarInstance = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: 'dayGridMonth', 
        locale: 'th',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        events: appState.activities.map(a => ({ 
            id: a.id, 
            title: a.title, 
            start: a.start_date, 
            end: a.end_date || a.deadline, 
            color: appState.types.find(t=>t.id==a.type_id)?.color 
        })),
        eventClick: info => openModal('activity', info.event.id)
    });
    
    appState.calendarInstance.render();
}

function renderUserTable() {
    let html = `
        <button onclick="openModal('user')" class="mb-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow hover:bg-gray-900 transition"><i class="fas fa-user-plus mr-1"></i> เพิ่ม User ใหม่</button>
        <table class="w-full text-sm text-left border-collapse">
            <tr class="bg-gray-100"><th class="p-3 border-b">ชื่อ-นามสกุล</th><th class="p-3 border-b">Username</th><th class="p-3 border-b">สิทธิ์</th><th class="p-3 border-b">สถานะ</th><th class="p-3 border-b">จัดการ</th></tr>
    `;
    appState.users.forEach(u => {
        html += `<tr class="border-b hover:bg-gray-50">
            <td class="p-3">${u.name}</td>
            <td class="p-3">${u.username}</td>
            <td class="p-3"><span class="px-2 py-1 rounded text-xs ${u.role==='Admin'?'bg-red-100 text-red-700':'bg-blue-100 text-blue-700'}">${u.role}</span></td>
            <td class="p-3">${u.status === 'Active' ? '<span class="text-green-600"><i class="fas fa-circle text-[8px] mr-1"></i>ใช้งาน</span>' : '<span class="text-gray-400">ระงับ</span>'}</td>
            <td class="p-3">
                <button onclick="openModal('user','${u.id}')" class="text-blue-500 hover:text-blue-700 mr-3"><i class="fas fa-edit"></i></button>
                <button onclick="deleteRecord('deleteUser','${u.id}')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    document.getElementById('userTableContainer').innerHTML = html + `</table>`;
}

function renderTypeTable() {
    let html = `
        <button onclick="openModal('type')" class="mb-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 transition"><i class="fas fa-tags mr-1"></i> เพิ่มประเภทกิจกรรม</button>
        <table class="w-full text-sm text-left border-collapse">
            <tr class="bg-gray-100"><th class="p-3 border-b w-24 text-center">สีประจำหมวด</th><th class="p-3 border-b">ชื่อประเภท</th><th class="p-3 border-b">จัดการ</th></tr>
    `;
    appState.types.forEach(t => {
        html += `<tr class="border-b hover:bg-gray-50">
            <td class="p-3 text-center"><span class="w-6 h-6 inline-block rounded shadow-sm border border-gray-200" style="background:${t.color}"></span></td>
            <td class="p-3 font-medium">${t.name}</td>
            <td class="p-3">
                <button onclick="openModal('type','${t.id}')" class="text-blue-500 hover:text-blue-700 mr-3"><i class="fas fa-edit"></i></button>
                <button onclick="deleteRecord('deleteType','${t.id}')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    document.getElementById('typeTableContainer').innerHTML = html + `</table>`;
}

// ==========================================
// 5. MODALS & FORMS (การเปิดป๊อปอัป และดึงข้อมูลเก่ามาใส่ฟอร์ม)
// ==========================================
function openModal(type, id = null) {
    const isGuest = appState.user.role === 'Guest';
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    // สำหรับ Modal กิจกรรม
    if(type === 'activity') {
        const selectType = document.getElementById('act-type');
        selectType.innerHTML = '<option value="">-- เลือกประเภท --</option>' + appState.types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        
        const item = appState.activities.find(x => x.id === id) || {};
        
        // เซ็ตค่าลง Form
        document.getElementById('modal-act-title').innerText = id ? (isGuest ? 'รายละเอียดกิจกรรม' : 'แก้ไขข้อมูลกิจกรรม') : 'เพิ่มกิจกรรมใหม่';
        document.getElementById('act-id').value = item.id || '';
        document.getElementById('act-title').value = item.title || '';
        document.getElementById('act-type').value = item.type_id || '';
        document.getElementById('act-assignee').value = item.assignee || '';
        document.getElementById('act-progress').value = item.progress || 0;
        document.getElementById('act-status').value = item.status || 'Ongoing';
        document.getElementById('act-result').value = item.result || '';
        
        // ตัดเวลาออกให้เหลือแค่ Date (YYYY-MM-DD) สำหรับ Input type="date"
        document.getElementById('act-start').value = item.start_date ? item.start_date.split('T')[0] : '';
        document.getElementById('act-end').value = (item.end_date || item.deadline) ? (item.end_date || item.deadline).split('T')[0] : '';

        // ถ้าเป็น Guest ให้ Disable ช่องกรอกทั้งหมด
        document.querySelectorAll('#activityForm input, #activityForm select, #activityForm textarea').forEach(el => el.disabled = isGuest);
    } 
    // สำหรับ Modal User
    else if (type === 'user') {
        const item = appState.users.find(x => x.id === id) || {};
        document.getElementById('u-id').value = item.id || ''; 
        document.getElementById('u-name').value = item.name || '';
        document.getElementById('u-user').value = item.username || ''; 
        document.getElementById('u-role').value = item.role || 'User';
        document.getElementById('u-status').value = item.status || 'Active'; 
        document.getElementById('u-pass').value = '';
        document.getElementById('lbl-u-pass').innerText = id ? 'Password (กรอกเฉพาะเมื่อต้องการเปลี่ยนรหัส)' : 'Password (รหัสผ่านเริ่มต้น)';
    } 
    // สำหรับ Modal Type
    else if (type === 'type') {
        const item = appState.types.find(x => x.id === id) || {};
        document.getElementById('t-id').value = item.id || ''; 
        document.getElementById('t-name').value = item.name || '';
        document.getElementById('t-color').value = item.color || '#3b82f6';
    }
}

function closeModal(type) { 
    document.getElementById(`modal-${type}`).classList.add('hidden'); 
}

// ==========================================
// 6. SUBMIT DATA & CRUD LOGIC (บันทึกและลบข้อมูล)
// ==========================================

// 6.1 บันทึกกิจกรรม
document.getElementById('activityForm').addEventListener('submit', async(e) => {
    e.preventDefault();
    if(appState.user.role === 'Guest') return;
    
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
    saveData('saveActivity', payload, 'activity');
});

// 6.2 บันทึก User
document.getElementById('userForm').addEventListener('submit', async(e) => {
    e.preventDefault();
    
    const payload = { 
        id: document.getElementById('u-id').value, 
        name: document.getElementById('u-name').value, 
        username: document.getElementById('u-user').value, 
        role: document.getElementById('u-role').value, 
        status: document.getElementById('u-status').value 
    };
    
    const pass = document.getElementById('u-pass').value; 
    if(pass) {
        payload.password = await hashPassword(pass); // เข้ารหัสผ่านก่อนส่งไปเก็บ
    }
    
    if(!payload.id && !pass) {
        return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาตั้งรหัสผ่านสำหรับ User ใหม่', 'error');
    }
    
    saveData('saveUser', payload, 'user');
});

// 6.3 บันทึกประเภท
document.getElementById('typeForm').addEventListener('submit', async(e) => {
    e.preventDefault();
    const payload = { 
        id: document.getElementById('t-id').value, 
        name: document.getElementById('t-name').value, 
        color: document.getElementById('t-color').value 
    };
    saveData('saveType', payload, 'type');
});

// 6.4 อัปเดต Profile (ส่วนที่ตกหล่นไปในเวอร์ชันที่แล้ว)
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(appState.user.role === 'Guest') return Swal.fire('ไม่อนุญาต', 'Guest ไม่สามารถแก้ไขโปรไฟล์ได้', 'error');

    const pass = document.getElementById('profPass').value;
    const img = document.getElementById('profImg').value;
    
    let payload = { id: appState.user.id };
    if (img) payload.profile_img = img;
    if (pass) payload.new_password = await hashPassword(pass); 

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const res = await callAPI('updateProfile', payload);
    
    if(res.status === 'success') {
        Swal.fire('สำเร็จ', 'อัปเดตข้อมูลส่วนตัวเรียบร้อย', 'success');
        if(img) {
            appState.user.profile_img = img;
            document.getElementById('userAvatar').src = img;
        }
        document.getElementById('profPass').value = '';
    } else {
        Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
    }
});

// ฟังก์ชันกลางสำหรับส่งข้อมูลไปบันทึก
async function saveData(action, payload, modalType) {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const res = await callAPI(action, payload);
    
    if(res.status === 'success') {
        closeModal(modalType); 
        
        // ดึงข้อมูลใหม่จากฐานข้อมูลเพื่อความชัวร์
        const data = await callAPI('getData'); 
        appState.activities = data.activities || []; 
        appState.users = data.users || []; 
        appState.types = data.types || [];
        
        // รีเฟรชหน้าให้ตรงกับที่ทำรายการ
        nav(modalType === 'activity' ? 'activities' : modalType + 's'); 
        
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อย', 'success');
    } else {
        Swal.fire('ข้อผิดพลาด', res.message || 'ไม่สามารถบันทึกได้', 'error');
    }
}

// ฟังก์ชันกลางสำหรับส่งคำสั่งลบข้อมูล
async function deleteRecord(action, id) {
    const confirm = await Swal.fire({ 
        title: 'ยืนยันการลบ?', 
        text: 'ข้อมูลนี้จะหายไปอย่างถาวร',
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if(confirm.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const res = await callAPI(action, {id});
        
        if(res.status === 'success') {
            const data = await callAPI('getData');
            appState.activities = data.activities || []; 
            appState.users = data.users || []; 
            appState.types = data.types || [];
            
            // รีเฟรชหน้าให้ตรงกับที่ลบ
            if(action === 'deleteActivity') nav('activities');
            else if(action === 'deleteUser') nav('users');
            else if(action === 'deleteType') nav('types');
            
            Swal.fire('ลบแล้ว!', 'ข้อมูลถูกลบเรียบร้อย', 'success');
        } else {
            Swal.fire('ลบไม่สำเร็จ', res.message, 'error');
        }
    }
}
