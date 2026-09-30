import type { Resident } from './resident'
import { residentProfile } from './resident-profile'

type Options = {
  residents: Resident[]
  remove: (ids: readonly string[]) => Promise<void>
  notify: (message: string) => void
}

// Local UI lock only. With browser-owned IndexedDB and no authentication server,
// this intentionally does not claim to protect against DevTools/storage access.
export function createResidentAdmin({ residents, remove, notify }: Options) {
  const settings = document.querySelector<HTMLButtonElement>('#adminSettings')!
  const dialog = document.createElement('dialog')
  dialog.id = 'residentAdmin'
  dialog.className = 'admin-dialog'
  dialog.setAttribute('aria-labelledby', 'adminTitle')
  dialog.innerHTML = `
    <button class="dialog-close" id="closeAdmin" type="button" aria-label="관리자 설정 닫기">×</button>
    <h2 id="adminTitle">관리자 설정</h2>
    <form id="adminLogin">
      <p>주민을 관리하려면 관리자 비밀번호를 입력해 주세요.</p>
      <label for="adminPassword">관리자 비밀번호</label>
      <input id="adminPassword" type="password" inputmode="numeric" autocomplete="off" required aria-describedby="adminError">
      <p id="adminError" class="admin-error" role="alert"></p>
      <button class="admin-primary" type="submit">확인</button>
    </form>
    <section id="adminResidents" hidden aria-label="주민 삭제 관리">
      <p id="adminSummary"></p>
      <label class="admin-select-all"><input id="selectAllResidents" type="checkbox"> 모두 선택 <span id="adminSelectedCount"></span></label>
      <ul id="adminResidentList" class="profile-list"></ul>
      <p id="adminDeleteError" class="admin-error" role="alert"></p>
      <div class="admin-actions"><button id="deleteSelectedResidents" type="button" disabled>선택 삭제</button><button id="deleteAllResidents" class="admin-danger" type="button">전체 삭제</button></div>
    </section>`
  const confirm = document.createElement('dialog')
  confirm.id = 'confirmResidentDelete'
  confirm.className = 'admin-dialog confirm-delete-dialog'
  confirm.setAttribute('role', 'alertdialog')
  confirm.setAttribute('aria-labelledby', 'deleteTitle')
  confirm.setAttribute('aria-describedby', 'deleteDescription')
  confirm.innerHTML = `
    <h2 id="deleteTitle">삭제하시겠습니까?</h2>
    <p id="deleteDescription"></p>
    <div class="admin-actions"><button id="cancelResidentDelete" type="button" autofocus>닫기</button><button id="confirmResidentDeleteButton" class="admin-danger" type="button">확인</button></div>`
  document.body.append(dialog, confirm)
  const login = dialog.querySelector<HTMLFormElement>('#adminLogin')!
  const password = dialog.querySelector<HTMLInputElement>('#adminPassword')!
  const error = dialog.querySelector<HTMLElement>('#adminError')!
  const manager = dialog.querySelector<HTMLElement>('#adminResidents')!
  const list = dialog.querySelector<HTMLUListElement>('#adminResidentList')!
  const selectAll = dialog.querySelector<HTMLInputElement>('#selectAllResidents')!
  const selectedButton = dialog.querySelector<HTMLButtonElement>('#deleteSelectedResidents')!
  const allButton = dialog.querySelector<HTMLButtonElement>('#deleteAllResidents')!
  const deleteError = dialog.querySelector<HTMLElement>('#adminDeleteError')!
  const close = dialog.querySelector<HTMLButtonElement>('#closeAdmin')!
  const cancel = confirm.querySelector<HTMLButtonElement>('#cancelResidentDelete')!
  const accept = confirm.querySelector<HTMLButtonElement>('#confirmResidentDeleteButton')!
  const selected = new Set<string>()
  let unlocked = false
  let busy = false
  let pending: string[] = []

  function updateSelection() {
    selectAll.checked = residents.length > 0 && selected.size === residents.length
    selectAll.indeterminate = selected.size > 0 && selected.size < residents.length
    selectAll.disabled = !residents.length || busy
    selectedButton.disabled = !selected.size || busy
    allButton.disabled = !residents.length || busy
    dialog.querySelector('#adminSelectedCount')!.textContent = `${selected.size}명 선택`
  }
  function refresh() {
    if (!unlocked) return
    for (const id of selected) if (!residents.some((resident) => resident.id === id)) selected.delete(id)
    dialog.querySelector('#adminSummary')!.textContent = `이 브라우저의 입주민 ${residents.length}명`
    list.replaceChildren()
    for (const resident of residents) {
      const item = document.createElement('li')
      const label = document.createElement('label')
      label.className = 'profile-entry'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.value = resident.id
      checkbox.checked = selected.has(resident.id)
      checkbox.disabled = busy
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(resident.id)
        else selected.delete(resident.id)
        updateSelection()
      })
      label.append(checkbox, residentProfile(resident))
      item.append(label); list.append(item)
    }
    if (!residents.length) {
      const empty = document.createElement('li')
      empty.className = 'profile-empty'; empty.textContent = '아직 입주민이 없어요.'
      list.append(empty)
    }
    updateSelection()
  }
  function lock() {
    unlocked = false; selected.clear(); pending = []
    password.value = ''; error.textContent = ''; deleteError.textContent = ''
    login.hidden = false; manager.hidden = true; list.replaceChildren()
  }
  settings.addEventListener('click', () => {
    lock(); dialog.showModal(); password.focus()
  })
  login.addEventListener('submit', (event) => {
    event.preventDefault()
    if (password.value !== '1999') {
      error.textContent = '비밀번호가 올바르지 않아요.'
      password.value = ''; password.focus(); return
    }
    unlocked = true; password.value = ''; error.textContent = ''
    login.hidden = true; manager.hidden = false
    refresh(); selectAll.focus()
  })
  close.addEventListener('click', () => { if (!busy) dialog.close() })
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault() })
  dialog.addEventListener('close', lock)
  selectAll.addEventListener('change', () => {
    selected.clear()
    if (selectAll.checked) residents.forEach((resident) => selected.add(resident.id))
    refresh()
  })
  function ask(ids: string[]) {
    if (!unlocked || busy || !ids.length) return
    pending = ids
    deleteError.textContent = ''
    confirm.querySelector('#deleteDescription')!.textContent = `${ids.length}명의 주민과 저장된 얼굴 데이터를 삭제합니다. 이 삭제는 되돌릴 수 없어요.`
    confirm.showModal(); cancel.focus()
  }
  selectedButton.addEventListener('click', () => ask(residents.filter((resident) => selected.has(resident.id)).map((resident) => resident.id)))
  allButton.addEventListener('click', () => ask(residents.map((resident) => resident.id)))
  cancel.addEventListener('click', () => { if (!busy) confirm.close() })
  confirm.addEventListener('cancel', (event) => { if (busy) event.preventDefault() })
  confirm.addEventListener('close', () => { pending = [] })
  accept.addEventListener('click', async () => {
    if (!unlocked || busy || !pending.length) return
    busy = true
    const ids = [...pending]
    close.disabled = cancel.disabled = accept.disabled = true
    accept.textContent = '삭제 중…'
    refresh()
    try {
      await remove(ids)
      ids.forEach((id) => selected.delete(id))
      notify(`${ids.length}명의 주민을 삭제했어요. 이 삭제는 되돌릴 수 없어요.`)
    } catch {
      deleteError.textContent = '삭제를 저장하지 못해 주민을 복원했어요. 저장 공간을 확인하고 다시 시도해 주세요.'
    } finally {
      busy = false
      close.disabled = cancel.disabled = accept.disabled = false
      accept.textContent = '확인'
      confirm.close(); refresh()
    }
  })
  return { refresh }
}
