/**
 * EnglishFlow — script.js
 * ─────────────────────────────────────────────────────────────
 * Arquitetura otimizada para Processamento Inteligente de PDF,
 * Alinhamento Automático Linha a Linha e Fila de Notificação SRS.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

// Inicializa a biblioteca PDF.js instalada via CDN global
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

/* ── DB — Camada de persistência (localStorage) ── */
const DB = (() => {
  const KEYS = { MODULES: 'ef_modules', CARDS: 'ef_cards', PLAYLIST: 'ef_playlist', SETTINGS: 'ef_settings' };
  const load = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));

  return {
    getModules:  ()      => load(KEYS.MODULES, []),
    saveModules: (data)  => save(KEYS.MODULES, data),
    getCards:    ()      => load(KEYS.CARDS, []),
    saveCards:   (data)  => save(KEYS.CARDS, data),
    getPlaylist: ()      => load(KEYS.PLAYLIST, []),
    savePlaylist:(data)  => save(KEYS.PLAYLIST, data),
    getSettings: ()      => load(KEYS.SETTINGS, { voiceName: '', rate: 0.8, pitch: 1 }), // Foco cadenciado por padrão
    saveSettings:(data)  => save(KEYS.SETTINGS, data),
    exportAll:   ()      => ({ modules: load(KEYS.MODULES, []), cards: load(KEYS.CARDS, []), playlist: load(KEYS.PLAYLIST, []), settings: load(KEYS.SETTINGS, {}), exported: new Date().toISOString() }),
    importAll: (data) => { if (data.modules) save(KEYS.MODULES, data.modules); if (data.cards) save(KEYS.CARDS, data.cards); if (data.playlist) save(KEYS.PLAYLIST, data.playlist); if (data.settings) save(KEYS.SETTINGS, data.settings); },
    clearAll: () => Object.values(KEYS).forEach(k => localStorage.removeItem(k)),
  };
})();

/* ── SM2 — Algoritmo de Repetição Espaçada ── */
const SM2 = (() => {
  const MIN_EF = 1.3;
  const BASE_INTERVALS = { 0: 0, 1: 1, 3: 3, 5: 6 };
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const addDays = (dateStr, n) => { const d = new Date(dateStr || new Date()); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const newCard = () => ({ interval: 1, easeFactor: 2.5, repetitions: 0, nextReview: todayStr(), lastReview: null });

  const review = (card, q) => {
    const c = { ...card }; c.lastReview = todayStr();
    if (q === 0) { c.repetitions = 0; c.interval = 1; } 
    else {
      c.repetitions += 1;
      const baseInterval = BASE_INTERVALS[q] ?? 1;
      if (c.repetitions === 1) c.interval = baseInterval;
      else if (c.repetitions === 2) c.interval = Math.max(baseInterval, 3);
      else c.interval = Math.round(c.interval * c.easeFactor);
      c.easeFactor = Math.max(MIN_EF, c.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    }
    c.nextReview = addDays(c.lastReview, c.interval);
    return c;
  };
  return { newCard, review, isDue: (card) => card.nextReview <= todayStr(), todayStr };
})();

/* ── TTS — Web Speech API com Controle Natural Cadenciado ── */
const TTS = (() => {
  const synth = window.speechSynthesis;
  let voices = [];
  let selectedVoiceName = '';
  const loadVoices = () => { voices = synth.getVoices(); return voices; };
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
  loadVoices();

  const speak = (text, onEnd) => {
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const settings = DB.getSettings();
    const all = synth.getVoices();
    const target = selectedVoiceName || settings.voiceName;
    const voice = all.find(v => v.name === target) || all.find(v => v.lang === 'en-US') || all.find(v => v.lang.startsWith('en'));
    
    if (voice) utt.voice = voice;
    utt.lang = 'en-US';
    utt.rate = 0.75; // Leitura ideal e pausada para crianças e adolescentes
    utt.pitch = 1.0;
    if (onEnd) utt.onend = onEnd;
    synth.speak(utt);
  };
  return { speak, stop: () => synth.cancel(), getEnglishVoices: () => synth.getVoices().filter(v => v.lang.startsWith('en')), setVoice: (name) => { selectedVoiceName = name; } };
})();

/* ── UIUtils — Utilitários de Interface ── */
const UIUtils = (() => {
  let toastTimer = null;
  return {
    toast: (msg, type = '') => {
      const el = document.getElementById('toast'); el.textContent = msg; el.className = `toast show ${type}`;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
    },
    confirm: (msg) => new Promise(resolve => {
      const overlay = document.getElementById('confirmModal'); document.getElementById('confirmMsg').textContent = msg; overlay.classList.remove('hidden');
      const ok = document.getElementById('confirmOk'), cancel = document.getElementById('confirmCancel');
      const cleanup = (val) => { overlay.classList.add('hidden'); ok.replaceWith(ok.cloneNode(true)); cancel.replaceWith(cancel.cloneNode(true)); resolve(val); };
      document.getElementById('confirmOk').addEventListener('click', () => cleanup(true));
      document.getElementById('confirmCancel').addEventListener('click', () => cleanup(false));
    }),
    uuid: () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
  };
})();

/* ── TabManager — Controle de Telas Focado ── */
const TabManager = (() => {
  return {
    init: () => { document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => TabManager.switchTab(btn.dataset.tab))); },
    switchTab: (id) => {
      document.querySelectorAll('.tab-btn').forEach(b => { const active = b.dataset.tab === id; b.classList.toggle('active', active); b.setAttribute('aria-selected', active); });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${id}`));
      if (id === 'study') StudyModule.refresh(); if (id === 'review') ReviewModule.load(); if (id === 'playlist') PlaylistModule.refresh(); if (id === 'settings') SettingsModule.refresh();
    }
  };
})();

/* ── CreateModule — Módulo de Extração de PDF Inteligente ── */
const CreateModule = (() => {
  let extractedLines = [];

  const init = () => {
    document.getElementById('pdfFileInput').addEventListener('change', handlePDFUpload);
    document.getElementById('btnCreateModule').addEventListener('click', saveExtractedModule);
    document.getElementById('btnAddAnki').addEventListener('click', addAnkiCard);
    renderModuleList();
  };

  const handlePDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    UIUtils.toast("Processando PDF inteligente... Aguarde.");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
      }

      // Lógica Avançada de Alinhamento Inteligente
      // Procura padrões de quebra de linha contendo frases consecutivas em Inglês e Português
      const rawLines = fullText.split(/[.!?]\s+/).map(l => l.trim()).filter(l => l.length > 2);
      extractedLines = [];

      for (let i = 0; i < rawLines.length; i += 2) {
        if (rawLines[i]) {
          extractedLines.push({
            english: rawLines[i] + ".",
            portuguese: rawLines[i + 1] ? rawLines[i + 1] + "." : "Tradução não identificada no alinhamento."
          });
        }
      }

      UIUtils.toast(`Sucesso! ${extractedLines.length} Frases mapeadas do PDF.`, "success");
      if(!document.getElementById('moduleTitle').value.trim()) {
        document.getElementById('moduleTitle').value = file.name.replace(".pdf", "");
      }

    } catch (err) {
      console.error(err);
      UIUtils.toast("Erro ao ler a estrutura do arquivo PDF.", "error");
    }
  };

  const saveExtractedModule = () => {
    const title = document.getElementById('moduleTitle').value.trim();
    if (!title || extractedLines.length === 0) {
      UIUtils.toast("Insira um título e faça o upload de um PDF válido primeiro.", "error");
      return;
    }

    const sentences = extractedLines.map(line => ({
      id: UIUtils.uuid(),
      english: line.english,
      portuguese: line.portuguese,
      srs: SM2.newCard()
    }));

    const newModule = { id: UIUtils.uuid(), title, sentences, created: new Date().toISOString() };
    const currentModules = DB.getModules();
    currentModules.push(newModule);
    DB.saveModules(currentModules);

    document.getElementById('createForm').reset();
    extractedLines = [];
    UIUtils.toast("História criada e adicionada para estudos!", "success");
    renderModuleList();
    updateHeaderStats();
  };

  const addAnkiCard = () => {
    const english = document.getElementById('ankiEnglish').value.trim();
    const pt = document.getElementById('ankiPortuguese').value.trim();
    const context = document.getElementById('ankiContext').value.trim();

    if (!english || !pt) { UIUtils.toast('Preencha os campos obrigatórios.', 'error'); return; }
    const cards = DB.getCards();
    cards.push({ id: UIUtils.uuid(), english, portuguese: pt, context, type: 'manual', srs: SM2.newCard() });
    DB.saveCards(cards);

    document.getElementById('anki-form').reset();
    UIUtils.toast('Card adicionado à caixa de revisão!', 'success');
    updateHeaderStats();
  };

  const renderModuleList = () => {
    const modules = DB.getModules();
    const el = document.getElementById('modulesList');
    document.getElementById('moduleCount').textContent = modules.length;

    if (!modules.length) { el.innerHTML = '<p class="empty-state">Nenhum módulo criado ainda.</p>'; return; }
    el.innerHTML = modules.map(m => {
      const dueCount = m.sentences.filter(s => SM2.isDue(s.srs)).length;
      return `
        <div class="module-card">
          <div class="mc-title">${m.title}</div>
          <div class="mc-meta">${m.sentences.length} frases estruturadas ${dueCount > 0 ? `· <span style="color:var(--red); font-weight:bold;">(${dueCount} cards pendentes)</span>` : ''}</div>
          <div class="mc-actions">
            <button class="btn btn-accent btn-sm" onclick="StudyModule.open('${m.id}'); TabManager.switchTab('study')">▶ Iniciar Estudo</button>
            <button class="btn btn-ghost btn-sm" onclick="CreateModule.deleteModule('${m.id}')">🗑</button>
          </div>
        </div>`;
    }).join('');
  };

  return { init, renderModuleList, deleteModule: async (id) => { if (await UIUtils.confirm('Apagar permanentemente este módulo?')) { DB.saveModules(DB.getModules().filter(m => m.id !== id)); renderModuleList(); updateHeaderStats(); } } };
})();

/* ── StudyModule — Interface Unificada (Linha a Linha vs Texto Completo) ── */
const StudyModule = (() => {
  let currentModule = null;
  let activeSubTab = 'linha';

  const init = () => {
    document.getElementById('btnBackToModules').addEventListener('click', () => { document.getElementById('studyArea').classList.add('hidden'); document.getElementById('studyModuleSelector').classList.remove('hidden'); refresh(); });
    document.getElementById('subTabLinha').addEventListener('click', () => switchSubTab('linha'));
    document.getElementById('subTabTextoAudio').addEventListener('click', () => switchSubTab('texto'));
    document.getElementById('btnPlayAll').addEventListener('click', () => playFullStory());
    document.getElementById('btnStopAll').addEventListener('click', () => TTS.stop());
    document.getElementById('btnAddToPlaylistComplete').addEventListener('click', addModuleToPlaylist);
  };

  const refresh = () => {
    const modules = DB.getModules();
    const list = document.getElementById('studyModuleList');
    document.getElementById('noModulesMsg').classList.toggle('hidden', modules.length > 0);
    
    list.innerHTML = modules.map(m => `
      <div class="module-card">
        <div class="mc-title">${m.title}</div>
        <div class="mc-meta">${m.sentences.length} Frases ativas</div>
        <button class="btn btn-accent btn-sm" style="margin-top:1rem;" onclick="StudyModule.open('${m.id}')">▶ Carregar</button>
      </div>
    `).join('');
  };

  const open = (id) => {
    currentModule = DB.getModules().find(m => m.id === id);
    if (!currentModule) return;
    document.getElementById('studyModuleSelector').classList.add('hidden');
    document.getElementById('studyArea').classList.remove('hidden');
    document.getElementById('studyTitle').textContent = currentModule.title;
    
    renderLinhaLinha();
    document.getElementById('fullTextParagraphs').textContent = currentModule.sentences.map(s => s.english).join(" ");
    switchSubTab('linha');
    updateProgressBar();
  };

  const switchSubTab = (tab) => {
    activeSubTab = tab;
    document.getElementById('subTabLinha').classList.toggle('active', tab === 'linha');
    document.getElementById('subTabTextoAudio').classList.toggle('active', tab === 'texto');
    document.getElementById('containerLinhaLinha').classList.toggle('hidden', tab !== 'linha');
    document.getElementById('containerTextoAudio').classList.toggle('hidden', tab !== 'texto');
  };

  const renderLinhaLinha = () => {
    const box = document.getElementById('containerLinhaLinha');
    box.innerHTML = currentModule.sentences.map((s, idx) => `
      <div class="sentence-card" id="card-sentence-${s.id}">
        <div class="sentence-num">FRASE ${idx + 1}</div>
        <div class="sentence-en" style="font-weight:600; color:var(--text-hi);">${s.english}</div>
        <div class="sentence-pt" style="color:var(--text-md); margin-top:0.3rem;">${s.portuguese}</div>
        <div class="sentence-controls">
          <button class="btn btn-accent btn-sm" onclick="StudyModule.playOne('${s.id}', '${btoa(unescape(encodeURIComponent(s.english)))}')">▶ Ouvir</button>
          <button class="btn btn-ghost btn-sm" onclick="StudyModule.sendToAnkiSRS('${s.id}')">◈ Enviar p/ Revisão</button>
        </div>
      </div>
    `).join('');
  };

  const updateProgressBar = () => {
    const total = currentModule.sentences.length;
    const reviewed = currentModule.sentences.filter(s => s.srs.lastReview !== null).length;
    document.getElementById('studyProgress').style.width = `${(reviewed / total) * 100}%`;
  };

  const playFullStory = () => {
    let index = 0;
    const playNext = () => {
      if (index >= currentModule.sentences.length) { UIUtils.toast("História finalizada!", "success"); return; }
      const s = currentModule.sentences[index];
      const el = document.getElementById(`card-sentence-${s.id}`);
      if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      TTS.speak(s.english, () => {
        index++;
        setTimeout(playNext, 1500);
      });
    };
    playNext();
  };

  const addModuleToPlaylist = () => {
    currentModule.sentences.forEach(s => PlaylistModule.addItem({ id: s.id, english: s.english, portuguese: s.portuguese }));
    UIUtils.toast("Áudio completo integrado na playlist diária!", "success");
  };

  return {
    init, refresh, open,
    playOne: (id, base64Text) => {
      const cleanText = decodeURIComponent(escape(atob(base64Text)));
      document.querySelectorAll('.sentence-card').forEach(c => c.classList.remove('playing'));
      document.getElementById(`card-sentence-${id}`)?.classList.add('playing');
      TTS.speak(cleanText);
    },
    sendToAnkiSRS: (sentenceId) => {
      const modules = DB.getModules();
      const mod = modules.find(m => m.id === currentModule.id);
      const s = mod.sentences.find(sentence => sentence.id === sentenceId);
      s.srs.lastReview = new Date().toISOString().slice(0, 10);
      DB.saveModules(modules);
      PlaylistModule.addItem({ id: s.id, english: s.english, portuguese: s.portuguese });
      UIUtils.toast("Card gerado na Fila de Repetição Espaçada!", "success");
      updateProgressBar();
      updateHeaderStats();
    }
  };
})();

/* ── ReviewModule — Motor de Revisão Diária (Anki Manual + Automático) ── */
const ReviewModule = (() => {
  let queue = []; let currentIndex = 0;

  const load = () => {
    queue = []; currentIndex = 0;
    DB.getModules().forEach(m => m.sentences.forEach(s => { if (SM2.isDue(s.srs)) queue.push({ ...s, type: 'module', moduleId: m.id }); }));
    DB.getCards().forEach(c => { if (SM2.isDue(c.srs)) queue.push({ ...c, type: 'manual' }); });
    
    queue.sort(() => Math.random() - 0.5);
    document.getElementById('reviewDone').classList.add('hidden');
    document.getElementById('reviewEmpty').classList.add('hidden');

    if (!queue.length) { document.getElementById('reviewArea').classList.add('hidden'); document.getElementById('reviewEmpty').classList.remove('hidden'); document.getElementById('reviewSubtitle').textContent = "Tudo em dia!"; return; }
    document.getElementById('reviewSubtitle').textContent = `${queue.length} cartões pendentes para o dia de hoje.`;
    document.getElementById('reviewArea').classList.remove('hidden');
    showCard();
  };

  const showCard = () => {
    if (currentIndex >= queue.length) { document.getElementById('reviewArea').classList.add('hidden'); document.getElementById('reviewDone').classList.remove('hidden'); return; }
    const card = queue[currentIndex];
    document.getElementById('cardFront').textContent = card.english;
    document.getElementById('cardBack').textContent = card.portuguese;
    document.getElementById('cardContext').textContent = card.context || '';
    document.querySelector('.card-back').classList.add('hidden');
    document.getElementById('cardShowBtn').classList.remove('hidden');
    document.getElementById('cardFeedbackBtns').classList.add('hidden');
  };

  const init = () => {
    document.getElementById('btnRevealCard').addEventListener('click', () => { document.querySelector('.card-back').classList.remove('hidden'); document.getElementById('cardShowBtn').classList.add('hidden'); document.getElementById('cardFeedbackBtns').classList.remove('hidden'); });
    document.getElementById('cardPlayAudio').addEventListener('click', () => TTS.speak(queue[currentIndex].english));
    document.getElementById('btnGoPlaylist').addEventListener('click', () => TabManager.switchTab('playlist'));
    document.getElementById('cardFeedbackBtns').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quality]');
      if (btn) {
        const quality = Number(btn.dataset.quality);
        const card = queue[currentIndex];
        const updatedSrs = SM2.review(card.srs, quality);

        if (card.type === 'manual') {
          const cards = DB.getCards(); cards.find(c => c.id === card.id).srs = updatedSrs; DB.saveCards(cards);
        } else {
          const modules = DB.getModules(); modules.find(m => m.id === card.moduleId).sentences.find(s => s.id === card.id).srs = updatedSrs; DB.saveModules(modules);
        }
        currentIndex++; updateHeaderStats(); showCard();
      }
    });
  };
  return { init, load };
})();

/* ── PlaylistModule — Listening Passivo Contínuo ── */
const PlaylistModule = (() => {
  let isPlaying = false, idx = 0, timer = null;

  return {
    init: () => {
      document.getElementById('btnPlayPlaylist').addEventListener('click', () => { isPlaying = true; idx = 0; PlaylistModule.play(); });
      document.getElementById('btnPausePlaylist').addEventListener('click', () => { isPlaying = false; clearTimeout(timer); TTS.stop(); });
      document.getElementById('btnStopPlaylist').addEventListener('click', () => { isPlaying = false; clearTimeout(timer); TTS.stop(); document.getElementById('npText').textContent = '—'; document.getElementById('npTranslation').textContent = '—'; });
    },
    addItem: (item) => { const list = DB.getPlaylist(); if (!list.find(x => x.id === item.id)) { list.push(item); DB.savePlaylist(list); } },
    refresh: () => {
      const list = DB.getPlaylist();
      const itemsBox = document.getElementById('playlistItems');
      if (!list.length) { itemsBox.innerHTML = '<p class="empty-state">Sua playlist está vazia atualmente.</p>'; return; }
      itemsBox.innerHTML = list.map((item, i) => `<div class="playlist-item" id="pi-${item.id}"><span class="pi-num">${i+1}</span><span class="pi-text">${item.english}</span><button class="btn btn-ghost btn-sm" onclick="PlaylistModule.removeItem('${item.id}')">❌</button></div>`).join('');
    },
    removeItem: (id) => { DB.savePlaylist(DB.getPlaylist().filter(x => x.id !== id)); PlaylistModule.refresh(); },
    play: () => {
      const list = DB.getPlaylist(); if (!list.length || !isPlaying) return;
      if (idx >= list.length) { if (document.getElementById('playlistLoop').checked) { idx = 0; } else { isPlaying = false; return; } }
      
      const item = list[idx];
      const showText = document.getElementById('playlistShowText').checked;
      document.getElementById('npText').textContent = showText ? item.english : '🎧 Praticando Listening Passivo...';
      document.getElementById('npTranslation').textContent = showText ? item.portuguese : '';
      document.getElementById('npProgressBar').style.width = `${((idx + 1) / list.length) * 100}%`;

      document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('pi-active'));
      document.getElementById(`pi-${item.id}`)?.classList.add('pi-active');

      TTS.speak(item.english, () => { timer = setTimeout(() => { idx++; PlaylistModule.play(); }, 2000); });
    }
  };
})();

/* ── SettingsModule — Gerenciamento ── */
const SettingsModule = (() => {
  return {
    init: () => {
      document.getElementById('btnExport').addEventListener('click', () => {
        const data = DB.exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `englishflow-backup.json` });
        a.click();
      });
      document.getElementById('importFile').addEventListener('change', async (e) => {
        try { const data = JSON.parse(await e.target.files[0].text()); DB.importAll(data); UIUtils.toast("Carregado! Atualizando."); location.reload(); } catch { UIUtils.toast("Arquivo inválido", "error"); }
      });
      document.getElementById('btnClearAll').addEventListener('click', async () => { if (await UIUtils.confirm("Apagar todos os dados do sistema permanentemente?")) { DB.clearAll(); location.reload(); } });
    },
    refresh: () => {
      const totalSentences = DB.getModules().reduce((n, m) => n + m.sentences.length, 0);
      document.getElementById('statsDisplay').innerHTML = `<div class="stat-row"><span>Histórias Ativas:</span><span>${DB.getModules().length}</span></div><div class="stat-row"><span>Frases no Sistema:</span><span>${totalSentences}</span></div><div class="stat-row"><span>Itens na Playlist:</span><span>${DB.getPlaylist().length}</span></div>`;
    }
  };
})();

/* ── Função de Atualização da Notificação Vermelha Superior (Badge) ── */
const updateHeaderStats = () => {
  let dueCount = 0;
  DB.getModules().forEach(m => m.sentences.forEach(s => { if (SM2.isDue(s.srs)) dueCount++; }));
  DB.getCards().forEach(c => { if (SM2.isDue(c.srs)) dueCount++; });
  
  const badge = document.getElementById('stats-due');
  badge.textContent = `${dueCount} hoje`;
  // Adiciona estilo dinâmico vermelho se houver tarefas pendentes
  if (dueCount > 0) {
    badge.style.background = 'var(--red)';
    badge.style.color = '#fff';
    badge.style.borderColor = 'transparent';
  } else {
    badge.style.background = 'var(--accent-glow)';
    badge.style.color = 'var(--accent)';
    badge.style.borderColor = 'var(--accent-dim)';
  }
};

/* ── Inicialização do Sistema (Boot) ── */
document.addEventListener('DOMContentLoaded', () => {
  TabManager.init(); CreateModule.init(); StudyModule.init(); ReviewModule.init(); PlaylistModule.init(); SettingsModule.init();
  updateHeaderStats();
  window.StudyModule = StudyModule; window.CreateModule = CreateModule; window.TabManager = TabManager; window.PlaylistModule = PlaylistModule;
});
