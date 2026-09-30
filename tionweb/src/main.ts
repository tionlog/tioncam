import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="tion-workspace">
    <a class="home-logo" href="${import.meta.env.BASE_URL}" aria-label="홈으로 이동" title="홈으로 이동">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v8.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-8.6Z"/><path d="M9.2 21v-6.8h5.6V21"/></svg>
    </a>

    <div class="ambient ambient--one" aria-hidden="true"></div>
    <div class="ambient ambient--two" aria-hidden="true"></div>

    <header class="workspace-header">
      <div class="workspace-mark"><span>🌀</span><small>PERSONAL SPACE</small></div>
      <span class="workspace-state"><i></i> WORKSPACE READY</span>
    </header>

    <section class="hero">
      <p class="hero__eyebrow">MY OWN WEBSITE WORKSHOP</p>
      <h1>tion<span>web</span></h1>
      <p class="hero__copy">배운 것에서 벗어나, 만들고 싶은 웹을 자유롭게 실험하는 개인 작업장.</p>
      <div class="hero__line"><i></i><span>Start something personal.</span></div>
    </section>

    <section class="workbench" aria-label="tionweb 시작 안내">
      <article>
        <span>01</span>
        <div><small>STATUS</small><strong>Blank canvas</strong></div>
      </article>
      <article>
        <span>02</span>
        <div><small>DIRECTORY</small><strong>/tionweb</strong></div>
      </article>
      <article>
        <span>∞</span>
        <div><small>NEXT</small><strong>Build anything</strong></div>
      </article>
    </section>

    <footer><span>TIONWEB</span><span>SIHYEON'S PERSONAL LAB · 2026</span></footer>
  </main>
`

const workspace = document.querySelector<HTMLElement>('.tion-workspace')!
window.addEventListener('pointermove', (event) => {
  workspace.style.setProperty('--pointer-x', `${event.clientX}px`)
  workspace.style.setProperty('--pointer-y', `${event.clientY}px`)
})
