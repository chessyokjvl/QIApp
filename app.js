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
        console.error(err);
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' };
    }
}

// --- Authentication ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;
    const hashedPass = await hashPassword(pass); // เข้ารหัสก่อนส่ง

    const res = await callAPI('login', { username: user, password: hashedPass });
    
    if (res.status === 'success') {
        appState.user = res.user;
        initApp();
    } else {
        Swal.fire('ล้มเหลว', res.message, 'error');
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

// --- App Initialization & Navigation ---
async function initApp() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    
    // อัปเดตข้อมูลผู้ใช้ใน Sidebar
    document.getElementById('userNameDisplay').innerText = appState.user.name;
    document.getElementById('userRoleDisplay').innerText = appState.user.role;
    if(appState.user.profile_img) document.getElementById('userAvatar').src = appState.user.profile_img;

    // จัดการสิทธิ์ Admin vs Guest
    const adminMenu = document.getElementById('adminMenu');
    const actionBtns = document.querySelectorAll('.id-action-btn'); 
    
    if (appState.user.role === 'Admin') {
        adminMenu.classList.remove('hidden');
        actionBtns.forEach(btn => btn.style.display = 'inline-block');
    } else if (appState.user.role === 'Guest') {
        adminMenu.classList.add('hidden');
        actionBtns.forEach(btn => btn.style.display = 'none'); 
    } else {
        adminMenu.classList.add('hidden');
        actionBtns.forEach(btn => btn.style.display = 'inline-block');
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
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้ โปรดตรวจสอบการตั้งค่า Sheet', 'error');
    }
}

function nav(page) {
    // ซ่อนทุกหน้า
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    
    // ลบไฮไลต์ปุ่มเมนู
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.classList.remove('bg-blue-50', 'text-blue-700');
    });

    // แสดงหน้าที่เลือก
    document.getElementById(`page-${page}`).classList.remove('hidden');
    
    // ไฮไลต์ปุ่มเมนูที่กำลัง active
    const activeBtn = document.querySelector(`[onclick="nav('${page}')"]`);
    if(activeBtn) activeBtn.classList.add('bg-blue-50', 'text-blue-700');

    // เรียกฟังก์ชันเรนเดอร์ข้อมูลเฉพาะหน้านั้นๆ
    if (page === 'dashboard') renderDashboard();
    if (page === 'calendar') renderCalendar();
    if (page === 'activities') renderActivityTable();
}

// --- Render Dashboard ---
function renderDashboard() {
    document.getElementById('kpi-total').innerText = appState.activities.length;
    document.getElementById('kpi-ongoing').innerText = appState.activities.filter(a => a.status === 'Ongoing').length;
    document.getElementById('kpi-done').innerText = appState.activities.filter(a => a.status === 'Done').length;
    
    // คำนวณกิจกรรมที่ใกล้หมดเวลา (ตัวอย่าง: ภายใน 7 วัน)
    const now = new Date();
    const next7Days = new Date(now);
    next7Days.setDate(next7Days.getDate() + 7);
    
    const deadlineCount = appState.activities.filter(a => {
        if(!a.deadline && !a.end_date) return false;
        const dDate = new Date(a.deadline || a.end_date);
        return dDate >= now && dDate <= next7Days && a.status !== 'Done';
    }).length;
    document.getElementById('kpi-deadline').innerText = deadlineCount;

    // กราฟสัดส่วนงาน
    const ctxType = document.getElementById('chartType');
    if(appState.charts.type) appState.charts.type.destroy();
    
    const typeCount = appState.activities.reduce((acc, curr) => {
        acc[curr.type_id] = (acc[curr.type_id] || 0) + 1;
        return acc;
    }, {});

    appState.charts.type = new Chart(ctxType, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeCount).map(id => appState.types.find(t=>t.id==id)?.name || 'ไม่มีประเภท'),
            datasets: [{ data: Object.values(typeCount), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }]
        },
        options: { plugins: { title: { display: true, text: 'สัดส่วนกิจกรรมตามประเภท' } } }
    });
}

// --- Render Activities Table ---
function renderActivityTable() {
    const container = document.getElementById('activityTableContainer');
    let html = `
        <div class="flex flex-col md:flex-row justify-between mb-4 gap-2">
            <input type="text" placeholder="ค้นหากิจกรรม..." onkeyup="filterTable(this)" class="border p-2 rounded-lg w-full md:w-64 outline-none focus:border-blue-500">
            <button onclick="openModal('activity')" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 id-action-btn shadow transition" style="display: ${appState.user.role === 'Guest' ? 'none' : 'inline-block'}">
                <i class="fas fa-plus mr-1"></i> เพิ่มกิจกรรม
            </button>
        </div>
        <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
                <tr class="bg-gray-100 text-gray-700 text-sm">
                    <th class="p-3 border-b rounded-tl-lg">กิจกรรม</th>
                    <th class="p-3 border-b">ประเภท</th>
                    <th class="p-3 border-b text-center">ความก้าวหน้า</th>
                    <th class="p-3 border-b">ผู้รับผิดชอบ</th>
                    <th class="p-3 border-b rounded-tr-lg">ดำเนินการ</th>
                </tr>
            </thead>
            <tbody id="activityTableBody">
    `;

    if(appState.activities.length === 0) {
        html += `<tr><td colspan="5" class="text-center p-6 text-gray-400">ยังไม่มีข้อมูลกิจกรรม</td></tr>`;
    }

    appState.activities.forEach(act => {
        const type = appState.types.find(t => t.id == act.type_id);
        const isGuest = appState.user.role === 'Guest';
        html += `
            <tr class="hover:bg-gray-50 border-b text-sm transition row-data">
                <td class="p-3 font-medium text-gray-800">${act.title}</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-xs text-white" style="background:${type?.color || '#9ca3af'}">${type?.name || '-'}</span></td>
                <td class="p-3">
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full" style="width: ${act.progress || 0}%"></div>
                    </div>
                    <p class="text-[10px] text-center mt-1 text-gray-500">${act.progress || 0}%</p>
                </td>
                <td class="p-3 text-gray-600">${act.assignee || '-'}</td>
                <td class="p-3">
                    <div class="flex gap-3">
                        <button onclick="openModal('activity', '${act.id}')" class="text-blue-500 hover:text-blue-700 transition" title="รายละเอียด/แก้ไข"><i class="fas ${isGuest ? 'fa-eye' : 'fa-edit'}"></i></button>
                        ${!isGuest ? `<button onclick="deleteActivity('${act.id}')" class="text-red-500 hover:text-red-700 transition" title="ลบ"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function filterTable(input) {
    const filter = input.value.toLowerCase();
    const rows = document.querySelectorAll('#activityTableBody .row-data');
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(filter) ? '' : 'none';
    });
}

// --- Modals & CRUD ---
function openModal(type, id = null) {
    const isGuest = appState.user.role === 'Guest';
    document.getElementById(`modal-${type}`).classList.remove('hidden');
    
    if (type === 'activity') {
        const selectType = document.getElementById('act-type');
        selectType.innerHTML = '<option value="">-- เลือกประเภท --</option>' + appState.types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        
        // ถ้าเป็นการดู/แก้ไข
        if (id) {
            const act = appState.activities.find(a => a.id === id);
            document.getElementById('modal-act-title').innerText = isGuest ? 'รายละเอียดกิจกรรม' : 'แก้ไขข้อมูลกิจกรรม';
            document.getElementById('act-id').value = act.id;
            document.getElementById('act-title').value = act.title || '';
            document.getElementById('act-type').value = act.type_id || '';
            document.getElementById('act-assignee').value = act.assignee || '';
            
            // Format Date for Input (YYYY-MM-DD)
            const formatDate = (dateStr) => {
                if(!dateStr) return '';
                const d = new Date(dateStr);
                return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
            };
            document.getElementById('act-start').value = formatDate(act.start_date);
            document.getElementById('act-end').value = formatDate(act.end_date || act.deadline);
            document.getElementById('act-progress').value = act.progress || 0;
            document.getElementById('act-status').value = act.status || 'Ongoing';
            document.getElementById('act-result').value = act.result || '';
        } else {
            // เพิ่มใหม่
            document.getElementById('activityForm').reset();
            document.getElementById('act-id').value = '';
            document.getElementById('modal-act-title').innerText = 'เพิ่มกิจกรรมใหม่';
        }

        // Disable input ถ้าเป็น Guest
        const formInputs = document.querySelectorAll('#activityForm input, #activityForm select, #activityForm textarea');
        formInputs.forEach(input => input.disabled = isGuest);
    }
}

function closeModal(type) {
    document.getElementById(`modal-${type}`).classList.add('hidden');
}

// Submit กิจกรรม
document.getElementById('activityForm').addEventListener('submit', async (e) => {
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

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const res = await callAPI('saveActivity', payload);
    
    if(res.status === 'success') {
        closeModal('activity');
        // รีเฟรชข้อมูลเบื้องหลัง
        const data = await callAPI('getData');
        appState.activities = data.activities || [];
        renderActivityTable(); // วาดตารางใหม่
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
    } else {
        Swal.fire('ข้อผิดพลาด', res.message || 'บันทึกไม่สำเร็จ', 'error');
    }
});

// ลบกิจกรรม
async function deleteActivity(id) {
    if(appState.user.role === 'Guest') return;

    const confirm = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: "ข้อมูลกิจกรรมจะหายไปอย่างถาวร!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if(confirm.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await callAPI('deleteActivity', { id: id });
        if(res.status === 'success') {
            appState.activities = appState.activities.filter(a => a.id !== id);
            renderActivityTable();
            Swal.fire('ลบแล้ว!', 'ข้อมูลถูกลบเรียบร้อย', 'success');
        } else {
            Swal.fire('ลบไม่สำเร็จ', res.message, 'error');
        }
    }
}

// --- Render Calendar ---
function renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (appState.calendarInstance) appState.calendarInstance.destroy();

    const events = appState.activities.map(a => ({
        id: a.id,
        title: a.title,
        start: a.start_date,
        end: a.end_date || a.deadline,
        color: appState.types.find(t => t.id == a.type_id)?.color || '#3b82f6'
    }));

    appState.calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'th',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        events: events,
        eventClick: function(info) {
            openModal('activity', info.event.id); // คลิกลงบนปฏิทินให้เปิด Modal กิจกรรม
        }
    });
    appState.calendarInstance.render();
}

// --- Profile Update ---
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(appState.user.role === 'Guest') return Swal.fire('ไม่อนุญาต', 'Guest ไม่สามารถแก้ไขโปรไฟล์ได้', 'error');

    const pass = document.getElementById('profPass').value;
    const img = document.getElementById('profImg').value;
    
    let payload = { id: appState.user.id };
    if (img) payload.profile_img = img;
    if (pass) payload.new_password = await hashPassword(pass); 

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
    const res = await callAPI('updateProfile', payload);
    
    if(res.status === 'success') {
        Swal.fire('สำเร็จ', res.message, 'success');
        if(img) {
            appState.user.profile_img = img;
            document.getElementById('userAvatar').src = img;
        }
        document.getElementById('profPass').value = '';
    } else {
        Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
    }
});
