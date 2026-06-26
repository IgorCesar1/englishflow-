
cat > /mnt/user-data/outputs/english-srs-app/style.css << 'EOF'
/* EnglishFlow v3 — style.css
   Paleta idêntica + novos componentes: sub-tabs, check-btn,
   training-text, accent-selector, deck-list, requeue-badge */

:root {
  --bg:          #0d1117;
  --surface:     #161b22;
  --surface-2:   #1c2430;
  --surface-3:   #232d3a;
  --border:      #2a3444;
  --border-2:    #384558;
  --accent:      #6c8bef;
  --accent-dim:  #3d5299;
  --accent-glow: rgba(108,139,239,.18);
  --text-hi:     #e6edf3;
  --text-md:     #8b96a4;
  --text-lo:     #4d5b6b;
  --green:       #3fb950;
  --yellow:      #d29922;
  --red:         #f85149;
  --orange:      #e3812b;
  --font: "Inter", system-ui, -apple-system, sans-serif;
  --mono: "JetBrains Mono", "Fira Code", monospace;
  --r-sm:4px; --r-md:10px; --r-lg:16px; --r-xl:24px;
  --ease: cubic-bezier(.25,.8,.25,1);
}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--font);background:var(--bg);color:var(--text-hi);min-height:100dvh;line-height:1.6;-webkit-font-smoothing:antialiased}
input,textarea,select,button{font-family:inherit}
button{cursor:pointer;border:none;background:none}
textarea{resize:vertical}

/* ── Header ── */
.app-header{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:1.25rem;padding:.7rem 1.5rem;background:rgba(13,17,23,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:.45rem;flex-shrink:0}
.brand-icon{font-size:1.25rem;color:var(--accent)}
.brand-name{font-size:.95rem;font-weight:700;letter-spacing:-.02em}
.tab-nav{display:flex;gap:.2rem;flex:1;overflow-x:auto;scrollbar-width:none}
.tab-nav::-webkit-scrollbar{display:none}
.tab-btn{display:inline-flex;align-items:center;gap:.3rem;padding:.42rem .85rem;border-radius:var(--r-sm);font-size:.8rem;font-weight:500;color:var(--text-md);white-space:nowrap;transition:color .2s,background .2s}
.tab-btn:hover{color:var(--text-hi);background:var(--surface-2)}
.tab-btn.active{color:var(--accent);background:var(--accent-glow)}
.tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;background:var(--red);color:#fff;border-radius:20px;font-size:.65rem;font-weight:700;transition:transform .3s,opacity .3s}
.tab-badge[data-count="0"]{opacity:0;transform:scale(0)}
.stat-badge{flex-shrink:0;display:inline-block;padding:.22rem .65rem;background:var(--accent-glow);color:var(--accent);border:1px solid var(--accent-dim);border-radius:20px;font-size:.76rem;font-weight:600}

/* ── Layout ── */
.app-main{max-width:960px;margin:0 auto;padding:2rem 1.5rem 5rem}
.tab-panel{display:none}
.tab-panel.active{display:block;animation:fadeIn .22s var(--ease)}
@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.panel-header{margin-bottom:1.75rem}
.panel-header h2{font-size:1.45rem;font-weight:700;letter-spacing:-.03em}
.panel-sub{color:var(--text-md);font-size:.86rem;margin-top:.3rem}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;gap:.38rem;padding:.58rem 1.15rem;border-radius:var(--r-md);font-size:.86rem;font-weight:600;transition:all .14s var(--ease);border:1px solid transparent;line-height:1}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-primary:hover{background:#7d9cf5}
.btn-secondary{background:var(--surface-3);color:var(--text-hi);border-color:var(--border-2)}
.btn-secondary:hover{background:var(--border-2)}
.btn-ghost{background:transparent;color:var(--text-md);border-color:var(--border)}
.btn-ghost:hover{color:var(--text-hi);border-color:var(--border-2);background:var(--surface-2)}
.btn-accent{background:var(--accent-glow);color:var(--accent);border-color:var(--accent-dim)}
.btn-accent:hover{background:rgba(108,139,239,.3)}
.btn-danger{background:rgba(248,81,73,.12);color:var(--red);border-color:var(--red)}
.btn-danger:hover{background:rgba(248,81,73,.25)}
.btn-sm{padding:.38rem .75rem;font-size:.78rem}
.btn-feedback{padding:.52rem 1rem;border-radius:var(--r-md);font-size:.83rem;border:1px solid;display:inline-flex;flex-direction:column;align-items:center;gap:.1rem}
.btn-feedback small{font-size:.65rem;opacity:.7}
.btn-again{color:var(--red);border-color:var(--red);background:rgba(248,81,73,.1)}
.btn-again:hover{background:rgba(248,81,73,.25)}
.btn-hard{color:var(--orange);border-color:var(--orange);background:rgba(227,129,43,.1)}
.btn-hard:hover{background:rgba(227,129,43,.25)}
.btn-good{color:var(--yellow);border-color:var(--yellow);background:rgba(210,153,34,.1)}
.btn-good:hover{background:rgba(210,153,34,.25)}
.btn-easy{color:var(--green);border-color:var(--green);background:rgba(63,185,80,.1)}
.btn-easy:hover{background:rgba(63,185,80,.25)}

/* ── PDF Drop Zone ── */
.pdf-drop-zone{position:relative;border:2px dashed var(--accent-dim);border-radius:var(--r-xl);padding:2.2rem 2rem;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;background:var(--accent-glow);margin-bottom:.75rem}
.pdf-drop-zone:hover,.pdf-drop-zone.dragging{border-color:var(--accent);background:rgba(108,139,239,.26)}
.pdf-drop-zone input[type="file"]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.pdf-drop-icon{font-size:2.2rem;margin-bottom:.6rem}
.pdf-drop-title{font-size:1rem;font-weight:700;margin-bottom:.25rem}
.pdf-drop-sub{font-size:.82rem;color:var(--text-md)}
.pdf-status{padding:.55rem 1rem;border-radius:var(--r-md);font-size:.85rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text-md);margin-bottom:1rem}
.pdf-status.loading{color:var(--accent);border-color:var(--accent-dim)}
.pdf-status.success{color:var(--green);border-color:var(--green)}
.pdf-status.error{color:var(--red);border-color:var(--red)}

/* ── PDF Preview ── */
.pdf-preview{background:var(--surface);border:1px solid var(--border-2);border-radius:var(--r-xl);padding:1.4rem;margin-bottom:1.5rem;animation:fadeIn .3s}
.preview-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem}
.preview-header h3{font-size:.95rem;font-weight:700}
.preview-header > div{display:flex;gap:.5rem}
#previewModules{display:flex;flex-direction:column;gap:.7rem;max-height:320px;overflow-y:auto}
.preview-mod{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-lg);padding:.9rem}
.preview-mod-title{font-weight:700;font-size:.88rem;margin-bottom:.3rem}
.preview-mod-meta{font-size:.75rem;color:var(--text-md);margin-bottom:.55rem}
.preview-pair{padding:.28rem 0;border-bottom:1px solid var(--border);font-size:.8rem}
.preview-pair:last-child{border-bottom:none}
.preview-pair .pen{color:var(--text-hi)}
.preview-pair .ppt{color:var(--accent);font-size:.75rem}
.preview-training{margin-top:.6rem;padding:.5rem;background:var(--surface-3);border-radius:var(--r-sm);font-size:.78rem;color:var(--text-md);font-style:italic;max-height:60px;overflow:hidden;text-overflow:ellipsis}

/* ── Divider ── */
.divider-or{display:flex;align-items:center;gap:1rem;margin:1.75rem 0 1.4rem;color:var(--text-lo);font-size:.8rem}
.divider-or::before,.divider-or::after{content:'';flex:1;height:1px;background:var(--border)}

/* ── Forms ── */
.create-form,.anki-form{display:flex;flex-direction:column;gap:1.1rem}
.form-group{display:flex;flex-direction:column;gap:.38rem}
.form-group label{font-size:.78rem;font-weight:600;color:var(--text-md);text-transform:uppercase;letter-spacing:.05em}
.form-row{display:flex;gap:1rem}
.flex-1{flex:1}
input[type="text"],textarea,select.select-control{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);color:var(--text-hi);padding:.65rem .95rem;font-size:.88rem;width:100%;transition:border-color .2s}
input[type="text"]:focus,textarea:focus,select.select-control:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
input::placeholder,textarea::placeholder{color:var(--text-lo)}
.anki-section{margin-top:2.8rem;padding:1.4rem;border:1px dashed var(--border);border-radius:var(--r-xl);background:var(--surface)}
.anki-section h3{font-size:.95rem;font-weight:700;margin-bottom:.35rem}

/* ── Modules grid ── */
.modules-list-section{margin-top:2.5rem}
.modules-list-section h3{font-size:.95rem;font-weight:700;margin-bottom:.9rem}
.modules-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.9rem}
.module-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:1.1rem;transition:border-color .2s,transform .2s}
.module-card:hover{border-color:var(--accent-dim);transform:translateY(-2px)}
.mc-title{font-weight:700;font-size:.9rem;margin-bottom:.3rem}
.mc-meta{font-size:.75rem;color:var(--text-md)}
.mc-due{font-size:.73rem;color:var(--red);font-weight:600;margin-top:.2rem}
.mc-checked{font-size:.73rem;color:var(--green);margin-top:.2rem}
.mc-deck{display:inline-block;font-size:.68rem;padding:.1rem .4rem;border-radius:20px;background:var(--surface-3);color:var(--text-lo);margin-top:.3rem}
.mc-actions{display:flex;gap:.45rem;margin-top:.75rem}
.count-badge{display:inline-block;padding:.1rem .4rem;background:var(--surface-3);border-radius:20px;font-size:.72rem;color:var(--text-md);margin-left:.35rem}

/* ── Study area ── */
.study-header{display:flex;align-items:center;flex-wrap:wrap;gap:.9rem;margin-bottom:1.2rem}
.study-title{font-size:1.1rem;font-weight:700;flex:1}

/* Sub-tabs */
.study-subtab-nav{display:flex;gap:.4rem;border-bottom:1px solid var(--border);margin-bottom:1.5rem;padding-bottom:.1rem}
.study-subtab{padding:.45rem 1rem;border-radius:var(--r-sm) var(--r-sm) 0 0;font-size:.83rem;font-weight:500;color:var(--text-md);transition:color .2s,background .2s;border-bottom:2px solid transparent}
.study-subtab:hover{color:var(--text-hi)}
.study-subtab.active{color:var(--accent);border-bottom-color:var(--accent)}
.study-view{display:none}
.study-view.active{display:block;animation:fadeIn .2s}

/* Linha a Linha toolbar */
.ll-toolbar{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1.2rem}
.accent-selector{display:flex;align-items:center;gap:.35rem}
.accent-label{font-size:.75rem;color:var(--text-lo);white-space:nowrap}
.accent-btn{padding:.3rem .6rem;border:1px solid var(--border);border-radius:var(--r-sm);font-size:.78rem;color:var(--text-md);transition:all .15s}
.accent-btn:hover{border-color:var(--accent-dim);color:var(--text-hi)}
.accent-btn.active{border-color:var(--accent);background:var(--accent-glow);color:var(--accent)}
.ll-progress-wrap{flex:1;height:4px;background:var(--surface-3);border-radius:2px;overflow:hidden}
.ll-progress-bar{height:100%;width:0;background:var(--green);transition:width .4s}
.ll-progress-text{font-size:.75rem;color:var(--text-lo);white-space:nowrap}

/* Sentence cards */
.sentences-list{display:flex;flex-direction:column;gap:.85rem}
.sentence-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:1.1rem 1.3rem;transition:border-color .25s,background .25s}
.sentence-card.playing{border-color:var(--accent);background:var(--surface-2)}
.sentence-card.sc-checked{border-color:var(--green);background:rgba(63,185,80,.06)}
.sentence-num{font-size:.7rem;color:var(--text-lo);font-family:var(--mono);margin-bottom:.35rem}
.sentence-en{font-size:1rem;line-height:1.7}
.sentence-pt{font-size:.88rem;color:var(--accent);line-height:1.6;margin-top:.45rem;display:none}
.sentence-pt.visible{display:block;animation:fadeIn .2s}
.sentence-controls{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem;align-items:center}

/* Check button */
.check-btn{display:inline-flex;align-items:center;gap:.3rem;padding:.35rem .75rem;border:1px solid var(--border);border-radius:var(--r-sm);font-size:.78rem;color:var(--text-md);transition:all .18s}
.check-btn:hover{border-color:var(--green);color:var(--green)}
.check-btn.checked{background:rgba(63,185,80,.15);border-color:var(--green);color:var(--green);font-weight:600}
.check-btn.checked::before{content:'✔ '}

/* Training text */
.training-controls{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem}
.training-progress-wrap{height:4px;background:var(--surface-3);border-radius:2px;overflow:hidden;margin-bottom:1.4rem}
.training-progress-bar{height:100%;width:0;background:var(--accent);transition:width .35s}
.training-text-view{font-size:1.05rem;line-height:2;color:var(--text-md);user-select:none}
.ts{padding:.1rem .2rem;border-radius:3px;transition:background .25s,color .25s;cursor:pointer}
.ts:hover{background:var(--surface-2);color:var(--text-hi)}
.ts.ts-active{background:var(--accent-glow);color:var(--text-hi);border-radius:var(--r-sm)}
.ts.ts-done{color:var(--text-lo)}

/* ── SRS Review ── */
.review-area{max-width:600px;margin:0 auto}
.review-meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:.7rem}
.review-counter{font-size:.82rem;color:var(--text-lo)}
.requeue-badge{font-size:.75rem;padding:.2rem .55rem;background:rgba(248,81,73,.12);color:var(--red);border:1px solid var(--red);border-radius:20px}
.srs-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:2.4rem 1.8rem;text-align:center;min-height:210px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.9rem;margin-bottom:1.4rem;transition:box-shadow .3s}
.srs-card:has(.card-back:not(.hidden)){box-shadow:0 0 0 1px var(--accent),0 0 22px var(--accent-glow)}
.card-tag{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-lo)}
.card-text{font-size:1.3rem;font-weight:600;line-height:1.5}
.card-translation{font-size:1.05rem;color:var(--accent);margin-top:.4rem}
.card-context{font-size:.83rem;color:var(--text-md);font-style:italic;margin-top:.25rem}
.card-audio-btn{margin-top:.6rem}
.card-actions-row{text-align:center;margin-bottom:1rem}
.card-feedback{display:flex;gap:.65rem;justify-content:center;flex-wrap:wrap;align-items:center}
.feedback-label{font-size:.78rem;color:var(--text-md);width:100%;text-align:center;margin-bottom:.2rem}
.review-done{text-align:center;padding:3.5rem 2rem}
.done-icon{font-size:2.2rem;color:var(--accent);margin-bottom:.9rem}
.review-done h3{font-size:1.35rem;margin-bottom:.45rem}
.review-done p{color:var(--text-md);margin-bottom:1.4rem}

/* ── Playlist ── */
.playlist-controls{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap;margin-bottom:1.4rem}
.toggle-label{display:flex;align-items:center;gap:.35rem;font-size:.83rem;color:var(--text-md);cursor:pointer}
.toggle-label input[type="checkbox"]{accent-color:var(--accent);width:15px;height:15px}
.loop-counter{font-size:.8rem;color:var(--text-lo)}
.loop-counter strong{color:var(--accent)}
.playlist-player{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:1.4rem 1.8rem;margin-bottom:1.8rem;text-align:center}
.np-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-lo);margin-bottom:.45rem}
.np-text{font-size:1.1rem;font-weight:600;margin-bottom:.25rem}
.np-translation{font-size:.88rem;color:var(--accent);margin-bottom:.9rem}
.np-progress{height:3px;background:var(--surface-3);border-radius:2px;overflow:hidden}
.np-bar{height:100%;width:0;background:var(--accent);transition:width .3s}
.playlist-items{display:flex;flex-direction:column;gap:.45rem}
.playlist-item{display:flex;align-items:center;gap:.65rem;padding:.65rem .9rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);font-size:.85rem}
.playlist-item.pi-active{border-color:var(--accent);background:var(--accent-glow)}
.pi-num{font-family:var(--mono);font-size:.72rem;color:var(--text-lo);flex-shrink:0;width:26px}
.pi-text{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pi-badge{font-size:.7rem;padding:.12rem .45rem;border-radius:20px;background:var(--surface-3);color:var(--text-md);flex-shrink:0}

/* ── Settings ── */
.settings-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:1.1rem}
.settings-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:1.3rem}
.settings-card h3{font-size:.92rem;font-weight:700;margin-bottom:.45rem}
.settings-card p{font-size:.83rem;color:var(--text-md);margin-bottom:.9rem}
.settings-actions{display:flex;gap:.65rem;flex-wrap:wrap}
.tts-test{display:flex;gap:.45rem;margin-top:.7rem}
.tts-test input{flex:1}
.danger-zone{border-color:rgba(248,81,73,.3)}
.danger-zone h3{color:var(--red)}
.stats-display{display:flex;flex-direction:column;gap:.45rem}
.stat-row{display:flex;justify-content:space-between;font-size:.83rem}
.stat-row span:last-child{color:var(--accent);font-weight:600}

/* Deck management */
.deck-list{display:flex;flex-direction:column;gap:.45rem;margin-bottom:.75rem}
.deck-item{display:flex;align-items:center;gap:.55rem;padding:.5rem .75rem;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);font-size:.83rem}
.deck-color{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.deck-name{flex:1}
.deck-count{font-size:.72rem;color:var(--text-lo)}
.deck-add-form{display:flex;gap:.5rem;margin-top:.5rem}
.deck-add-form input{flex:1}

/* ── Toast / Modal ── */
.toast{position:fixed;bottom:2rem;left:50%;transform:translateX(-50%) translateY(80px);background:var(--surface-3);border:1px solid var(--border-2);color:var(--text-hi);padding:.7rem 1.3rem;border-radius:var(--r-xl);font-size:.86rem;font-weight:500;z-index:9999;opacity:0;transition:transform .3s,opacity .3s;pointer-events:none;max-width:90vw;text-align:center}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast.success{border-color:var(--green);color:var(--green)}
.toast.error{border-color:var(--red);color:var(--red)}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:1000;backdrop-filter:blur(4px)}
.modal{background:var(--surface);border:1px solid var(--border-2);border-radius:var(--r-xl);padding:1.8rem;max-width:380px;width:90%}
.modal-msg{font-size:.93rem;margin-bottom:1.4rem;text-align:center}
.modal-actions{display:flex;gap:.65rem;justify-content:flex-end}

/* ── Utility ── */
.hidden{display:none!important}
.empty-state{color:var(--text-md);font-size:.88rem;padding:1.75rem 0}

/* ── Responsive ── */
@media(max-width:640px){
  .app-header{flex-wrap:wrap;padding:.55rem 1rem;gap:.6rem}
  .tab-btn{padding:.38rem .65rem;font-size:.76rem}
  .form-row{flex-direction:column}
  .settings-grid{grid-template-columns:1fr}
  .modules-grid{grid-template-columns:1fr}
  .study-header{flex-direction:column;align-items:flex-start}
  .card-text{font-size:1.1rem}
  .srs-card{padding:1.7rem 1.1rem}
  .app-main{padding:1.4rem .9rem 4rem}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important}}
EOF
echo "style.css: $(wc -l < /mnt/user-data/outputs/english-srs-app/style.css) linhas"
Saída

style.css: 278 linhas
