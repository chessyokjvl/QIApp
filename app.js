const API_URL = "https://script.google.com/macros/s/AKfycbxsOV5e5N46UYeAg2et9Q2kQCeZF-PY6hfcKVv_-YUPCy2lDRjMNMj8PZxrX14ksi1zzw/exec";

let appState = { user: null, activities: [], users: [], types: [], calendarInstance: null, charts: {} };

async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function callAPI(action, payload = {}) {
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, payload }) });
        return await response.json();
    } catch (err) { return { status: 'error', message: 'Network error' }; }
}

// --- Auth ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    Swal.fire({ title: 'ตรวจสอบข้อมูล...', didOpen: () => Swal.showLoading() });
    const user = document.getElementById('loginUser').value;
    const pass = await hashPassword(document.getElementById('loginPass').value);
    const res = await callAPI('login', { username: user, password: pass });
    if (res.status === 'success') { appState.user = res.user; initApp(); } 
    else Swal.fire('ล้มเหลว', res.message, 'error');
});

function loginGuest() { appState.user = { id: 'guest', name: 'ผู้เข้าชมทั่วไป', role: 'Guest' }; initApp(); }

function logout() {
    appState.user = null; document.getElementById('loginForm').reset();
    document.getElementById('view-app').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
}

// --- Init & Nav ---
async function initApp() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    document.getElementById('userNameDisplay').innerText = appState.user.name;
    document.getElementById('userRoleDisplay').innerText = appState.user.role;
    
    const isAdmin = appState.user.role === 'Admin';
    document.getElementById('adminMenu').style.display = isAdmin ? 'block' : 'none';
    document.querySelectorAll('.id-action-btn').forEach(btn => btn.style.display = appState.user.role === 'Guest' ? 'none' : 'inline-block');

    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading() });
    const data = await callAPI('getData');
    if (data.status === 'success') {
        appState.activities = data.activities || [];
        appState.users = data.users || [];
        appState.types = data.types || [];
        Swal.close(); nav('dashboard'); 
    }
}

function nav(page) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('bg-blue-50', 'text-blue-700'));
    document.getElementById(`page-${page}`).classList.remove('hidden');
    const activeBtn = document.querySelector(`[onclick="nav('${page}')"]`);
    if(activeBtn) activeBtn.classList.add('bg-blue-50', 'text-blue-700');

    if (page === 'dashboard') renderDashboard();
    if (page === 'calendar') renderCalendar();
    if (page === 'activities') renderActivityTable();
    if (page === 'gantt') renderGantt();
    if (page === 'users') renderUserTable();
    if (page === 'types') renderTypeTable();
}

// --- Renders ---
function renderDashboard() {
    document.getElementById('kpi-total').innerText = appState.activities.length;
    document.getElementById('kpi-ongoing').innerText = appState.activities.filter(a => a.status === 'Ongoing').length;
    document.getElementById('kpi-done').innerText = appState.activities.filter(a => a.status === 'Done').length;
    
    const now = new Date(); const next7Days = new Date(now); next7Days.setDate(now.getDate() + 7);
    document.getElementById('kpi-deadline').innerText = appState.activities.filter(a => {
        if(!a.deadline && !a.end_date) return false;
        const dDate = new Date(a.deadline || a.end_date);
        return dDate >= now && dDate <= next7Days && a.status !== 'Done';
    }).length;

    const ctx = document.getElementById('chartType');
    if(appState.charts.type) appState.charts.type.destroy();
    const typeCount = appState.activities.reduce((acc, curr) => { acc[curr.type_id] = (acc[curr.type_id] || 0) + 1; return acc; }, {});
    appState.charts.type = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeCount).map(id => appState.types.find(t=>t.id==id)?.name || 'N/A'),
            datasets: [{ data: Object.values(typeCount), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }]
        }
    });
}

function renderActivityTable(filterDeadline = false) {
    const container = document.getElementById('activityTableContainer');
    let html = `
        <div class="flex mb-4 gap-2 id-action-btn" style="display: ${appState.user.role === 'Guest' ? 'none' : 'flex'}">
            <input type="text" placeholder="ค้นหา..." onkeyup="filterTable(this, 'act-row')" class="border p-2 rounded-lg flex-1">
            <button onclick="openModal('activity')" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow"><i class="fas fa-plus"></i> เพิ่มกิจกรรม</button>
        </div>
        <table class="w-full text-left border-collapse text-sm">
            <tr class="bg-gray-100"><th class="p-3 border-b">กิจกรรม</th><th class="p-3 border-b">ประเภท</th><th class="p-3 border-b">Progress</th><th class="p-3 border-b">รับผิดชอบ</th><th class="p-3 border-b id-action-btn">Action</th></tr>
    `;
    
    let list = appState.activities;
    if (filterDeadline) {
        const now = new Date(); const next7Days = new Date(now); next7Days.setDate(now.getDate() + 7);
        list = list.filter(a => { const d = new Date(a.deadline || a.end_date); return d >= now && d <= next7Days && a.status !== 'Done'; });
    }

    list.forEach(act => {
        const type = appState.types.find(t => t.id == act.type_id);
        html += `<tr class="border-b hover:bg-gray-50 act-row">
            <td class="p-3 font-medium">${act.title}</td>
            <td class="p-3"><span class="px-2 py-1 rounded text-white text-xs" style="background:${type?.color||'#888'}">${type?.name||'-'}</span></td>
            <td class="p-3">${act.progress||0}%</td>
            <td class="p-3">${act.assignee||'-'}</td>
            <td class="p-3 id-action-btn">
                <button onclick="openModal('activity','${act.id}')" class="text-blue-500 mr-2"><i class="fas fa-edit"></i></button>
                <button onclick="deleteRecord('deleteActivity','${act.id}')" class="text-red-500"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</table>`;
    if(appState.user.role === 'Guest') document.querySelectorAll('.id-action-btn').forEach(b => b.style.display = 'none');
}

function filterTableByDeadline() { nav('activities'); setTimeout(() => renderActivityTable(true), 100); }
function filterTable(input, rowClass) {
    const filter = input.value.toLowerCase();
    document.querySelectorAll('.' + rowClass).forEach(row => row.style.display = row.innerText.toLowerCase().includes(filter) ? '' : 'none');
}

function renderGantt() {
    const tasks = appState.activities.filter(a => a.start_date && (a.end_date || a.deadline)).map(a => ({
        id: a.id, name: a.title, start: a.start_date, end: a.end_date || a.deadline, progress: a.progress || 0
    }));
    const container = document.getElementById('gantt-target');
    if(tasks.length === 0) { container.innerHTML = '<p class="text-gray-500 text-center py-4">ต้องระบุวันที่เริ่มและสิ้นสุดกิจกรรม จึงจะแสดง Gantt Chart ได้</p>'; return; }
    container.innerHTML = '';
    new Gantt("#gantt-target", tasks, { view_mode: 'Month', date_format: 'YYYY-MM-DD' });
}

function renderCalendar() {
    if (appState.calendarInstance) appState.calendarInstance.destroy();
    appState.calendarInstance = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: 'dayGridMonth', locale: 'th',
        events: appState.activities.map(a => ({ id: a.id, title: a.title, start: a.start_date, end: a.end_date, color: appState.types.find(t=>t.id==a.type_id)?.color })),
        eventClick: info => openModal('activity', info.event.id)
    });
    appState.calendarInstance.render();
}

// Admin Tables
function renderUserTable() {
    let html = `<button onclick="openModal('user')" class="mb-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow"><i class="fas fa-user-plus"></i> เพิ่ม User</button><table class="w-full text-sm text-left"><tr class="bg-gray-100"><th class="p-2">Name</th><th class="p-2">Username</th><th class="p-2">Role</th><th class="p-2">Action</th></tr>`;
    appState.users.forEach(u => html += `<tr class="border-b"><td class="p-2">${u.name}</td><td class="p-2">${u.username}</td><td class="p-2">${u.role}</td><td class="p-2"><button onclick="openModal('user','${u.id}')" class="text-blue-500 mr-2"><i class="fas fa-edit"></i></button><button onclick="deleteRecord('deleteUser','${u.id}')" class="text-red-500"><i class="fas fa-trash"></i></button></td></tr>`);
    document.getElementById('userTableContainer').innerHTML = html + `</table>`;
}

function renderTypeTable() {
    let html = `<button onclick="openModal('type')" class="mb-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow"><i class="fas fa-tags"></i> เพิ่มประเภท</button><table class="w-full text-sm text-left"><tr class="bg-gray-100"><th class="p-2">สี</th><th class="p-2">ชื่อประเภท</th><th class="p-2">Action</th></tr>`;
    appState.types.forEach(t => html += `<tr class="border-b"><td class="p-2"><span class="w-6 h-6 inline-block rounded" style="background:${t.color}"></span></td><td class="p-2">${t.name}</td><td class="p-2"><button onclick="openModal('type','${t.id}')" class="text-blue-500 mr-2"><i class="fas fa-edit"></i></button><button onclick="deleteRecord('deleteType','${t.id}')" class="text-red-500"><i class="fas fa-trash"></i></button></td></tr>`);
    document.getElementById('typeTableContainer').innerHTML = html + `</table>`;
}

// --- Modals & CRUD Logic ---
function openModal(type, id = null) {
    if(appState.user.role === 'Guest') return;
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    if(type === 'activity') {
        document.getElementById('act-type').innerHTML = appState.types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        const item = appState.activities.find(x => x.id === id) || {};
        ['id','title','type_id','assignee','progress','status','result'].forEach(k => document.getElementById(`act-${k.split('_')[0]}`).value = item[k] || '');
        document.getElementById('act-start').value = item.start_date ? item.start_date.split('T')[0] : '';
        document.getElementById('act-end').value = (item.end_date || item.deadline) ? (item.end_date || item.deadline).split('T')[0] : '';
    } else if (type === 'user') {
        const item = appState.users.find(x => x.id === id) || {};
        document.getElementById('u-id').value = item.id || ''; document.getElementById('u-name').value = item.name || '';
        document.getElementById('u-user').value = item.username || ''; document.getElementById('u-role').value = item.role || 'User';
        document.getElementById('u-status').value = item.status || 'Active'; document.getElementById('u-pass').value = '';
        document.getElementById('lbl-u-pass').innerText = id ? 'Password (กรอกเมื่อต้องการเปลี่ยน)' : 'Password (ตั้งใหม่)';
    } else if (type === 'type') {
        const item = appState.types.find(x => x.id === id) || {};
        document.getElementById('t-id').value = item.id || ''; document.getElementById('t-name').value = item.name || '';
        document.getElementById('t-color').value = item.color || '#3b82f6';
    }
}
function closeModal(type) { document.getElementById(`modal-${type}`).classList.add('hidden'); }

// Forms Submit
document.getElementById('activityForm').addEventListener('submit', async(e) => {
    e.preventDefault();
    const p = { id: document.getElementById('act-id').value, title: document.getElementById('act-title').value, type_id: document.getElementById('act-type').value, assignee: document.getElementById('act-assignee').value, start_date: document.getElementById('act-start').value, end_date: document.getElementById('act-end').value, progress: document.getElementById('act-progress').value, status: document.getElementById('act-status').value, result: document.getElementById('act-result').value };
    saveData('saveActivity', p, 'activity');
});
document.getElementById('userForm').addEventListener('submit', async(e) => {
    e.preventDefault();
    const p = { id: document.getElementById('u-id').value, name: document.getElementById('u-name').value, username: document.getElementById('u-user').value, role: document.getElementById('u-role').value, status: document.getElementById('u-status').value };
    const pass = document.getElementById('u-pass').value; if(pass) p.password = await hashPassword(pass);
    if(!p.id && !pass) return Swal.fire('Error', 'กรุณาตั้งรหัสผ่านสำหรับ User ใหม่', 'error');
    saveData('saveUser', p, 'user');
});
document.getElementById('typeForm').addEventListener('submit', async(e) => {
    e.preventDefault();
    saveData('saveType', { id: document.getElementById('t-id').value, name: document.getElementById('t-name').value, color: document.getElementById('t-color').value }, 'type');
});

async function saveData(action, payload, modalType) {
    Swal.fire({ title: 'บันทึก...', didOpen: () => Swal.showLoading() });
    const res = await callAPI(action, payload);
    if(res.status === 'success') {
        closeModal(modalType); 
        const data = await callAPI('getData'); // ดึงข้อมูลใหม่
        appState.activities = data.activities||[]; appState.users = data.users||[]; appState.types = data.types||[];
        nav(modalType === 'activity' ? 'activities' : modalType + 's'); // รีเฟรชหน้า
        Swal.fire('สำเร็จ', '', 'success');
    }
}

async function deleteRecord(action, id) {
    if(await Swal.fire({ title: 'ยืนยันการลบ?', icon: 'warning', showCancelButton: true }).then(r => r.isConfirmed)) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        if((await callAPI(action, {id})).status === 'success') {
            const data = await callAPI('getData');
            appState.activities = data.activities||[]; appState.users = data.users||[]; appState.types = data.types||[];
            nav(action.replace('delete','').toLowerCase() + 's');
            if(action === 'deleteActivity') nav('activities');
            Swal.fire('ลบแล้ว!', '', 'success');
        }
    }
}
