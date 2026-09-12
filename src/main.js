import { createClient } from '@supabase/supabase-js';

const $ = (s) => document.querySelector(s);
const grid = $('#calendarGrid'), title = $('#monthTitle'), loading = $('#loading'), toast = $('#toast'), emptyCalendar = $('#emptyCalendar');
// Vite가 .env.local의 VITE_ 접두사 변수를 빌드 시 주입합니다.
const runtime = import.meta.env;
const supabaseUrl = runtime.VITE_SUPABASE_URL || '';
const supabaseKey = runtime.VITE_SUPABASE_ANON_KEY || '';
let supabase, ownerId, routines = [], events = [], editing = null;
let view = new Date(); view = new Date(view.getFullYear(), view.getMonth(), 1);
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const escape = s => String(s).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const toRoutine = r => ({ ...r, start: r.start_time.slice(0,5), end: r.end_time.slice(0,5) });
const toEvent = e => ({ ...e, date: e.event_date, start: e.start_time.slice(0,5), end: e.end_time.slice(0,5) });
function notify(message, error = false) { toast.textContent = message; toast.className = 'toast' + (error ? ' error' : ''); setTimeout(() => toast.classList.add('hidden'), 3200); }
function setLoading(show) { loading.classList.toggle('hidden', !show); }
function dbError(error, action = '처리') { console.error(error); notify(`${action}에 실패했어요. 다시 시도해주세요.`, true); }
async function initialise() {
  setLoading(true);
  if (!supabaseUrl || !supabaseKey) { setLoading(false); notify('Supabase 환경변수를 설정한 뒤 다시 열어주세요.', true); return; }
  supabase = createClient(supabaseUrl, supabaseKey);
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) { const { data, error } = await supabase.auth.signInAnonymously(); if (error) { setLoading(false); return dbError(error, '익명 세션 생성'); } session = data.session; }
  ownerId = session.user.id; await refreshData(); setLoading(false);
}
async function refreshData() {
  const [routineResult, eventResult] = await Promise.all([supabase.from('routines').select('*').order('start_time'), supabase.from('calendar_events').select('*').order('event_date').order('start_time')]);
  if (routineResult.error) return dbError(routineResult.error, '일과 불러오기');
  if (eventResult.error) return dbError(eventResult.error, '일정 불러오기');
  routines = routineResult.data.map(toRoutine); events = eventResult.data.map(toEvent); render();
}
function getDayItems(date) { return [...routines.filter(r => Number(r.weekday) === date.getDay()).map(r => ({ ...r, kind: 'routine' })), ...events.filter(e => e.date === dateKey(date)).map(e => ({ ...e, kind: 'one-time' }))].sort((a,b) => a.start.localeCompare(b.start)); }
function render() {
  emptyCalendar.classList.toggle('hidden', routines.length + events.length !== 0);
  const year = view.getFullYear(), month = view.getMonth(); title.textContent = `${year}년 ${month + 1}월`; grid.innerHTML = '';
  const start = new Date(year, month, 1 - new Date(year, month, 1).getDay()), today = dateKey(new Date());
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const items = getDayItems(d);
    const cell = document.createElement('div'); cell.className = `day ${d.getMonth() === month ? '' : 'other-month'} ${d.getDay() === 0 ? 'sunday' : ''} ${d.getDay() === 6 ? 'saturday' : ''} ${dateKey(d) === today ? 'today' : ''}`;
    cell.innerHTML = `<span class="date-num">${d.getDate()}</span>${items.slice(0,3).map(item => `<button class="event ${item.kind}" title="${escape(item.title)} ${item.start}~${item.end}" data-kind="${item.kind}" data-id="${item.id}">${escape(item.start)} · ${escape(item.title)}</button>`).join('')}${items.length > 3 ? `<span class="more">+${items.length - 3}</span>` : ''}`;
    cell.addEventListener('dblclick', () => openModal('eventModal', dateKey(d)));
    cell.querySelectorAll('.event').forEach(button => button.onclick = () => { const list = button.dataset.kind === 'routine' ? routines : events; openEdit(list.find(item => item.id === button.dataset.id), button.dataset.kind); });
    grid.appendChild(cell);
  }
}
function openModal(id, date) { $('#deleteRoutine').classList.toggle('hidden', !(editing && editing.kind === 'routine')); $('#deleteEvent').classList.toggle('hidden', !(editing && editing.kind === 'one-time')); $('#modalBackdrop').classList.remove('hidden'); $('#' + id).classList.remove('hidden'); if (date) $('#eventForm [name=date]').value = date; setTimeout(() => $('#' + id + ' input').focus(), 50); }
function closeModals() { $('#modalBackdrop').classList.add('hidden'); document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); editing = null; $('#routineForm').reset(); $('#eventForm').reset(); $('#routineHeading').textContent = '고정 일과 추가'; $('#eventHeading').textContent = '일회성 일정 추가'; }
function openEdit(item, kind) { if (!item) return; editing = { id: item.id, kind }; const routine = kind === 'routine', form = routine ? $('#routineForm') : $('#eventForm'); form.title.value = item.title; form.start.value = item.start; form.end.value = item.end; if (routine) { form.description.value = item.description || ''; form.weekday.value = item.weekday; $('#routineHeading').textContent = '고정 일과 수정'; } else { form.date.value = item.date; $('#eventHeading').textContent = '일회성 일정 수정'; } openModal(routine ? 'routineModal' : 'eventModal'); }
async function saveRoutine(form) { const f = new FormData(form); if (f.get('end') <= f.get('start')) return notify('종료 시간은 시작 시간보다 늦어야 해요.', true); const payload = { title: f.get('title'), description: f.get('description') || '', weekday: Number(f.get('weekday')), start_time: f.get('start'), end_time: f.get('end') }; const request = editing ? supabase.from('routines').update(payload).eq('id', editing.id) : supabase.from('routines').insert({ ...payload, owner_id: ownerId }); const { error } = await request; if (error) return dbError(error, '저장'); closeModals(); await refreshData(); notify('고정 일과를 저장했어요.'); }
async function saveEvent(form) { const f = new FormData(form); if (f.get('end') <= f.get('start')) return notify('종료 시간은 시작 시간보다 늦어야 해요.', true); const payload = { title: f.get('title'), event_date: f.get('date'), start_time: f.get('start'), end_time: f.get('end') }; const request = editing ? supabase.from('calendar_events').update(payload).eq('id', editing.id) : supabase.from('calendar_events').insert({ ...payload, owner_id: ownerId }); const { error } = await request; if (error) return dbError(error, '저장'); view = new Date(f.get('date') + 'T00:00:00'); view.setDate(1); closeModals(); await refreshData(); notify('일정을 저장했어요.'); }
async function deleteEditing() { if (!editing || !confirm('이 일정을 삭제할까요?')) return; const table = editing.kind === 'routine' ? 'routines' : 'calendar_events'; const { error } = await supabase.from(table).delete().eq('id', editing.id); if (error) return dbError(error, '삭제'); closeModals(); await refreshData(); notify('일정을 삭제했어요.'); }
$('#deleteRoutine').onclick = deleteEditing; $('#deleteEvent').onclick = deleteEditing;
$('#openRoutine').onclick = () => { editing = null; openModal('routineModal'); };
$('#openEvent').onclick = () => { editing = null; openModal('eventModal', dateKey(new Date())); };
document.querySelectorAll('[data-close],#modalBackdrop').forEach(el => el.onclick = closeModals);
$('#routineForm').onsubmit = e => { e.preventDefault(); saveRoutine(e.currentTarget); };
$('#eventForm').onsubmit = e => { e.preventDefault(); saveEvent(e.currentTarget); };
$('#saveButton').onclick = () => notify('일정은 저장할 때마다 Supabase에 반영돼요.');
$('#prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
$('#nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
$('#todayButton').onclick = () => { view = new Date(); view.setDate(1); render(); };
initialise();