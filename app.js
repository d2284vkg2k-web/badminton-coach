// 羽毛球教练工作台 - 主应用
const STORAGE_KEY = 'badminton_coach_data_v1';

// ===== 数据层 =====
const Store = {
  data: null,
  load() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { this.data = JSON.parse(saved); this.migrate(); return; }
      catch(e) { console.warn('数据解析失败，使用默认数据', e); }
    }
    this.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    this.migrate();
    this.save();
  },
  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  },
  migrate() {
    // 为旧课包补充 lessonDuration 字段
    this.data.students.forEach(s => {
      if (!s.packages) s.packages = [];
      s.packages.forEach(p => {
        if (p.lessonDuration === undefined) {
          // 根据课包名推断
          const name = (p.name || '').toLowerCase();
          if (name.includes('2') || p.name === '1对2' || p.name === '1v2') p.lessonDuration = 1.5;
          else p.lessonDuration = 1;
        }
        if (p.status === undefined) p.status = 'active';
      });
    });
    if (!this.data.lessons) this.data.lessons = [];
  },
  reset() {
    this.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    this.migrate();
    this.save();
  }
};

// ===== 工具函数 =====
const uid = () => 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = n => (n || 0).toLocaleString('zh-CN');
const fmtMoney = n => '¥' + fmt(Math.round(n || 0));

function calcDuration(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 10) / 10 / 60;
}

function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2200);
}

function showConfirm(title, body, onOk) {
  $('#confirmTitle').textContent = title;
  $('#confirmBody').innerHTML = body;
  $('#confirmMask').classList.add('show');
  const okBtn = $('#confirmOk');
  const cancelBtn = $('#confirmCancel');
  const close = () => $('#confirmMask').classList.remove('show');
  const okHandler = () => { close(); okBtn.onclick = null; cancelBtn.onclick = null; onOk(); };
  const cancelHandler = () => { close(); okBtn.onclick = null; cancelBtn.onclick = null; };
  okBtn.onclick = okHandler;
  cancelBtn.onclick = cancelHandler;
}

function openModal(title, bodyHtml, footerHtml) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalFooter').innerHTML = footerHtml || '<button class="btn" onclick="closeModal()">关闭</button>';
  $('#modalMask').classList.add('show');
}
function closeModal() { $('#modalMask').classList.remove('show'); }

// 课时消耗计算：实际时长 / 单节时长
function calcLessonConsume(duration, lessonDuration) {
  if (!lessonDuration || lessonDuration <= 0) lessonDuration = 1;
  return Math.round((duration / lessonDuration) * 10) / 10;
}

// 获取学生剩余课时
function getRemainingLessons(student) {
  return student.packages
    .filter(p => p.status === 'active')
    .reduce((sum, p) => sum + (p.totalLessons - p.usedLessons), 0);
}

// 课时类型识别
function normalizePkgType(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('2') || name === '1对2' || name === '1v2') return '1对2';
  if (name === '小班' || name.includes('小班')) return '小班';
  if (name === '自由定制' || name.includes('自由')) return '自由定制';
  return '1对1';
}

// ===== 视图渲染 =====
const App = {
  currentView: 'dashboard',
  init() {
    Store.load();
    $$('.nav-item').forEach(item => {
      item.onclick = () => this.switchView(item.dataset.view);
    });
    $('#quickAddStudentBtn').onclick = () => StudentForm.open();
    $('#quickAddLessonBtn').onclick = () => LessonForm.open();
    $('#modalClose').onclick = closeModal;
    $('#modalMask').onclick = e => { if (e.target.id === 'modalMask') closeModal(); };
    this.switchView('dashboard');
  },
  switchView(view) {
    this.currentView = view;
    $$('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
    const titles = { dashboard: '仪表盘', students: '学生管理', packages: '课包管理', lessons: '课程记录', stats: '数据统计', settings: '设置与备份' };
    $('#pageTitle').textContent = titles[view];
    this.render();
  },
  render() {
    const v = this.currentView;
    if (v === 'dashboard') Dashboard.render();
    else if (v === 'students') StudentsView.render();
    else if (v === 'packages') PackagesView.render();
    else if (v === 'lessons') LessonsView.render();
    else if (v === 'stats') StatsView.render();
    else if (v === 'settings') SettingsView.render();
  }
};

// ===== 仪表盘 =====
const Dashboard = {
  render() {
    const { students, lessons } = Store.data;
    const totalStudents = students.length;
    const totalLessons = lessons.length;
    const totalHours = lessons.reduce((s, l) => s + (l.duration || 0), 0);
    const totalIncome = lessons.reduce((s, l) => s + (l.amount || 0), 0);
    const totalCourtCost = lessons.reduce((s, l) => s + (l.courtCost || 0), 0);
    const netIncome = totalIncome - totalCourtCost;

    // 即将/近期课程（按日期排序）
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = lessons.filter(l => l.date >= today).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).slice(0, 5);
    const recent = lessons.filter(l => l.date < today).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime)).slice(0, 5);

    // 课时不足预警
    const lowStock = students.filter(s => {
      const r = getRemainingLessons(s);
      return r > 0 && r <= 3;
    });
    const outStock = students.filter(s => getRemainingLessons(s) <= 0);

    $('#content').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-info"><div class="stat-label">学生总数</div><div class="stat-value">${totalStudents}</div><div class="stat-sub">活跃课包 ${students.filter(s => s.packages.some(p => p.status === 'active')).length} 人</div></div></div>
        <div class="stat-card"><div class="stat-icon green">📅</div><div class="stat-info"><div class="stat-label">课程记录</div><div class="stat-value">${totalLessons}</div><div class="stat-sub">累计 ${totalHours.toFixed(1)} 小时</div></div></div>
        <div class="stat-card"><div class="stat-icon orange">💰</div><div class="stat-info"><div class="stat-label">课程收入</div><div class="stat-value">${fmtMoney(totalIncome)}</div><div class="stat-sub">净收入 ${fmtMoney(netIncome)}（扣场地费）</div></div></div>
        <div class="stat-card"><div class="stat-icon purple">🎫</div><div class="stat-info"><div class="stat-label">课时预警</div><div class="stat-value">${lowStock.length + outStock.length}</div><div class="stat-sub">不足3节 ${lowStock.length} · 已用完 ${outStock.length}</div></div></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
          <div class="card-title">📅 即将到来的课程 ${upcoming.length === 0 ? '' : `<span class="tag tag-blue">${upcoming.length}</span>`}</div>
          ${upcoming.length === 0 ? '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">暂无 upcoming 课程</div></div>' :
            `<div class="table-wrap"><table><thead><tr><th>日期</th><th>时间</th><th>学生</th><th>类型</th><th>时长</th></tr></thead><tbody>
              ${upcoming.map(l => `<tr><td>${l.date}</td><td>${l.startTime}-${l.endTime}</td><td>${l.studentName}</td><td><span class="tag ${l.type.includes('2') ? 'tag-purple' : 'tag-blue'}">${l.type}</span></td><td>${l.duration}h</td></tr>`).join('')}
            </tbody></table></div>`}
        </div>
        <div class="card">
          <div class="card-title">🕒 近期课程</div>
          ${recent.length === 0 ? '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">暂无记录</div></div>' :
            `<div class="table-wrap"><table><thead><tr><th>日期</th><th>学生</th><th>类型</th><th>时长</th><th>金额</th></tr></thead><tbody>
              ${recent.map(l => `<tr><td>${l.date}</td><td>${l.studentName}</td><td><span class="tag ${l.type.includes('2') ? 'tag-purple' : 'tag-blue'}">${l.type}</span></td><td>${l.duration}h</td><td>${fmtMoney(l.amount)}</td></tr>`).join('')}
            </tbody></table></div>`}
        </div>
      </div>

      ${lowStock.length > 0 || outStock.length > 0 ? `
      <div class="card">
        <div class="card-title">⚠️ 课时预警</div>
        <div class="table-wrap"><table><thead><tr><th>学生</th><th>剩余课时</th><th>状态</th><th>操作</th></tr></thead><tbody>
          ${outStock.map(s => `<tr><td>${s.name}</td><td class="lesson-hours"><span class="empty-h">0</span></td><td><span class="tag tag-red">已用完</span></td><td><button class="btn btn-sm btn-primary" onclick="StudentForm.open('${s.id}')">续费</button></td></tr>`).join('')}
          ${lowStock.map(s => { const r = getRemainingLessons(s); return `<tr><td>${s.name}</td><td class="lesson-hours"><span class="low">${r}</span></td><td><span class="tag tag-orange">不足</span></td><td><button class="btn btn-sm btn-primary" onclick="StudentForm.open('${s.id}')">续费</button></td></tr>`; }).join('')}
        </tbody></table></div>
      </div>` : ''}
    `;
  }
};

// ===== 学生管理 =====
let studentsFilter = { q: '', level: '' };
const StudentsView = {
  render() {
    const { students } = Store.data;
    let list = students.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (studentsFilter.q) list = list.filter(s => s.name.includes(studentsFilter.q) || (s.phone || '').includes(studentsFilter.q));
    if (studentsFilter.level) list = list.filter(s => s.level === studentsFilter.level);

    $('#content').innerHTML = `
      <div class="toolbar">
        <div class="search"><input placeholder="搜索学生姓名/电话" value="${studentsFilter.q}" oninput="StudentsView.onFilter('q', this.value)"></div>
        <select onchange="StudentsView.onFilter('level', this.value)">
          <option value="">全部等级</option>
          <option value="初级" ${studentsFilter.level === '初级' ? 'selected' : ''}>初级</option>
          <option value="中级" ${studentsFilter.level === '中级' ? 'selected' : ''}>中级</option>
          <option value="高级" ${studentsFilter.level === '高级' ? 'selected' : ''}>高级</option>
        </select>
        <button class="btn btn-primary" onclick="StudentForm.open()">+ 新增学生</button>
      </div>
      <div class="card" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead><tr><th>学生</th><th>性别</th><th>等级</th><th>加入日期</th><th>课包</th><th>剩余课时</th><th>操作</th></tr></thead>
            <tbody>
              ${list.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8">暂无数据</td></tr>' : list.map(s => {
                const remaining = getRemainingLessons(s);
                const remainClass = remaining <= 0 ? 'empty-h' : remaining <= 3 ? 'low' : 'remaining';
                return `<tr>
                  <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar" style="width:28px;height:28px;font-size:12px">${s.name[0]}</div>${s.name}</div></td>
                  <td>${s.gender || '-'}</td>
                  <td><span class="tag tag-gray">${s.level || '-'}</span></td>
                  <td>${s.joinDate || '-'}</td>
                  <td>${s.packages.length} 个</td>
                  <td class="lesson-hours"><span class="${remainClass}">${remaining}</span></td>
                  <td>
                    <button class="btn btn-sm" onclick="StudentDetail.open('${s.id}')">详情</button>
                    <button class="btn btn-sm" onclick="StudentForm.open('${s.id}')">编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="StudentsView.del('${s.id}')">删除</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },
  onFilter(k, v) { studentsFilter[k] = v; this.render(); },
  del(id) {
    const s = Store.data.students.find(x => x.id === id);
    showConfirm('删除学生', `确定删除 <b>${s.name}</b> 及其所有课程记录吗？此操作不可恢复。`, () => {
      Store.data.students = Store.data.students.filter(x => x.id !== id);
      Store.data.lessons = Store.data.lessons.filter(l => l.studentId !== id);
      Store.save();
      this.render();
      toast('已删除', 'success');
    });
  }
};

// 学生详情
const StudentDetail = {
  open(id) {
    const s = Store.data.students.find(x => x.id === id);
    if (!s) return;
    const lessons = Store.data.lessons.filter(l => l.studentId === id).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    const totalSpent = s.packages.reduce((sum, p) => sum + (p.price || 0), 0);
    const remaining = getRemainingLessons(s);

    const body = `
      <div class="detail-section">
        <h4>基本信息</h4>
        <div class="info-row"><div class="info-label">姓名</div><div class="info-value">${s.name}</div></div>
        <div class="info-row"><div class="info-label">性别</div><div class="info-value">${s.gender || '-'}</div></div>
        <div class="info-row"><div class="info-label">出生日期</div><div class="info-value">${s.birthDate || '-'}</div></div>
        <div class="info-row"><div class="info-label">等级</div><div class="info-value">${s.level || '-'}</div></div>
        <div class="info-row"><div class="info-label">电话</div><div class="info-value">${s.phone || '-'}</div></div>
        <div class="info-row"><div class="info-label">加入日期</div><div class="info-value">${s.joinDate || '-'}</div></div>
        <div class="info-row"><div class="info-label">备注</div><div class="info-value">${s.notes || '-'}</div></div>
      </div>
      <div class="detail-section">
        <h4>课包信息 <button class="btn btn-sm btn-primary" style="float:right" onclick="closeModal();StudentForm.addPackage('${s.id}')">+ 添加课包</button></h4>
        ${s.packages.length === 0 ? '<div class="empty-text">暂无课包</div>' : s.packages.map(p => {
          const r = p.totalLessons - p.usedLessons;
          const pct = p.totalLessons > 0 ? Math.min(100, Math.round(p.usedLessons / p.totalLessons * 100)) : 0;
          const pkgType = normalizePkgType(p.name);
          return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div><b>${p.name}</b> <span class="tag tag-blue">${pkgType}</span> <span class="tag tag-gray">${p.lessonDuration}h/节</span></div>
              <div>${fmtMoney(p.price)}</div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:6px">
              <span>已用 ${p.usedLessons} / ${p.totalLessons} 节 · 剩余 ${r}</span>
              <span>购买日 ${p.purchaseDate}</span>
            </div>
            <div class="progress"><div class="progress-bar ${r <= 0 ? 'danger' : r <= 2 ? 'warn' : ''}" style="width:${pct}%"></div></div>
            <div style="margin-top:8px;display:flex;gap:6px">
              <button class="btn btn-sm" onclick="closeModal();LessonForm.open(null,'${s.id}','${p.id}')">记一节课</button>
              <button class="btn btn-sm" onclick="StudentForm.editPackage('${s.id}','${p.id}')">编辑</button>
              <button class="btn btn-sm btn-danger" onclick="StudentForm.delPackage('${s.id}','${p.id}')">删除</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="detail-section">
        <h4>课程记录 (${lessons.length})</h4>
        ${lessons.length === 0 ? '<div class="empty-text">暂无课程记录</div>' : `<div class="table-wrap" style="max-height:300px;overflow-y:auto"><table><thead><tr><th>日期</th><th>时间</th><th>类型</th><th>时长</th><th>金额</th><th>场地费</th></tr></thead><tbody>
          ${lessons.map(l => `<tr><td>${l.date}</td><td>${l.startTime}-${l.endTime}</td><td><span class="tag ${l.type.includes('2') ? 'tag-purple' : 'tag-blue'}">${l.type}</span></td><td>${l.duration}h</td><td>${fmtMoney(l.amount)}</td><td>${fmtMoney(l.courtCost)}</td></tr>`).join('')}
        </tbody></table></div>`}
      </div>
    `;
    openModal(s.name + ' - 学生详情', body, `<button class="btn" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="closeModal();StudentForm.open('${s.id}')">编辑</button>`);
  }
};

// 学生表单
const StudentForm = {
  open(id) {
    const s = id ? Store.data.students.find(x => x.id === id) : null;
    const body = `
      <div class="form-grid">
        <div class="form-row"><label>姓名 <span class="required">*</span></label><input class="form-control" id="f_name" value="${s ? s.name : ''}"></div>
        <div class="form-row"><label>性别</label><select class="form-control" id="f_gender"><option value="男" ${s && s.gender === '男' ? 'selected' : ''}>男</option><option value="女" ${s && s.gender === '女' ? 'selected' : ''}>女</option></select></div>
        <div class="form-row"><label>出生日期</label><input type="date" class="form-control" id="f_birth" value="${s ? s.birthDate : ''}"></div>
        <div class="form-row"><label>加入日期</label><input type="date" class="form-control" id="f_join" value="${s ? s.joinDate : new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-row"><label>等级</label><select class="form-control" id="f_level"><option value="初级" ${!s || s.level === '初级' ? 'selected' : ''}>初级</option><option value="中级" ${s && s.level === '中级' ? 'selected' : ''}>中级</option><option value="高级" ${s && s.level === '高级' ? 'selected' : ''}>高级</option></select></div>
        <div class="form-row"><label>电话</label><input class="form-control" id="f_phone" value="${s ? s.phone : ''}"></div>
        <div class="form-row full"><label>备注</label><textarea class="form-control" id="f_notes" rows="2">${s ? s.notes : ''}</textarea></div>
      </div>
      ${s ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b>课包列表</b><button class="btn btn-sm btn-primary" onclick="StudentForm.addPackage('${s.id}', true)">+ 添加课包</button></div><div id="pkgList">${this.renderPkgList(s)}</div></div>` : '<div class="form-hint">保存学生后可为该学生添加课包</div>'}
    `;
    openModal(id ? '编辑学生' : '新增学生', body, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="StudentForm.save('${id || ''}')">保存</button>`);
  },
  renderPkgList(s) {
    if (s.packages.length === 0) return '<div class="empty-text">暂无课包</div>';
    return s.packages.map(p => {
      const pkgType = normalizePkgType(p.name);
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <div><b>${p.name}</b> <span class="tag tag-blue">${pkgType}</span> <span class="tag tag-gray">${p.lessonDuration}h/节</span><div style="font-size:12px;color:#64748b">${p.usedLessons}/${p.totalLessons}节 · ${fmtMoney(p.price)}</div></div>
        <div><button class="btn btn-sm" onclick="StudentForm.editPackage('${s.id}','${p.id}', true)">编辑</button><button class="btn btn-sm btn-danger" onclick="StudentForm.delPackage('${s.id}','${p.id}', true)">删除</button></div>
      </div>`;
    }).join('');
  },
  save(id) {
    const name = $('#f_name').value.trim();
    if (!name) { toast('请填写姓名', 'error'); return; }
    const data = {
      name, gender: $('#f_gender').value, birthDate: $('#f_birth').value,
      joinDate: $('#f_join').value, level: $('#f_level').value,
      phone: $('#f_phone').value, notes: $('#f_notes').value.trim()
    };
    if (id) {
      const s = Store.data.students.find(x => x.id === id);
      Object.assign(s, data);
    } else {
      Store.data.students.push({ ...data, id: uid(), packages: [], trainingPlans: [], createdAt: Date.now() });
    }
    Store.save();
    closeModal();
    App.render();
    toast(id ? '已更新' : '已添加', 'success');
  },
  // 课包表单
  addPackage(studentId, isInStudentForm) {
    const s = Store.data.students.find(x => x.id === studentId);
    openModal(`为 ${s.name} 添加课包`, this.packageFormHtml(), `
      <button class="btn" onclick="StudentForm.backToStudent('${studentId}', ${isInStudentForm})">返回</button>
      <button class="btn btn-primary" onclick="StudentForm.savePackage('${studentId}', null, ${isInStudentForm})">保存课包</button>
    `);
    this.bindPackageType();
  },
  editPackage(studentId, pkgId, isInStudentForm) {
    const s = Store.data.students.find(x => x.id === studentId);
    const p = s.packages.find(x => x.id === pkgId);
    openModal(`编辑课包 - ${p.name}`, this.packageFormHtml(p), `
      <button class="btn" onclick="StudentForm.backToStudent('${studentId}', ${isInStudentForm})">返回</button>
      <button class="btn btn-primary" onclick="StudentForm.savePackage('${studentId}', '${pkgId}', ${isInStudentForm})">保存</button>
    `);
    this.bindPackageType();
  },
  backToStudent(studentId, isInStudentForm) {
    if (isInStudentForm) this.open(studentId);
    else StudentDetail.open(studentId);
  },
  packageFormHtml(p) {
    p = p || {};
    const selType = p.name ? normalizePkgType(p.name) : '1对1';
    return `
      <div class="form-row">
        <label>课包类型 <span class="required">*</span></label>
        <div class="pkg-type-grid" id="pkgTypeGrid">
          ${Object.entries(PACKAGE_TYPES).map(([k, v]) => `
            <div class="pkg-type-card ${selType === k ? 'selected' : ''}" data-type="${k}" onclick="StudentForm.selectType('${k}')">
              <div class="pt-name">${v.label}</div>
              <div class="pt-desc">${v.desc}</div>
              <div class="pt-duration">${v.durationOptions.length ? '单节 ' + v.durationOptions.join('/') + ' 小时' : '自定义单节时长'}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="form-row" id="durationRow">
        <label>单节课时长（小时）<span class="required">*</span></label>
        <div id="durationBox"></div>
        <div class="form-hint" id="durationHint"></div>
      </div>
      <div class="form-grid">
        <div class="form-row"><label>课包名称 <span class="required">*</span></label><input class="form-control" id="p_name" value="${p.name || ''}" placeholder="如：1对1、8节课包"></div>
        <div class="form-row"><label>总课时数 <span class="required">*</span></label><input type="number" min="1" step="0.5" class="form-control" id="p_total" value="${p.totalLessons || ''}"></div>
        <div class="form-row"><label>价格（元）</label><input type="number" class="form-control" id="p_price" value="${p.price || ''}"></div>
        <div class="form-row"><label>购买日期</label><input type="date" class="form-control" id="p_date" value="${p.purchaseDate || new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-row"><label>已用课时</label><input type="number" min="0" step="0.5" class="form-control" id="p_used" value="${p.usedLessons !== undefined ? p.usedLessons : 0}"></div>
        <div class="form-row"><label>状态</label><select class="form-control" id="p_status"><option value="active" ${!p.status || p.status === 'active' ? 'selected' : ''}>使用中</option><option value="finished" ${p.status === 'finished' ? 'selected' : ''}>已结束</option></select></div>
      </div>
    `;
  },
  bindPackageType() { this.selectType($('#pkgTypeGrid .selected')?.dataset.type || '1对1'); },
  selectType(type) {
    $$('#pkgTypeGrid .pkg-type-card').forEach(c => c.classList.toggle('selected', c.dataset.type === type));
    const cfg = PACKAGE_TYPES[type];
    const box = $('#durationBox');
    const hint = $('#durationHint');
    if (type === '自由定制') {
      box.innerHTML = `<input type="number" min="0.5" step="0.5" class="form-control" id="p_duration" value="1" placeholder="如 1、1.5、2"><div class="form-hint">由客户决定，填写每节课的小时数</div>`;
      hint.textContent = '';
    } else if (cfg.durationOptions.length === 1) {
      box.innerHTML = `<input type="number" class="form-control" id="p_duration" value="${cfg.defaultDuration}" readonly><div class="form-hint">${cfg.label} 课程固定 ${cfg.defaultDuration} 小时/节</div>`;
      hint.textContent = '';
    } else {
      box.innerHTML = `<select class="form-control" id="p_duration">${cfg.durationOptions.map(d => `<option value="${d}">${d} 小时</option>`).join('')}</select>`;
      hint.textContent = '根据选择时长确定一节课的课时数';
    }
    // 自动填充名称
    const nameInput = $('#p_name');
    if (!nameInput.value) nameInput.value = cfg.label;
  },
  savePackage(studentId, pkgId, isInStudentForm) {
    const s = Store.data.students.find(x => x.id === studentId);
    const type = $('#pkgTypeGrid .selected').dataset.type;
    const name = $('#p_name').value.trim();
    const totalLessons = parseFloat($('#p_total').value);
    const lessonDuration = parseFloat($('#p_duration').value) || PACKAGE_TYPES[type].defaultDuration;
    if (!name) { toast('请填写课包名称', 'error'); return; }
    if (!totalLessons || totalLessons <= 0) { toast('请填写总课时数', 'error'); return; }
    const data = {
      name, type, totalLessons,
      price: parseFloat($('#p_price').value) || 0,
      purchaseDate: $('#p_date').value,
      usedLessons: parseFloat($('#p_used').value) || 0,
      status: $('#p_status').value,
      lessonDuration
    };
    if (pkgId) {
      const p = s.packages.find(x => x.id === pkgId);
      Object.assign(p, data);
    } else {
      s.packages.push({ id: uid(), ...data });
    }
    Store.save();
    toast(pkgId ? '课包已更新' : '课包已添加', 'success');
    this.backToStudent(studentId, isInStudentForm);
  },
  delPackage(studentId, pkgId, isInStudentForm) {
    const s = Store.data.students.find(x => x.id === studentId);
    const p = s.packages.find(x => x.id === pkgId);
    showConfirm('删除课包', `确定删除课包 <b>${p.name}</b> 吗？关联的课程记录将保留但不再扣减。`, () => {
      s.packages = s.packages.filter(x => x.id !== pkgId);
      Store.save();
      this.backToStudent(studentId, isInStudentForm);
      toast('已删除', 'success');
    });
  }
};

// ===== 课包管理视图 =====
let pkgFilter = { q: '', type: '' };
const PackagesView = {
  render() {
    const all = [];
    Store.data.students.forEach(s => s.packages.forEach(p => all.push({ ...p, studentName: s.name, studentId: s.id })));
    let list = all.sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
    if (pkgFilter.q) list = list.filter(p => p.name.includes(pkgFilter.q) || p.studentName.includes(pkgFilter.q));
    if (pkgFilter.type) list = list.filter(p => normalizePkgType(p.name) === pkgFilter.type);

    const totalRevenue = all.reduce((s, p) => s + (p.price || 0), 0);
    const totalLessons = all.reduce((s, p) => s + p.totalLessons, 0);
    const usedLessons = all.reduce((s, p) => s + p.usedLessons, 0);

    $('#content').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-icon blue">📦</div><div class="stat-info"><div class="stat-label">课包总数</div><div class="stat-value">${all.length}</div></div></div>
        <div class="stat-card"><div class="stat-icon green">🎫</div><div class="stat-info"><div class="stat-label">总课时</div><div class="stat-value">${totalLessons}</div><div class="stat-sub">已用 ${usedLessons} · 剩余 ${totalLessons - usedLessons}</div></div></div>
        <div class="stat-card"><div class="stat-icon orange">💰</div><div class="stat-info"><div class="stat-label">课包总金额</div><div class="stat-value">${fmtMoney(totalRevenue)}</div></div></div>
      </div>
      <div class="toolbar">
        <div class="search"><input placeholder="搜索课包/学生" value="${pkgFilter.q}" oninput="PackagesView.onFilter('q', this.value)"></div>
        <select onchange="PackagesView.onFilter('type', this.value)">
          <option value="">全部类型</option>
          ${Object.keys(PACKAGE_TYPES).map(t => `<option value="${t}" ${pkgFilter.type === t ? 'selected' : ''}>${PACKAGE_TYPES[t].label}</option>`).join('')}
        </select>
      </div>
      <div class="card" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr><th>学生</th><th>课包</th><th>类型</th><th>单节时长</th><th>已用/总课时</th><th>进度</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:30px;color:#94a3b8">暂无课包</td></tr>' : list.map(p => {
              const r = p.totalLessons - p.usedLessons;
              const pct = p.totalLessons > 0 ? Math.min(100, Math.round(p.usedLessons / p.totalLessons * 100)) : 0;
              const pkgType = normalizePkgType(p.name);
              return `<tr>
                <td>${p.studentName}</td>
                <td>${p.name}</td>
                <td><span class="tag ${pkgType === '1对2' ? 'tag-purple' : pkgType === '小班' ? 'tag-orange' : 'tag-blue'}">${pkgType}</span></td>
                <td>${p.lessonDuration}h</td>
                <td>${p.usedLessons}/${p.totalLessons}</td>
                <td><div class="progress"><div class="progress-bar ${r <= 0 ? 'danger' : r <= 2 ? 'warn' : ''}" style="width:${pct}%"></div></div></td>
                <td>${fmtMoney(p.price)}</td>
                <td>${p.status === 'active' ? '<span class="tag tag-green">使用中</span>' : '<span class="tag tag-gray">已结束</span>'}</td>
                <td>
                  <button class="btn btn-sm" onclick="closeModal();StudentForm.editPackage('${p.studentId}','${p.id}')">编辑</button>
                  <button class="btn btn-sm btn-primary" onclick="LessonForm.open(null,'${p.studentId}','${p.id}')">记课</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    `;
  },
  onFilter(k, v) { pkgFilter[k] = v; this.render(); }
};

// ===== 课程记录视图 =====
let lessonsFilter = { q: '', type: '', studentId: '' };
const LessonsView = {
  render() {
    let list = Store.data.lessons.slice().sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    if (lessonsFilter.q) list = list.filter(l => l.studentName.includes(lessonsFilter.q));
    if (lessonsFilter.type) list = list.filter(l => normalizePkgType(l.type) === lessonsFilter.type);
    if (lessonsFilter.studentId) list = list.filter(l => l.studentId === lessonsFilter.studentId);

    const totalHours = list.reduce((s, l) => s + (l.duration || 0), 0);
    const totalIncome = list.reduce((s, l) => s + (l.amount || 0), 0);
    const totalCourt = list.reduce((s, l) => s + (l.courtCost || 0), 0);

    $('#content').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-icon blue">📅</div><div class="stat-info"><div class="stat-label">课程数</div><div class="stat-value">${list.length}</div><div class="stat-sub">${totalHours.toFixed(1)} 小时</div></div></div>
        <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-info"><div class="stat-label">课程收入</div><div class="stat-value">${fmtMoney(totalIncome)}</div></div></div>
        <div class="stat-card"><div class="stat-icon orange">🏟️</div><div class="stat-info"><div class="stat-label">场地费</div><div class="stat-value">${fmtMoney(totalCourt)}</div><div class="stat-sub">净收入 ${fmtMoney(totalIncome - totalCourt)}</div></div></div>
      </div>
      <div class="toolbar">
        <div class="search"><input placeholder="搜索学生姓名" value="${lessonsFilter.q}" oninput="LessonsView.onFilter('q', this.value)"></div>
        <select onchange="LessonsView.onFilter('type', this.value)">
          <option value="">全部类型</option>
          ${Object.keys(PACKAGE_TYPES).map(t => `<option value="${t}" ${lessonsFilter.type === t ? 'selected' : ''}>${PACKAGE_TYPES[t].label}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="LessonForm.open()">+ 记一节课</button>
      </div>
      <div class="card" style="padding:0">
        <div class="table-wrap"><table>
          <thead><tr><th>日期</th><th>时间</th><th>学生</th><th>类型</th><th>时长</th><th>消耗课时</th><th>金额</th><th>场地费</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:30px;color:#94a3b8">暂无课程记录</td></tr>' : list.map(l => {
              const pkg = Store.data.students.find(s => s.id === l.studentId)?.packages.find(p => p.id === l.packageId);
              const consume = pkg ? calcLessonConsume(l.duration, pkg.lessonDuration) : l.duration;
              return `<tr>
                <td>${l.date}</td>
                <td>${l.startTime}-${l.endTime}</td>
                <td>${l.studentName}</td>
                <td><span class="tag ${l.type.includes('2') ? 'tag-purple' : 'tag-blue'}">${l.type}</span></td>
                <td>${l.duration}h</td>
                <td>${consume}</td>
                <td>${fmtMoney(l.amount)}</td>
                <td>${fmtMoney(l.courtCost)}</td>
                <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${l.notes || l.location || '-'}</td>
                <td><button class="btn btn-sm" onclick="LessonForm.open('${l.id}')">编辑</button><button class="btn btn-sm btn-danger" onclick="LessonsView.del('${l.id}')">删除</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    `;
  },
  onFilter(k, v) { lessonsFilter[k] = v; this.render(); },
  del(id) {
    const l = Store.data.lessons.find(x => x.id === id);
    showConfirm('删除课程', `确定删除 ${l.studentName} 在 ${l.date} 的课程记录吗？<br>删除后将自动恢复已扣减的课时。`, () => {
      // 恢复课时
      const s = Store.data.students.find(x => x.id === l.studentId);
      if (s) {
        const p = s.packages.find(x => x.id === l.packageId);
        if (p) {
          const consume = calcLessonConsume(l.duration, p.lessonDuration);
          p.usedLessons = Math.max(0, (p.usedLessons || 0) - consume);
        }
      }
      Store.data.lessons = Store.data.lessons.filter(x => x.id !== id);
      Store.save();
      this.render();
      toast('已删除并恢复课时', 'success');
    });
  }
};

// 课程表单
const LessonForm = {
  open(id, presetStudentId, presetPkgId) {
    const l = id ? Store.data.lessons.find(x => x.id === id) : null;
    const students = Store.data.students;
    const body = `
      <div class="form-grid">
        <div class="form-row full">
          <label>学生 <span class="required">*</span></label>
          <select class="form-control" id="l_student" onchange="LessonForm.onStudentChange()">
            <option value="">请选择学生</option>
            ${students.map(s => `<option value="${s.id}" ${(l ? l.studentId : presetStudentId) === s.id ? 'selected' : ''}>${s.name}（剩余 ${getRemainingLessons(s)}）</option>`).join('')}
          </select>
        </div>
        <div class="form-row full">
          <label>课包 <span class="required">*</span></label>
          <select class="form-control" id="l_package" onchange="LessonForm.onPackageChange()"></select>
          <div class="form-hint" id="pkgInfo"></div>
        </div>
        <div class="form-row"><label>日期 <span class="required">*</span></label><input type="date" class="form-control" id="l_date" value="${l ? l.date : new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-row"><label>类型</label><input class="form-control" id="l_type" value="${l ? l.type : ''}" readonly></div>
        <div class="form-row"><label>开始时间 <span class="required">*</span></label><input type="time" class="form-control" id="l_start" value="${l ? l.startTime : '09:00'}" onchange="LessonForm.calcDuration()"></div>
        <div class="form-row"><label>结束时间 <span class="required">*</span></label><input type="time" class="form-control" id="l_end" value="${l ? l.endTime : '10:00'}" onchange="LessonForm.calcDuration()"></div>
        <div class="form-row"><label>时长（小时）</label><input type="number" class="form-control" id="l_duration" value="${l ? l.duration : 1}" readonly></div>
        <div class="form-row"><label>消耗课时</label><input type="number" class="form-control" id="l_consume" value="${l ? l.duration : 1}" readonly></div>
        <div class="form-row"><label>课程金额（元）</label><input type="number" class="form-control" id="l_amount" value="${l ? l.amount : ''}"></div>
        <div class="form-row"><label>场地费（元）</label><input type="number" class="form-control" id="l_court" value="${l ? l.courtCost : 60}"></div>
        <div class="form-row full"><label>地点</label><input class="form-control" id="l_location" value="${l ? l.location : ''}"></div>
        <div class="form-row full"><label>备注</label><input class="form-control" id="l_notes" value="${l ? l.notes : ''}"></div>
      </div>
      <div class="form-hint" style="margin-top:8px">💡 课时消耗 = 实际时长 ÷ 单节时长。删除课程会自动恢复课时。</div>
    `;
    openModal(id ? '编辑课程' : '记一节课', body, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="LessonForm.save('${id || ''}')">保存</button>`);
    this.onStudentChange(presetPkgId);
    if (!id) this.calcDuration();
  },
  onStudentChange(presetPkgId) {
    const sid = $('#l_student').value;
    const pkgSel = $('#l_package');
    if (!sid) { pkgSel.innerHTML = '<option value="">请先选择学生</option>'; $('#pkgInfo').textContent = ''; return; }
    const s = Store.data.students.find(x => x.id === sid);
    const activePkgs = s.packages.filter(p => p.status === 'active');
    pkgSel.innerHTML = activePkgs.length ? activePkgs.map(p => `<option value="${p.id}" ${(presetPkgId) === p.id ? 'selected' : ''}>${p.name}（剩余 ${p.totalLessons - p.usedLessons}）</option>`).join('') : '<option value="">无可用课包</option>';
    this.onPackageChange();
  },
  onPackageChange() {
    const sid = $('#l_student').value;
    const pid = $('#l_package').value;
    if (!sid || !pid) return;
    const s = Store.data.students.find(x => x.id === sid);
    const p = s.packages.find(x => x.id === pid);
    $('#l_type').value = normalizePkgType(p.name);
    $('#pkgInfo').innerHTML = `单节时长 <b>${p.lessonDuration}h</b> · 单价约 ${fmtMoney(p.price / p.totalLessons)} / 课时`;
    this.calcDuration();
    // 自动填充金额
    if (!$('#l_amount').value) {
      $('#l_amount').value = Math.round((p.price / p.totalLessons) * calcLessonConsume(parseFloat($('#l_duration').value) || 1, p.lessonDuration));
    }
  },
  calcDuration() {
    const start = $('#l_start').value;
    const end = $('#l_end').value;
    if (!start || !end) return;
    const dur = calcDuration(start, end);
    $('#l_duration').value = dur;
    const sid = $('#l_student').value;
    const pid = $('#l_package').value;
    if (sid && pid) {
      const s = Store.data.students.find(x => x.id === sid);
      const p = s.packages.find(x => x.id === pid);
      const consume = calcLessonConsume(dur, p.lessonDuration);
      $('#l_consume').value = consume;
      if ($('#l_amount').value) {
        $('#l_amount').value = Math.round((p.price / p.totalLessons) * consume);
      }
    } else {
      $('#l_consume').value = dur;
    }
  },
  save(id) {
    const sid = $('#l_student').value;
    const pid = $('#l_package').value;
    if (!sid) { toast('请选择学生', 'error'); return; }
    if (!pid) { toast('请选择课包', 'error'); return; }
    const s = Store.data.students.find(x => x.id === sid);
    const p = s.packages.find(x => x.id === pid);
    const duration = parseFloat($('#l_duration').value) || 0;
    const consume = calcLessonConsume(duration, p.lessonDuration);
    const data = {
      studentId: sid, studentName: s.name,
      date: $('#l_date').value, startTime: $('#l_start').value, endTime: $('#l_end').value,
      duration, type: $('#l_type').value, packageId: pid,
      amount: parseFloat($('#l_amount').value) || 0,
      location: $('#l_location').value,
      courtCost: parseFloat($('#l_court').value) || 0,
      notes: $('#l_notes').value
    };
    if (id) {
      // 编辑：先恢复原课时再扣减新课时
      const old = Store.data.lessons.find(x => x.id === id);
      const oldPkg = s.packages.find(x => x.id === old.packageId);
      if (oldPkg) {
        const oldConsume = calcLessonConsume(old.duration, oldPkg.lessonDuration);
        oldPkg.usedLessons = Math.max(0, (oldPkg.usedLessons || 0) - oldConsume);
      }
      Object.assign(old, data);
      p.usedLessons = (p.usedLessons || 0) + consume;
    } else {
      Store.data.lessons.push({ id: uid(), createdAt: Date.now(), ...data });
      p.usedLessons = (p.usedLessons || 0) + consume;
    }
    // 课时用完自动标记
    if (p.totalLessons - p.usedLessons <= 0) p.status = 'finished';
    Store.save();
    closeModal();
    App.render();
    toast(id ? '课程已更新' : '已记录并扣减课时', 'success');
  }
};

// ===== 数据统计 =====
const StatsView = {
  render() {
    const { students, lessons } = Store.data;
    // 按学生统计
    const byStudent = students.map(s => {
      const sl = lessons.filter(l => l.studentId === s.id);
      return {
        name: s.name,
        count: sl.length,
        hours: sl.reduce((a, b) => a + (b.duration || 0), 0),
        income: sl.reduce((a, b) => a + (b.amount || 0), 0),
        court: sl.reduce((a, b) => a + (b.courtCost || 0), 0)
      };
    }).sort((a, b) => b.income - a.income);

    // 按月统计
    const byMonth = {};
    lessons.forEach(l => {
      const m = (l.date || '').slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { count: 0, hours: 0, income: 0, court: 0 };
      byMonth[m].count++;
      byMonth[m].hours += l.duration || 0;
      byMonth[m].income += l.amount || 0;
      byMonth[m].court += l.courtCost || 0;
    });
    const months = Object.keys(byMonth).sort();

    // 按类型统计
    const byType = {};
    lessons.forEach(l => {
      const t = normalizePkgType(l.type);
      if (!byType[t]) byType[t] = { count: 0, hours: 0, income: 0 };
      byType[t].count++;
      byType[t].hours += l.duration || 0;
      byType[t].income += l.amount || 0;
    });

    const maxStudentIncome = Math.max(...byStudent.map(s => s.income), 1);
    const maxMonthIncome = Math.max(...months.map(m => byMonth[m].income), 1);

    $('#content').innerHTML = `
      <div class="card">
        <div class="card-title">👤 学生收入排行</div>
        <div class="table-wrap"><table>
          <thead><tr><th>学生</th><th>课程数</th><th>总时长</th><th>课程收入</th><th>场地费</th><th>净收入</th><th>占比</th></tr></thead>
          <tbody>
            ${byStudent.map(s => `<tr>
              <td>${s.name}</td><td>${s.count}</td><td>${s.hours.toFixed(1)}h</td>
              <td>${fmtMoney(s.income)}</td><td>${fmtMoney(s.court)}</td><td>${fmtMoney(s.income - s.court)}</td>
              <td><div class="progress"><div class="progress-bar" style="width:${Math.round(s.income / maxStudentIncome * 100)}%"></div></div></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-title">📅 月度统计</div>
        <div class="table-wrap"><table>
          <thead><tr><th>月份</th><th>课程数</th><th>总时长</th><th>课程收入</th><th>场地费</th><th>净收入</th><th>趋势</th></tr></thead>
          <tbody>
            ${months.map(m => { const d = byMonth[m]; return `<tr>
              <td>${m}</td><td>${d.count}</td><td>${d.hours.toFixed(1)}h</td>
              <td>${fmtMoney(d.income)}</td><td>${fmtMoney(d.court)}</td><td>${fmtMoney(d.income - d.court)}</td>
              <td><div class="progress"><div class="progress-bar" style="width:${Math.round(d.income / maxMonthIncome * 100)}%"></div></div></td>
            </tr>`; }).join('')}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-title">🎯 课程类型分布</div>
        <div class="table-wrap"><table>
          <thead><tr><th>类型</th><th>课程数</th><th>总时长</th><th>收入</th><th>平均单价</th></tr></thead>
          <tbody>
            ${Object.entries(byType).map(([t, d]) => `<tr>
              <td><span class="tag ${t === '1对2' ? 'tag-purple' : t === '小班' ? 'tag-orange' : 'tag-blue'}">${t}</span></td>
              <td>${d.count}</td><td>${d.hours.toFixed(1)}h</td><td>${fmtMoney(d.income)}</td>
              <td>${d.hours > 0 ? fmtMoney(d.income / d.hours) + '/h' : '-'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    `;
  }
};

// ===== 设置与备份 =====
const SettingsView = {
  render() {
    const data = Store.data;
    const size = new Blob([JSON.stringify(data)]).size;
    $('#content').innerHTML = `
      <div class="card">
        <div class="card-title">📊 数据概览</div>
        <div class="info-row"><div class="info-label">学生数</div><div class="info-value">${data.students.length}</div></div>
        <div class="info-row"><div class="info-label">课程记录</div><div class="info-value">${data.lessons.length}</div></div>
        <div class="info-row"><div class="info-label">课包数</div><div class="info-value">${data.students.reduce((s, st) => s + st.packages.length, 0)}</div></div>
        <div class="info-row"><div class="info-label">数据大小</div><div class="info-value">${(size / 1024).toFixed(1)} KB</div></div>
        <div class="info-row"><div class="info-label">存储位置</div><div class="info-value">浏览器本地存储 (localStorage)</div></div>
      </div>

      <div class="card">
        <div class="card-title">💾 数据备份与恢复</div>
        <p style="color:#64748b;font-size:13px;margin-bottom:14px">建议定期导出备份文件保存到本地或云端，防止数据丢失。</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="SettingsView.export()">📥 导出备份</button>
          <button class="btn btn-success" onclick="SettingsView.import()">📥 导入备份</button>
          <button class="btn" onclick="SettingsView.exportCsv()">📄 导出课程CSV</button>
        </div>
        <input type="file" id="importFile" accept=".json" style="display:none" onchange="SettingsView.doImport(event)">
      </div>

      <div class="card">
        <div class="card-title">⚙️ 课时类型设置</div>
        <p style="color:#64748b;font-size:13px;margin-bottom:14px">课时消耗规则：实际时长 ÷ 单节时长 = 消耗课时。</p>
        <div class="table-wrap"><table>
          <thead><tr><th>类型</th><th>单节时长</th><th>说明</th></tr></thead>
          <tbody>
            ${Object.entries(PACKAGE_TYPES).map(([k, v]) => `<tr>
              <td><span class="tag ${k === '1对2' ? 'tag-purple' : k === '小班' ? 'tag-orange' : 'tag-blue'}">${v.label}</span></td>
              <td>${v.durationOptions.length ? v.durationOptions.join(' / ') + ' 小时' : '自定义'}</td>
              <td>${v.desc}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-title">⚠️ 危险操作</div>
        <p style="color:#64748b;font-size:13px;margin-bottom:14px">重置将清除所有数据并恢复到初始备份状态（${DEFAULT_DATA.students.length}个学生、${DEFAULT_DATA.lessons.length}条课程记录）。</p>
        <button class="btn btn-danger" onclick="SettingsView.reset()">重置为备份数据</button>
      </div>
    `;
  },
  export() {
    const data = JSON.stringify(Store.data, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `羽毛球教练数据备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出备份', 'success');
  },
  import() { $('#importFile').click(); },
  doImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.students || !data.lessons) throw new Error('格式不正确');
        showConfirm('导入备份', `将导入 <b>${data.students.length}</b> 个学生、<b>${data.lessons.length}</b> 条课程记录。<br>当前数据将被覆盖，建议先导出备份。是否继续？`, () => {
          Store.data = data;
          Store.migrate();
          Store.save();
          App.render();
          toast('导入成功', 'success');
        });
      } catch (err) { toast('文件格式错误：' + err.message, 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  },
  exportCsv() {
    const lessons = Store.data.lessons;
    const header = '日期,开始,结束,学生,类型,时长,金额,场地费,地点,备注\n';
    const rows = lessons.map(l => [l.date, l.startTime, l.endTime, l.studentName, l.type, l.duration, l.amount, l.courtCost, l.location || '', (l.notes || '').replace(/,/g, '，')].join(',')).join('\n');
    const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `课程记录_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast('已导出CSV', 'success');
  },
  reset() {
    showConfirm('重置数据', '确定清除所有数据并恢复到初始备份状态吗？<br><b>此操作不可恢复！</b>', () => {
      Store.reset();
      App.render();
      toast('已重置为备份数据', 'success');
    });
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());
