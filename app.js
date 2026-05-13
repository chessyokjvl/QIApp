// โหลด Library Google Charts สำหรับ Gantt Chart (สำรอง)
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

// เก็บ Instance ของ Kanban Board
let kanbanSortables = [];

// ==========================================
// ตัวแก้บั๊ก Timezone ของ Google Sheet
// ==========================================
function fixTimezoneDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.length === 10) return dateStr; 
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
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
    appState.user = { id: 'guest', username: 'guest', name: 'ผู้เข้าชมทั่วไป', role: 'Guest', profile_img: '' }; 
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
    
    document.getElementById('userNameDisplay').innerText = appState.user.name;
    document.getElementById('userRoleDisplay').innerText = appState.user.role;
    if(appState.user.profile_img) {
        document.getElementById('userAvatar').src = appState.user.profile_img;
    }

    const isAdmin = appState.user.role === 'Admin';
    document.getElementById('adminMenu').style.display = isAdmin ? 'block' : 'none';
    
    document.querySelectorAll('.id-action-btn').forEach(btn => {
        btn.style.display = appState.user.role === 'Guest' ? 'none' : 'inline-flex';
    });

    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const data = await callAPI('getData');
    
    if (data.status === 'success') {
        appState.activities = (data.activities || []).map(a => {
            a.start_date = fixTimezoneDate(a.start_date);
            a.end_date = fixTimezoneDate(a.end_date);
            a.deadline = fixTimezoneDate(a.deadline);
            // Default status to Todo if empty
            if (!a.status) a.status = 'Todo'; 
            return a;
        });
        appState.users = data.users || [];
        appState.types = data.types || [];
        
        setupGanttConfig(); 
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
    if (page === 'kanban') renderKanban(); // เพิ่มหน้า Kanban
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
// Render: Kanban Board
// ==========================================
function renderKanban() {
    const select = document.getElementById('kanban-parent-select');
    const board = document.getElementById('kanban-board');
    
    // ดึงเฉพาะกิจกรรมที่ไม่มี parent_id (เป็นหมวดหลัก) มาให้เลือก
    const mainActivities = appState.activities.filter(a => !a.parent_id);
    
    select.innerHTML = '<option value="">-- กรุณาเลือกกิจกรรมหลัก --</option>' + 
        mainActivities.map(a => `<option value="${a.id}">${a.title}</option>`).join('');
        
    board.classList.add('hidden');
}

function loadKanbanBoard(parentId) {
    const board = document.getElementById('kanban-board');
    if (!parentId) {
        board.classList.add('hidden');
        return;
    }
    board.classList.remove('hidden');

    // ล้างข้อมูลในบอร์ดเก่าทิ้ง
    ['Todo', 'Ongoing', 'Done'].forEach(s => {
        document.getElementById(`kb-${s}`).innerHTML = '';
        document.getElementById(`kb-count-${s}`).innerText = '0';
    });

    // ค้นหางานย่อยทั้งหมดที่อยู่ภายใต้ Parent ID นี้
    const subTasks = appState.activities.filter(a => a.parent_id === parentId);
    let counts = { Todo: 0, Ongoing: 0, Done: 0 };

    subTasks.forEach(task => {
        // จัดกลุ่มตาม Status (ถ้าไม่มีให้ตกหล่นไป Todo)
        let status = ['Todo', 'Ongoing', 'Done'].includes(task.status) ? task.status : 'Todo';
        counts[status]++;
        
        const card = document.createElement('div');
        card.className = "bg-white p-3 rounded-lg shadow-sm border border-gray-200 mb-3 cursor-grab border-l-4 hover:shadow-md transition group";
        card.style.borderLeftColor = appState.types.find(t => t.id == task.type_id)?.color || '#ccc';
        card.dataset.id = task.id;
        
        card.innerHTML = `
            <div class="font-medium text-sm text-gray-800 mb-2 leading-tight">${task.title}</div>
            <div class="flex justify-between items-center text-[10px] text-gray-500">
                <span class="bg-gray-100 px-2 py-1 rounded truncate max-w-[120px]"><i class="fas fa-user mr-1 text-gray-400"></i>${task.assignee || 'ยังไม่ระบุ'}</span>
                <span class="font-semibold ${task.progress == 100 ? 'text-green-600' : 'text-blue-600'}">${task.progress || 0}%</span>
            </div>
        `;
        
        // ดับเบิ้ลคลิกการ์ดเพื่อเปิดดูรายละเอียด/แก้ไขได้ทันที
        card.ondblclick = () => openModalActivity(task.id);
        
        document.getElementById(`kb-${status}`).appendChild(card);
    });

    // อัปเดตตัวเลขจำนวนงานบนหัวตาราง
    ['Todo', 'Ongoing', 'Done'].forEach(s => document.getElementById(`kb-count-${s}`).innerText = counts[s]);

    // เปิดใช้งาน SortableJS (Drag & Drop)
    if (kanbanSortables.length) {
        kanbanSortables.forEach(s => s.destroy());
        kanbanSortables = [];
    }

    const isGuest = appState.user.role === 'Guest';

    ['Todo', 'Ongoing', 'Done'].forEach(status => {
        const el = document.getElementById(`kb-${status}`);
        const sortable = new Sortable(el, {
            group: 'kanban', // ลากข้ามคอลัมน์ในกลุ่มเดียวกันได้
            animation: 150,
            ghostClass: 'sortable-ghost',
            disabled: isGuest, // ป้องกันไม่ให้ Guest ลากเล่น
            onEnd: async function (evt) {
                const itemEl = evt.item;
                const newStatus = evt.to.dataset.status;
                const oldStatus = evt.from.dataset.status;
                
                if (newStatus !== oldStatus) {
                    const taskId = itemEl.dataset.id;
                    const taskIndex = appState.activities.findIndex(a => a.id === taskId);
                    
                    if(taskIndex > -1) {
                        appState.activities[taskIndex].status = newStatus;
                        // UX: ถ้าลากไป Done ให้ความก้าวหน้าเป็น 100% เลย
                        if (newStatus === 'Done') appState.activities[taskIndex].progress = 100;
                    }
                    
                    // ปรับเปลี่ยนตัวเลขใน UI ทันทีไม่ต้องรอโหลด
                    document.getElementById(`kb-count-${newStatus}`).innerText = parseInt(document.getElementById(`kb-count-${newStatus}`).innerText) + 1;
                    document.getElementById(`kb-count-${oldStatus}`).innerText = parseInt(document.getElementById(`kb-count-${oldStatus}`).innerText) - 1;
                    
                    // บันทึกสถานะใหม่ลง Google Sheet เบื้องหลัง (Background Sync)
                    await updateKanbanStatusBackend(taskId, newStatus);
                    
                    // วาดการ์ดใหม่เพื่อสะท้อนค่า Progress (ถ้าลากไป Done)
                    loadKanbanBoard(parentId);
                }
            }
        });
        kanbanSortables.push(sortable);
    });
}

// ฟังก์ชันบันทึกข้อมูลแบบไม่หน่วงหน้าจอ
async function updateKanbanStatusBackend(taskId, newStatus) {
    const task = appState.activities.find(a => a.id === taskId);
    if(!task) return;
    
    // แสดง Toast เล็กๆ แจ้งเตือนมุมขวาบน
    const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    Toast.fire({ icon: 'info', title: 'กำลังอัปเดตสถานะ...' });
    
    const payload = { ...task }; // คัดลอกข้อมูลทั้งหมดส่งไปเซฟทับบรรทัดเดิม
    const res = await callAPI('saveActivity', payload);
    
    if(res.status === 'success') {
        Toast.fire({ icon: 'success', title: 'ย้ายสถานะสำเร็จ' });
    } else {
        Toast.fire({ icon: 'error', title: 'การเชื่อมต่อขัดข้อง' });
    }
}

// ==========================================
// Render: ตารางกิจกรรม
// ==========================================
function renderActivityTable(filterDeadline = false) {
    const isGuest = appState.user.role === 'Guest';
    let html = `
        <div class="flex flex-col md:flex-row justify-between mb-4 gap-2">
            <input type="text" placeholder="ค้นหา..." onkeyup="filterTable(this, 'act-row')" class="border p-2 rounded-lg w-full md:w-64 outline-none">
            <button onclick="openModalActivity(null)" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow id-action-btn" style="display: ${isGuest ? 'none' : 'inline-block'}">
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
        const parentPrefix = act.parent_id ? '<span class="text-gray-400 mr-2">└─</span>' : '';
        html += `
            <tr class="border-b hover:bg-gray-50 act-row">
                <td class="p-3 font-medium text-gray-800">${parentPrefix}${act.title}</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-white text-xs" style="background:${type?.color||'#9ca3af'}">${type?.name||'-'}</span></td>
                <td class="p-3">
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full" style="width: ${act.progress||0}%"></div>
                    </div>
                    <p class="text-[10px] text-center mt-1 text-gray-500">${act.progress||0}%</p>
                </td>
                <td class="p-3 text-gray-600">${act.assignee||'-'}</td>
                <td class="p-3">
                    <button onclick="openModalActivity('${act.id}')" class="text-blue-500 hover:bg-blue-100 bg-blue-50 px-2 py-1 rounded transition mr-3"><i class="fas fa-search mr-1"></i> ดู/แก้ไข</button>
                    ${!isGuest && (appState.user.role === 'Admin' || act.created_by === appState.user.username) ? `<button onclick="deleteRecord('deleteActivity','${act.id}')" class="text-red-500 hover:text-red-700 transition"><i class="fas fa-trash"></i></button>` : ''}
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
// DHTMLX Gantt Setup & Logic
// ==========================================
function setupGanttConfig() {
    gantt.config.date_format = "%Y-%m-%d";
    gantt.config.readonly = true; 
    gantt.config.columns = [
        {name:"text", label:"ชื่องาน", tree:true, width:'*'},
        {name:"start_date", label:"เริ่ม", align:"center", width:80},
        {name:"duration", label:"วัน", align:"center", width:40}
    ];
    
    gantt.attachEvent("onTaskDblClick", function(id, e){
        openModalActivity(id);
        return false;
    });
    
    gantt.init("gantt_here");
}

function renderGantt() {
    const tasks = { data: [], links: [] };
    
    appState.activities.forEach(a => {
        if(a.start_date) {
            let duration = 1;
            if(a.end_date || a.deadline) {
                const s = new Date(a.start_date);
                const e = new Date(a.end_date || a.deadline);
                const diffTime = Math.abs(e - s);
                duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            }
            
            tasks.data.push({
                id: a.id,
                text: a.title,
                start_date: a.start_date,
                duration: duration,
                progress: (a.progress || 0) / 100,
                parent: a.parent_id || 0,
                open: true, 
                color: appState.types.find(t=>t.id==a.type_id)?.color || '#3b82f6'
            });
        }
    });

    gantt.clearAll();
    gantt.parse(tasks);
    setGanttZoom('month'); 
}

function setGanttZoom(level) {
    switch(level) {
        case "week":
            gantt.config.scale_unit = "week"; gantt.config.step = 1; gantt.config.date_scale = "สัปดาห์ที่ %W";
            gantt.config.subscales = [{unit:"day", step:1, date:"%D, %d"}];
            break;
        case "month":
            gantt.config.scale_unit = "month"; gantt.config.step = 1; gantt.config.date_scale = "%F, %Y";
            gantt.config.subscales = [{unit:"week", step:1, date:"สัปดาห์ที่ %W"}];
            break;
        case "quarter":
            gantt.config.scale_unit = "year"; gantt.config.step = 1; gantt.config.date_scale = "%Y";
            gantt.config.subscales = [{unit:"month", step:3, date:"ไตรมาสถัดไป"}];
            break;
        case "year":
            gantt.config.scale_unit = "year"; gantt.config.step = 1; gantt.config.date_scale = "%Y";
            gantt.config.subscales = [{unit:"month", step:1, date:"%M"}];
            break;
    }
    gantt.render();
}

// ==========================================
// Render: Calendar
// ==========================================
function renderCalendar() {
    if (appState.calendarInstance) appState.calendarInstance.destroy();
    
    appState.calendarInstance = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: 'dayGridMonth', 
        locale: 'th',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        events: appState.activities.map(a => {
            let endDateStr = a.end_date || a.deadline;
            if (endDateStr) {
                let d = new Date(endDateStr);
                d.setDate(d.getDate() + 1);
                endDateStr = d.toISOString().split('T')[0];
            }
            return { id: a.id, title: a.title, start: a.start_date, end: endDateStr, color: appState.types.find(t=>t.id==a.type_id)?.color };
        }),
        eventClick: info => openModalActivity(info.event.id)
    });
    
    appState.calendarInstance.render();
}

// ==========================================
// Render: User & Type
// ==========================================
function renderUserTable() {
    let html = `
        <button onclick="openModal('user')" class="mb-4 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition"><i class="fas fa-user-plus"></i> เพิ่ม User</button>
        <table class="w-full text-sm text-left">
            <tr class="bg-gray-100"><th class="p-3 border-b">ชื่อ</th><th class="p-3 border-b">Username</th><th class="p-3 border-b">สิทธิ์</th><th class="p-3 border-b">จัดการ</th></tr>
    `;
    appState.users.forEach(u => {
        html += `<tr class="border-b hover:bg-gray-50"><td class="p-3">${u.name}</td><td class="p-3">${u.username}</td><td class="p-3">${u.role}</td><td class="p-3"><button onclick="openModal('user','${u.id}')" class="text-blue-500 mr-3"><i class="fas fa-edit"></i></button><button onclick="deleteRecord('deleteUser','${u.id}')" class="text-red-500"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    document.getElementById('userTableContainer').innerHTML = html + `</table>`;
}

function renderTypeTable() {
    let html = `
        <button onclick="openModal('type')" class="mb-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"><i class="fas fa-tags"></i> เพิ่มประเภท</button>
        <table class="w-full text-sm text-left">
            <tr class="bg-gray-100"><th class="p-3 border-b w-24 text-center">สี</th><th class="p-3 border-b">ชื่อประเภท</th><th class="p-3 border-b">จัดการ</th></tr>
    `;
    appState.types.forEach(t => {
        html += `<tr class="border-b hover:bg-gray-50"><td class="p-3 text-center"><span class="w-6 h-6 inline-block rounded shadow-sm border border-gray-200" style="background:${t.color}"></span></td><td class="p-3">${t.name}</td><td class="p-3"><button onclick="openModal('type','${t.id}')" class="text-blue-500 mr-3"><i class="fas fa-edit"></i></button><button onclick="deleteRecord('deleteType','${t.id}')" class="text-red-500"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    document.getElementById('typeTableContainer').innerHTML = html + `</table>`;
}

// ==========================================
// Modals Control
// ==========================================
function openModalActivity(id = null) {
    document.getElementById('modal-activity').classList.remove('hidden');
    const inputs = document.querySelectorAll('.act-input');
    const btnEdit = document.getElementById('btn-edit-act');
    const btnSave = document.getElementById('btn-save-act');
    
    document.getElementById('act-type').innerHTML = '<option value="">-- เลือกประเภท --</option>' + appState.types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    
    document.getElementById('act-parent').innerHTML = '<option value="">ไม่มี (เป็นกิจกรรมหลัก)</option>' + 
        appState.activities.filter(a => a.id !== id).map(a => `<option value="${a.id}">${a.title}</option>`).join('');

    if (id) {
        const item = appState.activities.find(x => x.id === id) || {};
        document.getElementById('modal-act-title').innerText = 'รายละเอียดกิจกรรม';
        
        ['id','title','type_id','assignee','progress','status','result','parent_id','created_by'].forEach(k => {
            const el = document.getElementById(`act-${k.replace('_', '-')}`);
            if(el) el.value = item[k] || (k==='progress' ? 0 : (k==='status' ? 'Todo' : ''));
        });
        document.getElementById('act-start').value = item.start_date || '';
        document.getElementById('act-end').value = item.end_date || item.deadline || '';

        inputs.forEach(el => el.disabled = true);
        btnSave.classList.add('hidden');

        if (appState.user.role === 'Admin' || item.created_by === appState.user.username) {
            btnEdit.classList.remove('hidden');
        } else {
            btnEdit.classList.add('hidden');
        }

    } else {
        document.getElementById('modal-act-title').innerText = 'เพิ่มกิจกรรมใหม่';
        document.getElementById('activityForm').reset();
        document.getElementById('act-id').value = '';
        document.getElementById('act-created-by').value = appState.user.username; 
        
        inputs.forEach(el => el.disabled = false);
        btnEdit.classList.add('hidden');
        btnSave.classList.remove('hidden');
    }
}

function enableEditMode() {
    document.getElementById('modal-act-title').innerText = 'แก้ไขกิจกรรม';
    document.querySelectorAll('.act-input').forEach(el => el.disabled = false);
    document.getElementById('btn-edit-act').classList.add('hidden');
    document.getElementById('btn-save-act').classList.remove('hidden');
}

function openModal(type, id = null) {
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    if (type === 'user') {
        const item = appState.users.find(x => x.id === id) || {};
        ['id','name','username','role','status'].forEach(k => document.getElementById(`u-${k==='username'?'user':k}`).value = item[k] || '');
        document.getElementById('u-pass').value = '';
    } else if (type === 'type') {
        const item = appState.types.find(x => x.id === id) || {};
        document.getElementById('t-id').value = item.id || ''; document.getElementById('t-name').value = item.name || ''; document.getElementById('t-color').value = item.color || '#3b82f6';
    }
}

function closeModal(type) { document.getElementById(`modal-${type}`).classList.add('hidden'); }

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
        result: document.getElementById('act-result').value,
        parent_id: document.getElementById('act-parent').value,
        created_by: document.getElementById('act-created-by').value
    }, 'activity'); 
});

document.getElementById('userForm').addEventListener('submit', async(e) => { 
    e.preventDefault(); 
    const p = { id: document.getElementById('u-id').value, name: document.getElementById('u-name').value, username: document.getElementById('u-user').value, role: document.getElementById('u-role').value, status: document.getElementById('u-status').value }; 
    const pass = document.getElementById('u-pass').value; if(pass) p.password = await hashPassword(pass); 
    if(!p.id && !pass) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาตั้งรหัสผ่านสำหรับ User ใหม่', 'error'); 
    saveData('saveUser', p, 'user'); 
});

document.getElementById('typeForm').addEventListener('submit', async(e) => { 
    e.preventDefault(); 
    saveData('saveType', { id: document.getElementById('t-id').value, name: document.getElementById('t-name').value, color: document.getElementById('t-color').value }, 'type'); 
});

document.getElementById('profileForm').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    if(appState.user.role === 'Guest') return; 
    const pass = document.getElementById('profPass').value; const img = document.getElementById('profImg').value; 
    let p = { id: appState.user.id }; if (img) p.profile_img = img; if (pass) p.new_password = await hashPassword(pass); 
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() }); 
    const res = await callAPI('updateProfile', p); 
    if(res.status === 'success') { Swal.fire('สำเร็จ', 'อัปเดตโปรไฟล์เรียบร้อย', 'success'); if(img) { appState.user.profile_img = img; document.getElementById('userAvatar').src = img; } document.getElementById('profPass').value = ''; } 
});

// ==========================================
// Central Data Helpers
// ==========================================
async function saveData(action, payload, modalType) {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const res = await callAPI(action, payload);
    
    if(res.status === 'success') {
        closeModal(modalType); 
        const data = await callAPI('getData');
        appState.activities = (data.activities||[]).map(a => {
            a.start_date = fixTimezoneDate(a.start_date); 
            a.end_date = fixTimezoneDate(a.end_date); 
            a.deadline = fixTimezoneDate(a.deadline);
            if (!a.status) a.status = 'Todo';
            return a;
        });
        appState.users = data.users||[]; appState.types = data.types||[];
        
        // ถ้าอยู่หน้า Kanban ให้ Refresh Board ปัจจุบันด้วย
        if(modalType === 'activity' && document.getElementById('page-kanban').classList.contains('hidden') === false) {
            const currentParentId = document.getElementById('kanban-parent-select').value;
            if(currentParentId) loadKanbanBoard(currentParentId);
        } else {
            nav(modalType === 'activity' ? 'activities' : modalType + 's'); 
        }
        
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อย', 'success');
    } else {
        Swal.fire('ข้อผิดพลาด', res.message, 'error');
    }
}

async function deleteRecord(action, id) {
    const confirm = await Swal.fire({ title: 'ยืนยันการลบข้อมูล?', text: 'ข้อมูลนี้จะหายไปอย่างถาวร!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#6b7280', confirmButtonText: 'ใช่, ลบเลย', cancelButtonText: 'ยกเลิก' });
    if(confirm.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        const res = await callAPI(action, {id});
        if(res.status === 'success') {
            const data = await callAPI('getData');
            appState.activities = (data.activities||[]).map(a => { a.start_date = fixTimezoneDate(a.start_date); a.end_date = fixTimezoneDate(a.end_date); return a; }); 
            appState.users = data.users||[]; appState.types = data.types||[];
            if(action === 'deleteActivity') nav('activities'); else if(action === 'deleteUser') nav('users'); else nav('types');
            Swal.fire('ลบแล้ว!', 'ข้อมูลถูกลบเรียบร้อย', 'success');
        }
    }
}
