import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="workspace-home">
    <header class="workspace-header">
      <h1>인터랙션 작업공간</h1>
    </header>

    <nav class="project-list" aria-label="작업 목록">
      <a class="project-link" href="/tionweb/" aria-label="tionweb 열기">
        <span class="project-icon project-icon--tion" aria-hidden="true">🌀</span>
        <strong>tionweb</strong>
      </a>

      <a class="project-link" href="/1week/" aria-label="1주차 작업 열기">
        <span class="project-icon" aria-hidden="true">
          <span class="folder folder--coral">
            <span class="folder__tab"></span>
            <span class="folder__paper"></span>
            <span class="folder__cover"></span>
          </span>
        </span>
        <strong>1주차</strong>
      </a>

      <a class="project-link" href="/2week/" aria-label="2주차 작업 열기">
        <span class="project-icon" aria-hidden="true">
          <span class="folder folder--blue">
            <span class="folder__tab"></span>
            <span class="folder__paper"></span>
            <span class="folder__cover"></span>
          </span>
        </span>
        <strong>2주차</strong>
      </a>

      <a class="project-link" href="/3week/" aria-label="3주차 작업 열기">
        <span class="project-icon" aria-hidden="true">
          <span class="folder folder--green">
            <span class="folder__tab"></span>
            <span class="folder__paper"></span>
            <span class="folder__cover"></span>
          </span>
        </span>
        <strong>3주차</strong>
      </a>

      <a class="project-link" href="/4week/" aria-label="4주차 작업 열기">
        <span class="project-icon" aria-hidden="true">
          <span class="folder folder--purple">
            <span class="folder__tab"></span>
            <span class="folder__paper"></span>
            <span class="folder__cover"></span>
          </span>
        </span>
        <strong>4주차</strong>
      </a>

      <a class="project-link" href="/5week/" aria-label="5주차 작업 열기">
        <span class="project-icon" aria-hidden="true">
          <span class="folder folder--moon">
            <span class="folder__tab"></span>
            <span class="folder__paper"></span>
            <span class="folder__cover"></span>
          </span>
        </span>
        <strong>5주차</strong>
      </a>

      <a class="project-link" href="/cam/" aria-label="cam 열기">
        <span class="project-icon project-icon--cam" aria-hidden="true">📸</span>
        <strong>cam</strong>
      </a>
    </nav>
  </main>
`
