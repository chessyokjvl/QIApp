// โหลด Library Google Charts สำหรับ Gantt Chart
google.charts.load('current', {'packages':['gantt']});

const API_URL = "https://script.google.com/macros/s/AKfycbxsOV5e5N46UYeAg2et9Q2kQCeZF-PY6hfcKVv_-YUPCy2lDRjMNMj8PZxrX14ksi1zzw/exec";

let appState = { 
    user: null, 
    activities: [], 
    users: [], 
    types: [], 
    calendarInstance: null, 
    charts: {} 
};

// ==========================================
// ตัวแก้บั๊ก Timezone ของ Google Sheet
// ==========================================
function fixTimezoneDate(dateStr) {
    if (!dateStr) return '';
    // ถ้าส่งมาเป็น YYYY-MM-DD อยู่แล้ว ให้คืนค่าเดิมเลยไม่ต้องแปลง
    if (dateStr.length === 10) return dateStr; 
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    
    // ชดเชยเวลาที่หายไปจากการแปลงของ Server กลับคืนมา
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}

// ==========================================
// ฟังก์ชัน Security & API
// ==========================================
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function callAPI(action, payload = {}) {
    try {
        const response = await fetch(API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action, payload }) 
        });
        return await response.json();
    } catch (err) { 
        console.error("API Error: ", err);
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' }; 
    }
}

// ==========================================
// Authentication (Login / Logout)
// ==========================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
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
    document.getElementById('view-app').classList.add('hidden'); 
    document.getElementById('view-login').classList.remove('hidden'); 
}

// ==========================================
// App Initialization
// ==========================================
async function initApp() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    
    // ตั้งค่า User Profile
    document.getElementById('userNameDisplay').innerText = appState.user.name;
    document.getElementById('userRoleDisplay').innerText = appState.user.role;
    if(appState.user.profile_img) {
        document.getElementById('userAvatar').src = appState.user.profile_img;
    }

    // จัดการสิทธิ์เมนู Admin / Guest
    const isAdmin = appState.user.role === 'Admin';
    document.getElementById('adminMenu').style.display = isAdmin ? 'block' : 'none';
    
    document.querySelectorAll('.id-action-btn').forEach(btn => {
        btn.style.display = appState.user.role === 'Guest' ? 'none' : 'inline-flex';
    });

    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const data = await callAPI('getData');
    
    if (data.status === 'success') {
        // ประยุกต์ใช้ Timezone Fix ทันทีที่โหลดข้อมูลเสร็จ
        appState.activities = (data.activities || []).map(a => {
            a.start_date = fixTimezoneDate(a.start_date);
            a.end_date = fixTimezoneDate(a.end_date);
            a.deadline = fixTimezoneDate(a.deadline);
            return a;
        });
        appState.users = data.users || [];
        appState.types = data.types || [];
        
        Swal.close(); 
        nav('dashboard'); 
    }
}

// ==========================================
// Navigation System
// ==========================================
function nav(page) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('bg-blue-50', 'text-blue-700'));
    
    document.getElementById(`page-${page}`).classList.remove('hidden');
    const activeBtn = document.querySelector(`[onclick="nav('${page}')"]`);
    if(activeBtn) {
        activeBtn.classList.add('bg-blue-50', 'text-blue-700');
    }

    if (page === 'dashboard') renderDashboard();
    if (page === 'calendar') renderCalendar();
    if (page === 'activities') renderActivityTable();
    if (page === 'gantt') renderGantt();
    if (page === 'users') renderUserTable();
    if (page === 'types') renderTypeTable();
}

// ==========================================
// Render: Dashboard
// ==========================================
function renderDashboard() {
    document.getElementById('kpi-total').innerText = appState.activities.length;
    document.getElementById('kpi-ongoing').innerText = appState.activities.filter(a => a.status === 'Ongoing').length;
    document.getElementById('kpi-done').innerText = appState.activities.filter(a => a.status === 'Done').length;
    
    const now = new Date(); 
    const next7Days = new Date(now); 
    next7Days.setDate(now.getDate() + 7);
    
    document.getElementById('kpi-deadline').innerText = appState.activities.filter(a => {
        if(!a.deadline && !a.end_date) return false;
        const dDate = new Date(a.deadline || a.end_date);
        return dDate >= now && dDate <= next7Days && a.status !== 'Done';
    }).length;

    const ctx = document.getElementById('chartType');
    if(appState.charts.type) appState.charts.type.destroy();
    
    const typeCount = appState.activities.reduce((acc, curr) => { 
        acc[curr.type_id] = (acc[curr.type_id] || 0) + 1; 
        return acc; 
    }, {});
    
    appState.charts.type = new Chart(ctx, { 
        type: 'doughnut', 
        data: { 
            labels: Object.keys(typeCount).map(id => appState.types.find(t=>t.id==id)?.name || 'ไม่ระบุ'), 
            datasets: [{ 
                data: Object.values(typeCount), 
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] 
            }] 
        } 
    });
}

// ==========================================
// Render: ตารางกิจกรรม
// ==========================================
function renderActivityTable(filterDeadline = false) {
    const isGuest = appState.user.role === 'Guest';
    let html = `
        <div class="flex flex-col md:flex-row justify-between mb-4 gap-2">
            <input type="text" placeholder="ค้นหา..." onkeyup="filterTable(this, 'act-row')" class="border p-2 rounded-lg w-full md:w-64 outline-none">
            <button onclick="openModal('activity')" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow id-action-btn" style="display: ${isGuest ? 'none' : 'inline-block'}">
                <i class="fas fa-plus"></i> เพิ่มกิจกรรม
            </button>
        </div>
        <table class="w-full text-left text-sm whitespace-nowrap">
            <tr class="bg-gray-100">
                <th class="p-3 border-b">กิจกรรม</th>
                <th class="p-3 border-b">ประเภท</th>
                <th class="p-3 border-b text-center">ความก้าวหน้า</th>
                <th class="p-3 border-b">ผู้รับผิดชอบ</th>
                <th class="p-3 border-b">จัดการ</th>
            </tr>
    `;
    
    let list = appState.activities;
    
    // ถ้ามาจากกด KPI Deadline ให้กรองข้อมูล
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

    list.forEach(act => {
        const type = appState.types.find(t => t.id == act.type_id);
        html += `
            <tr class="border-b hover:bg-gray-50 act-row">
                <td class="p-3">${act.title}</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-white text-xs" style="background:${type?.color||'#9ca3af'}">${type?.name||'-'}</span></td>
                <td class="p-3">
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full" style="width: ${act.progress||0}%"></div>
                    </div>
                    <p class="text-[10px] text-center mt-1">${act.progress||0}%</p>
                </td>
                <td class="p-3 text-gray-600">${act.assignee||'-'}</td>
                <td class="p-3">
                    <button onclick="openModal('activity','${act.id}')" class="text-blue-500 hover:text-blue-700 mr-3"><i class="fas ${isGuest?'fa-eye':'fa-edit'}"></i></button>
                    ${!isGuest ? `<button onclick="deleteRecord('deleteActivity','${act.id}')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `;
    });
    
    document.getElementById('activityTableContainer').innerHTML = html + `</table>`;
}

function filterTable(input, rowClass) { 
    const filterText = input.value.toLowerCase(); 
    document.querySelectorAll('.' + rowClass).forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(filterText) ? '' : 'none';
    });
}

function filterTableByDeadline() { 
    nav('activities'); 
    setTimeout(() => renderActivityTable(true), 100); 
}

// ==========================================
// Render: Google Charts Gantt 
// ==========================================
function renderGantt() {
    const container = document.getElementById('gantt-target');
    const tasks = appState.activities.filter(a => a.start_date && (a.end_date || a.deadline));
    
    if(tasks.length === 0) { 
        container.innerHTML = '<p class="text-gray-500 text-center py-8">ต้องมีข้อมูล "วันที่เริ่ม" และ "สิ้นสุด" จึงจะแสดง Gantt ได้</p>'; 
        return; 
    }

    // กำหนดความสูงตามจำนวนงาน ป้องกันการล้น
    container.style.height = (tasks.length * 42 + 50) + 'px';
    container.innerHTML = '';

    google.charts.setOnLoadCallback(() => {
        var data = new google.visualization.DataTable();
        data.addColumn('string', 'Task ID');
        data.addColumn('string', 'Task Name');
        data.addColumn('string', 'Resource'); // ใช้สำหรับชื่อประเภทกิจกรรม
        data.addColumn('date', 'Start Date');
        data.addColumn('date', 'End Date');
        data.addColumn('number', 'Duration');
        data.addColumn('number', 'Percent Complete');
        data.addColumn('string', 'Dependencies');

        tasks.forEach(t => {
            const typeName = appState.types.find(type => type.id == t.type_id)?.name || 'ทั่วไป';
            
            // แยก YYYY, MM, DD เพื่อสร้าง Date Object ให้ Google Chart แบบไม่เพี้ยน Timezone
            const [sY, sM, sD] = t.start_date.split('-');
            const eDateStr = t.end_date || t.deadline;
            const [eY, eM, eD] = eDateStr.split('-');

            data.addRow([
                t.id, 
                t.title, 
                typeName, 
                new Date(sY, sM - 1, sD), 
                new Date(eY, eM - 1, eD), 
                null, 
                parseInt(t.progress) || 0, 
                null
            ]);
        });

        var options = {
            gantt: { 
                trackHeight: 30,
                labelStyle: { fontName: 'Prompt', fontSize: 14 }
            }
        };

        var chart = new google.visualization.Gantt(container);
        chart.draw(data, options);
    });
}

// ==========================================
// Render: Calendar (แก้บั๊กวันขาด)
// ==========================================
function renderCalendar() {
    if (appState.calendarInstance) appState.calendarInstance.destroy();
    
    appState.calendarInstance = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: 'dayGridMonth', 
        locale: 'th',
        headerToolbar: { 
            left: 'prev,next today', 
            center: 'title', 
            right: 'dayGridMonth,timeGridWeek' 
        },
        events: appState.activities.map(a => {
            let endDateStr = a.end_date || a.deadline;
            
            // เพิ่ม +1 วันเพื่อให้ระบายสีคลุมเต็มวันสุดท้าย (ข้อจำกัดของ Library FullCalendar)
            if (endDateStr) {
                let d = new Date(endDateStr);
                d.setDate(d.getDate() + 1);
                endDateStr = d.toISOString().split('T')[0];
            }
            
            return { 
                id: a.id, 
                title: a.title, 
                start: a.start_date, 
                end: endDateStr, 
                color: appState.types.find(t=>t.id==a.type_id)?.color 
            };
        }),
        eventClick: info => openModal('activity', info.event.id)
    });
    
    appState.calendarInstance.render();
}

// ==========================================
// Render: User & Type (Admin)
// ==========================================
function renderUserTable() {
    let html = `
        <button onclick="openModal('user')" class="mb-4 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition"><i class="fas fa-user-plus"></i> เพิ่ม User</button>
        <table class="w-full text-sm text-left">
            <tr class="bg-gray-100">
                <th class="p-3 border-b">ชื่อ</th>
                <th class="p-3 border-b">Username</th>
                <th class="p-3 border-b">สิทธิ์</th>
                <th class="p-3 border-b">จัดการ</th>
            </tr>
    `;
    
    appState.users.forEach(u => {
        html += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3">${u.name}</td>
                <td class="p-3">${u.username}</td>
                <td class="p-3">${u.role}</td>
                <td class="p-3">
                    <button onclick="openModal('user','${u.id}')" class="text-blue-500 mr-3"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteRecord('deleteUser','${u.id}')" class="text-red-500"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
    
    document.getElementById('userTableContainer').innerHTML = html + `</table>`;
}

function renderTypeTable() {
    let html = `
        <button onclick="openModal('type')" class="mb-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"><i class="fas fa-tags"></i> เพิ่มประเภท</button>
        <table class="w-full text-sm text-left">
            <tr class="bg-gray-100">
                <th class="p-3 border-b w-24 text-center">สี</th>
                <th class="p-3 border-b">ชื่อประเภท</th>
                <th class="p-3 border-b">จัดการ</th>
            </tr>
    `;
    
    appState.types.forEach(t => {
        html += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 text-center"><span class="w-6 h-6 inline-block rounded shadow-sm border border-gray-200" style="background:${t.color}"></span></td>
                <td class="p-3">${t.name}</td>
                <td class="p-3">
                    <button onclick="openModal('type','${t.id}')" class="text-blue-500 mr-3"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteRecord('deleteType','${t.id}')" class="text-red-500"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
    
    document.getElementById('typeTableContainer').innerHTML = html + `</table>`;
}

// ==========================================
// Modals Control
// ==========================================
function openModal(type, id = null) {
    const isGuest = appState.user.role === 'Guest';
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    if(type === 'activity') {
        document.getElementById('act-type').innerHTML = '<option value="">-- เลือกประเภท --</option>' + appState.types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        const item = appState.activities.find(x => x.id === id) || {};
        
        document.getElementById('modal-act-title').innerText = id ? (isGuest ? 'รายละเอียดกิจกรรม' : 'แก้ไขข้อมูล') : 'เพิ่มกิจกรรม';
        
        ['id','title','type_id','assignee','progress','status','result'].forEach(k => {
            document.getElementById(`act-${k.split('_')[0]}`).value = item[k] || (k==='progress' ? 0 : '');
        });
        
        document.getElementById('act-start').value = item.start_date || '';
        document.getElementById('act-end').value = item.end_date || item.deadline || '';
        
        document.querySelectorAll('#activityForm input, #activityForm select, #activityForm textarea').forEach(el => el.disabled = isGuest);
    } 
    else if (type === 'user') {
        const item = appState.users.find(x => x.id === id) || {};
        ['id','name','username','role','status'].forEach(k => {
            document.getElementById(`u-${k==='username'?'user':k}`).value = item[k] || '';
        });
        document.getElementById('u-pass').value = '';
    } 
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
// Form Submissions
// ==========================================
document.getElementById('activityForm').addEventListener('submit', async(e) => { 
    e.preventDefault(); 
    if(appState.user.role === 'Guest') return;
    
    saveData('saveActivity', { 
        id: document.getElementById('act-id').value, 
        title: document.getElementById('act-title').value, 
        type_id: document.getElementById('act-type').value, 
        assignee: document.getElementById('act-assignee').value, 
        start_date: document.getElementById('act-start').value, 
        end_date: document.getElementById('act-end').value, 
        progress: document.getElementById('act-progress').value, 
        status: document.getElementById('act-status').value, 
        result: document.getElementById('act-result').value 
    }, 'activity'); 
});

document.getElementById('userForm').addEventListener('submit', async(e) => { 
    e.preventDefault(); 
    const p = { 
        id: document.getElementById('u-id').value, 
        name: document.getElementById('u-name').value, 
        username: document.getElementById('u-user').value, 
        role: document.getElementById('u-role').value, 
        status: document.getElementById('u-status').value 
    }; 
    
    const pass = document.getElementById('u-pass').value; 
    if(pass) p.password = await hashPassword(pass); 
    
    if(!p.id && !pass) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาตั้งรหัสผ่านสำหรับ User ใหม่', 'error'); 
    
    saveData('saveUser', p, 'user'); 
});

document.getElementById('typeForm').addEventListener('submit', async(e) => { 
    e.preventDefault(); 
    saveData('saveType', { 
        id: document.getElementById('t-id').value, 
        name: document.getElementById('t-name').value, 
        color: document.getElementById('t-color').value 
    }, 'type'); 
});

// ส่วนจัดการอัปเดต Profile ของตัวเอง (เปลี่ยนรูป/รหัส)
document.getElementById('profileForm').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    if(appState.user.role === 'Guest') return; 
    
    const pass = document.getElementById('profPass').value; 
    const img = document.getElementById('profImg').value; 
    
    let p = { id: appState.user.id }; 
    if (img) p.profile_img = img; 
    if (pass) p.new_password = await hashPassword(pass); 
    
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() }); 
    const res = await callAPI('updateProfile', p); 
    
    if(res.status === 'success') { 
        Swal.fire('สำเร็จ', 'อัปเดตโปรไฟล์เรียบร้อย', 'success'); 
        if(img) { 
            appState.user.profile_img = img; 
            document.getElementById('userAvatar').src = img; 
        } 
        document.getElementById('profPass').value = ''; 
    } 
});

// ==========================================
// Central Data Helpers (Save/Delete)
// ==========================================
async function saveData(action, payload, modalType) {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const res = await callAPI(action, payload);
    
    if(res.status === 'success') {
        closeModal(modalType); 
        
        const data = await callAPI('getData');
        
        // อย่าลืมแก้ Timezone ทุกครั้งที่ดึงข้อมูลใหม่
        appState.activities = (data.activities||[]).map(a => {
            a.start_date = fixTimezoneDate(a.start_date); 
            a.end_date = fixTimezoneDate(a.end_date); 
            a.deadline = fixTimezoneDate(a.deadline); 
            return a;
        });
        appState.users = data.users||[]; 
        appState.types = data.types||[];
        
        nav(modalType === 'activity' ? 'activities' : modalType + 's'); 
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อย', 'success');
    }
}

async function deleteRecord(action, id) {
    const confirm = await Swal.fire({ 
        title: 'ยืนยันการลบข้อมูล?', 
        text: 'ข้อมูลนี้จะหายไปอย่างถาวร!',
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if(confirm.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        
        const res = await callAPI(action, {id});
        
        if(res.status === 'success') {
            const data = await callAPI('getData');
            
            appState.activities = (data.activities||[]).map(a => {
                a.start_date = fixTimezoneDate(a.start_date); 
                a.end_date = fixTimezoneDate(a.end_date); 
                return a;
            }); 
            appState.users = data.users||[]; 
            appState.types = data.types||[];
            
            if(action === 'deleteActivity') nav('activities'); 
            else if(action === 'deleteUser') nav('users'); 
            else nav('types');
            
            Swal.fire('ลบแล้ว!', 'ข้อมูลถูกลบเรียบร้อย', 'success');
        }
    }
}
