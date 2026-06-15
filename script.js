/**
 * EnglishFlow — script.js
 * ─────────────────────────────────────────────────────────────
 * Arquitetura vanilla ES2022+ modular
 * Sem dependências externas — localStorage para persistência
 *
 * MÓDULOS:
 *   DB          → abstração do localStorage
 *   SM2         → algoritmo de repetição espaçada SuperMemo-2
 *   TTS         → Web Speech API (text-to-speech)
 *   UIUtils     → toast, modal, helpers de DOM
 *   TabManager  → controle de abas
 *   CreateModule → criação de histórias e cards avulsos
 *   StudyModule → interface de estudo fragmentado
 *   ReviewModule → revisão diária SRS
 *   PlaylistModule → player contínuo
 *   SettingsModule → backup, voz, estatísticas
 *
 * GANCHOS i+1 (marcados com // [i+1]):
 *   Ao selecionar texto nos sentence-cards, dispare pesquisa
 *   por frases contendo essa palavra e adicione ao SRS.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   DB — Camada de persistência (localStorage)
═══════════════════════════════════════════════════════════════ */
const DB = (() => {
  const KEYS = {
    MODULES:  'ef_modules',
    CARDS:    'ef_cards',
    PLAYLIST: 'ef_playlist',
    SETTINGS: 'ef_settings',
  };

  const load = (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };

  const save = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  return {
    getModules:  ()      => load(KEYS.MODULES, []),
    saveModules: (data)  => save(KEYS.MODULES, data),
    getCards:    ()      => load(KEYS.CARDS, []),
    saveCards:   (data)  => save(KEYS.CARDS, data),
    getPlaylist: ()      => load(KEYS.PLAYLIST, []),
    savePlaylist:(data)  => save(KEYS.PLAYLIST, data),
    getSettings: ()      => load(KEYS.SETTINGS, { voiceName: '', rate: 1, pitch: 1 }),
    saveSettings:(data)  => save(KEYS.SETTINGS, data),
    exportAll:   ()      => ({
      modules:  load(KEYS.MODULES, []),
      cards:    load(KEYS.CARDS, []),
      playlist: load(KEYS.PLAYLIST, []),
      settings: load(KEYS.SETTINGS, {}),
      exported: new Date().toISOString(),
    }),
    importAll: (data) => {
      if (data.modules)  save(KEYS.MODULES,  data.modules);
      if (data.cards)    save(KEYS.CARDS,    data.cards);
      if (data.playlist) save(KEYS.PLAYLIST, data.playlist);
      if (data.settings) save(KEYS.SETTINGS, data.settings);
    },
    clearAll: () => Object.values(KEYS).forEach(k => localStorage.removeItem(k)),
  };
})();

/* ═══════════════════════════════════════════════════════════════
   SM2 — Algoritmo SuperMemo-2 simplificado
   q = qualidade de resposta (0-5)
     0: Errei / Again → reseta ao dia seguinte
     1: Difícil        → 1 dia
     3: Bom            → 3 dias × EF
     5: Fácil          → 6 dias × EF
═══════════════════════════════════════════════════════════════ */
const SM2 = (() => {
  const MIN_EF = 1.3;
  const BASE_INTERVALS = { 0: 0, 1: 1, 3: 3, 5: 6 };

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const addDays = (dateStr, n) => {
    const d = new Date(dateStr || new Date());
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  /**
   * Cria metadados SRS iniciais para um card novo.
   */
  const newCard = () => ({
    interval:    1,
    easeFactor:  2.5,
    repetitions: 0,
    nextReview:  todayStr(),
    lastReview:  null,
  });

  /**
   * Aplica SM-2 e retorna metadados atualizados.
   * @param {Object} card - metadados atuais
   * @param {number} q    - qualidade (0, 1, 3, 5)
   */
  const review = (card, q) => {
    const c = { ...card };
    c.lastReview = todayStr();

    if (q === 0) {
      // Errou: reseta repetições, próxima revisão amanhã
      c.repetitions = 0;
      c.interval    = 1;
    } else {
      c.repetitions += 1;
      const baseInterval = BASE_INTERVALS[q] ?? 1;

      if (c.repetitions === 1) {
        c.interval = baseInterval;
      } else if (c.repetitions === 2) {
        c.interval = Math.max(baseInterval, 3);
      } else {
        c.interval = Math.round(c.interval * c.easeFactor);
      }

      // Atualiza EF (fórmula SM-2 padrão)
      c.easeFactor = Math.max(MIN_EF, c.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    }

    c.nextReview = addDays(c.lastReview, c.interval);
    return c;
  };

  /**
   * Retorna true se o card deve ser revisado hoje ou antes.
   */
  const isDue = (card) => card.nextReview <= todayStr();

  return { newCard, review, isDue, todayStr };
})();

/* ═══════════════════════════════════════════════════════════════
   TTS — Web Speech API
═══════════════════════════════════════════════════════════════ */
const TTS = (() => {
  const synth = window.speechSynthesis;
  let voices = [];
  let selectedVoiceName = '';

  const loadVoices = () => {
    voices = synth.getVoices();
    return voices;
  };

  // Vozes podem carregar assincronamente
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = loadVoices;
  }
  loadVoices();

  const getEnglishVoices = () => {
    const all = synth.getVoices();
    return all.filter(v => v.lang.startsWith('en'));
  };

  const setVoice = (name) => { selectedVoiceName = name; };

  const speak = (text, onEnd) => {
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const settings = DB.getSettings();

    // Tenta usar a voz salva; fallback para qualquer voz en-US
    const all = synth.getVoices();
    const target = selectedVoiceName || settings.voiceName;
    const voice = all.find(v => v.name === target)
      || all.find(v => v.lang === 'en-US')
      || all.find(v => v.lang.startsWith('en'));
    if (voice) utt.voice = voice;

    utt.lang  = 'en-US';
    utt.rate  = settings.rate  || 0.9;
    utt.pitch = settings.pitch || 1;

    if (onEnd) utt.onend = onEnd;
    synth.speak(utt);
  };

  const stop = () => synth.cancel();

  return { speak, stop, getEnglishVoices, setVoice, loadVoices };
})();

/* ═══════════════════════════════════════════════════════════════
   UIUtils — helpers de interface
═══════════════════════════════════════════════════════════════ */
const UIUtils = (() => {
  let toastTimer = null;

  const toast = (msg, type = '', duration = 3000) => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  };

  const confirm = (msg) => new Promise(resolve => {
    const overlay = document.getElementById('confirmModal');
    document.getElementById('confirmMsg').textContent = msg;
    overlay.classList.remove('hidden');

    const ok     = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');

    const cleanup = (val) => {
      overlay.classList.add('hidden');
      ok.replaceWith(ok.cloneNode(true));
      cancel.replaceWith(cancel.cloneNode(true));
      resolve(val);
    };
    document.getElementById('confirmOk').addEventListener('click',    () => cleanup(true));
    document.getElementById('confirmCancel').addEventListener('click', () => cleanup(false));
  });

  const uuid = () => crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });

  // Converte texto em array de frases (por linha ou por ponto + espaço)
  const splitSentences = (text) => {
    if (!text.trim()) return [];
    const byLine = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (byLine.length > 1) return byLine;
    // Se for um bloco único, tenta dividir por ponto
    return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  };

  return { toast, confirm, uuid, splitSentences };
})();

/* ═══════════════════════════════════════════════════════════════
   TabManager — troca de abas com ARIA
═══════════════════════════════════════════════════════════════ */
const TabManager = (() => {
  const init = () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  };

  const switchTab = (id) => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      const active = b.dataset.tab === id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${id}`);
    });

    // Atualiza sub-módulos ao trocar de aba
    if (id === 'study')    StudyModule.refresh();
    if (id === 'review')   ReviewModule.load();
    if (id === 'playlist') PlaylistModule.refresh();
    if (id === 'settings') SettingsModule.refresh();
  };

  return { init, switchTab };
})();

/* ═══════════════════════════════════════════════════════════════
   CreateModule — criar módulos e cards avulsos
═══════════════════════════════════════════════════════════════ */
const CreateModule = (() => {
  const init = () => {
    // Toggle upload area
    document.querySelectorAll('[name="audioMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.getElementById('uploadArea').classList.toggle(
          'hidden', radio.value !== 'upload' || !radio.checked
        );
      });
    });

    // Criar módulo
    document.getElementById('btnCreateModule').addEventListener('click', createModule);

    // Card avulso (Anki)
    document.getElementById('btnAddAnki').addEventListener('click', addAnkiCard);

    renderModuleList();
  };

  const createModule = () => {
    const title   = document.getElementById('moduleTitle').value.trim();
    const english = document.getElementById('englishText').value.trim();
    const ptBr    = document.getElementById('portugueseText').value.trim();

    if (!title || !english) {
      UIUtils.toast('Preencha o título e o texto em inglês.', 'error');
      return;
    }

    const enSentences = UIUtils.splitSentences(english);
    const ptSentences = UIUtils.splitSentences(ptBr);

    // Emparelha frases inglês ↔ tradução
    const sentences = enSentences.map((en, i) => ({
      id:          UIUtils.uuid(),
      english:     en,
      portuguese:  ptSentences[i] || '',
      audioUrl:    '',
      srs:         SM2.newCard(),   // metadados SRS para cada frase
    }));

    const module = {
      id:        UIUtils.uuid(),
      title,
      sentences,
      audioMode: document.querySelector('[name="audioMode"]:checked').value,
      created:   new Date().toISOString(),
    };

    const modules = DB.getModules();
    modules.push(module);
    DB.saveModules(modules);

    // Reset form
    document.getElementById('createForm').reset();
    document.getElementById('uploadArea').classList.add('hidden');

    UIUtils.toast(`Módulo "${title}" criado com ${sentences.length} frases!`, 'success');
    renderModuleList();
    updateHeaderStats();
  };

  const addAnkiCard = () => {
    const english  = document.getElementById('ankiEnglish').value.trim();
    const pt       = document.getElementById('ankiPortuguese').value.trim();
    const context  = document.getElementById('ankiContext').value.trim();

    if (!english || !pt) {
      UIUtils.toast('Preencha a frente e o verso do card.', 'error');
      return;
    }

    const card = {
      id:         UIUtils.uuid(),
      english,
      portuguese: pt,
      context,
      audioUrl:   '',
      type:       'manual',
      srs:        SM2.newCard(),
    };

    const cards = DB.getCards();
    cards.push(card);
    DB.saveCards(cards);

    document.getElementById('anki-form').reset();
    UIUtils.toast('Card adicionado ao SRS!', 'success');
    updateHeaderStats();
  };

  const deleteModule = async (id) => {
    const ok = await UIUtils.confirm('Apagar este módulo? Esta ação é permanente.');
    if (!ok) return;
    const modules = DB.getModules().filter(m => m.id !== id);
    DB.saveModules(modules);
    renderModuleList();
    UIUtils.toast('Módulo apagado.', '');
    updateHeaderStats();
  };

  const renderModuleList = () => {
    const modules = DB.getModules();
    const el = document.getElementById('modulesList');
    document.getElementById('moduleCount').textContent = modules.length;

    if (!modules.length) {
      el.innerHTML = '<p class="empty-state">Nenhum módulo criado ainda.</p>';
      return;
    }

    el.innerHTML = modules.map(m => {
      const dueCount = m.sentences.filter(s => SM2.isDue(s.srs)).length;
      return `
        <div class="module-card" data-id="${m.id}">
          <div class="mc-title">${escHtml(m.title)}</div>
          <div class="mc-meta">
            ${m.sentences.length} frases
            ${dueCount > 0 ? `· <span style="color:var(--accent)">${dueCount} para revisar</span>` : ''}
          </div>
          <div class="mc-actions">
            <button class="btn btn-accent btn-sm"   onclick="StudyModule.open('${m.id}'); TabManager.switchTab('study')">▶ Estudar</button>
            <button class="btn btn-ghost btn-sm"    onclick="CreateModule.deleteModule('${m.id}')">🗑</button>
          </div>
        </div>`;
    }).join('');
  };

  return { init, renderModuleList, deleteModule };
})();

/* ═══════════════════════════════════════════════════════════════
   StudyModule — interface de estudo fragmentado
═══════════════════════════════════════════════════════════════ */
const StudyModule = (() => {
  let currentModule = null;
  let isPlayingAll  = false;
  let playIndex     = 0;
  const PAUSE_MS    = 2000;

  const init = () => {
    document.getElementById('btnBackToModules').addEventListener('click', backToList);
    document.getElementById('btnPlayAll').addEventListener('click', playAll);
    document.getElementById('btnStopAll').addEventListener('click', stopAll);
  };

  const refresh = () => {
    renderModuleSelector();
  };

  const renderModuleSelector = () => {
    const modules = DB.getModules();
    const list  = document.getElementById('studyModuleList');
    const noMsg = document.getElementById('noModulesMsg');
    const sel   = document.getElementById('studyModuleSelector');
    const area  = document.getElementById('studyArea');

    area.classList.add('hidden');
    sel.classList.remove('hidden');

    if (!modules.length) {
      list.innerHTML = '';
      noMsg.classList.remove('hidden');
      return;
    }
    noMsg.classList.add('hidden');

    list.innerHTML = modules.map(m => {
      const dueCount = m.sentences.filter(s => SM2.isDue(s.srs)).length;
      return `
        <div class="module-card" data-id="${m.id}">
          <div class="mc-title">${escHtml(m.title)}</div>
          <div class="mc-meta">
            ${m.sentences.length} frases
            ${dueCount > 0 ? `· <span style="color:var(--accent)">${dueCount} p/ revisar</span>` : ''}
          </div>
          <div class="mc-actions">
            <button class="btn btn-accent btn-sm" onclick="StudyModule.open('${m.id}')">▶ Estudar</button>
          </div>
        </div>`;
    }).join('');
  };

  const open = (moduleId) => {
    const modules = DB.getModules();
    currentModule = modules.find(m => m.id === moduleId);
    if (!currentModule) return;

    document.getElementById('studyModuleSelector').classList.add('hidden');
    document.getElementById('studyArea').classList.remove('hidden');
    document.getElementById('studyTitle').textContent = currentModule.title;

    renderSentences();
    updateProgress(0);
  };

  const renderSentences = () => {
    const list = document.getElementById('sentencesList');
    list.innerHTML = currentModule.sentences.map((s, i) => `
      <div class="sentence-card" id="sc-${s.id}" data-index="${i}">
        <div class="sentence-num"># ${String(i + 1).padStart(2, '0')}</div>

        <div class="sentence-en">${escHtml(s.english)}</div>

        <div class="sentence-controls">
          <button class="btn btn-ghost btn-sm" onclick="StudyModule.playSentence('${s.id}', ${i})">🔊 Ouvir</button>
          <button class="btn btn-ghost btn-sm" onclick="StudyModule.toggleTranslation('${s.id}')">👁 Tradução</button>
          <button class="btn btn-ghost btn-sm" onclick="StudyModule.showSRSFeedback('${s.id}')">◈ SRS</button>
        </div>

        <div class="sentence-translation-wrap" id="tr-${s.id}">
          <div class="sentence-pt">${escHtml(s.portuguese || '(sem tradução)')}</div>
        </div>

        <div class="sentence-srs-feedback hidden" id="srs-${s.id}">
          <span class="feedback-label" style="font-size:.75rem;color:var(--text-lo);">Marcar repetição:</span>
          <button class="btn btn-feedback btn-again btn-sm" onclick="StudyModule.applySRS('${s.id}', 0)">✗ Errei</button>
          <button class="btn btn-feedback btn-hard  btn-sm" onclick="StudyModule.applySRS('${s.id}', 1)">△ Difícil</button>
          <button class="btn btn-feedback btn-good  btn-sm" onclick="StudyModule.applySRS('${s.id}', 3)">○ Bom</button>
          <button class="btn btn-feedback btn-easy  btn-sm" onclick="StudyModule.applySRS('${s.id}', 5)">★ Fácil</button>
        </div>
      </div>
    `).join('');

    // [i+1] Hook: selecionar texto para pesquisar / adicionar ao SRS
    list.querySelectorAll('.sentence-en').forEach((el, i) => {
      el.addEventListener('mouseup', () => {
        const sel = window.getSelection()?.toString().trim();
        if (sel && sel.split(' ').length <= 4) {
          // Future: i1_lookup(sel, currentModule.sentences[i]);
          // console.log('[i+1] Palavra selecionada:', sel);
        }
      });
    });
  };

  const toggleTranslation = (sentenceId) => {
    const tr = document.getElementById(`tr-${sentenceId}`);
    tr.classList.toggle('visible');
  };

  const showSRSFeedback = (sentenceId) => {
    const el = document.getElementById(`srs-${sentenceId}`);
    el.classList.toggle('hidden');
  };

  const playSentence = (sentenceId, index) => {
    const s = currentModule.sentences[index];
    highlightCard(sentenceId);
    if (s.audioUrl) {
      const audio = new Audio(s.audioUrl);
      audio.play();
    } else {
      TTS.speak(s.english);
    }
  };

  const highlightCard = (sentenceId) => {
    document.querySelectorAll('.sentence-card').forEach(c => c.classList.remove('playing'));
    document.getElementById(`sc-${sentenceId}`)?.classList.add('playing');
  };

  const applySRS = (sentenceId, quality) => {
    const modules = DB.getModules();
    const mod = modules.find(m => m.id === currentModule.id);
    const sentence = mod.sentences.find(s => s.id === sentenceId);
    if (!sentence) return;

    sentence.srs = SM2.review(sentence.srs, quality);
    DB.saveModules(modules);
    currentModule = mod;

    // Adiciona à playlist
    PlaylistModule.addItem({ id: sentenceId, english: sentence.english, portuguese: sentence.portuguese });

    // Feedback visual
    const card = document.getElementById(`sc-${sentenceId}`);
    card?.classList.add('reviewed');
    document.getElementById(`srs-${sentenceId}`)?.classList.add('hidden');

    const labels = { 0: 'Errei — revisará amanhã', 1: 'Difícil — 1 dia', 3: 'Bom — 3 dias', 5: 'Fácil — 6 dias' };
    UIUtils.toast(labels[quality] || 'Revisado!', 'success');

    updateProgress(currentModule.sentences.filter(s => s.srs.lastReview).length);
    updateHeaderStats();
  };

  const updateProgress = (reviewed) => {
    const total = currentModule?.sentences.length || 1;
    const pct   = Math.round((reviewed / total) * 100);
    document.getElementById('studyProgress').style.width = `${pct}%`;
  };

  const playAll = () => {
    if (!currentModule) return;
    isPlayingAll = true;
    playIndex = 0;
    const mode = document.getElementById('playbackMode').value;

    // Oculta tradução se modo for apenas inglês / áudio
    document.querySelectorAll('.sentence-translation-wrap').forEach(el => {
      el.classList.toggle('visible', mode === 'dual');
    });
    document.getElementById('studyArea').dataset.playbackMode = mode;

    playNextSentence(mode);
  };

  const playNextSentence = (mode) => {
    if (!isPlayingAll || !currentModule) return;
    if (playIndex >= currentModule.sentences.length) {
      isPlayingAll = false;
      UIUtils.toast('Reprodução completa!', 'success');
      return;
    }

    const s = currentModule.sentences[playIndex];
    highlightCard(s.id);

    // Scroll suave
    document.getElementById(`sc-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const afterSpeak = () => {
      setTimeout(() => {
        playIndex++;
        playNextSentence(mode);
      }, PAUSE_MS);
    };

    if (s.audioUrl) {
      const audio = new Audio(s.audioUrl);
      audio.onended = afterSpeak;
      audio.play();
    } else {
      TTS.speak(s.english, afterSpeak);
    }
  };

  const stopAll = () => {
    isPlayingAll = false;
    TTS.stop();
    document.querySelectorAll('.sentence-card').forEach(c => c.classList.remove('playing'));
  };

  const backToList = () => {
    stopAll();
    currentModule = null;
    document.getElementById('studyArea').classList.add('hidden');
    document.getElementById('studyModuleSelector').classList.remove('hidden');
    renderModuleSelector();
  };

  return { init, refresh, open, playSentence, toggleTranslation, showSRSFeedback, applySRS };
})();

/* ═══════════════════════════════════════════════════════════════
   ReviewModule — revisão diária SRS
═══════════════════════════════════════════════════════════════ */
const ReviewModule = (() => {
  let queue = [];
  let currentIndex = 0;

  const load = () => {
    queue = buildQueue();
    currentIndex = 0;

    const subtitle = document.getElementById('reviewSubtitle');
    const area     = document.getElementById('reviewArea');
    const done     = document.getElementById('reviewDone');
    const empty    = document.getElementById('reviewEmpty');

    done.classList.add('hidden');
    empty.classList.add('hidden');

    if (!queue.length) {
      area.classList.add('hidden');
      empty.classList.remove('hidden');
      subtitle.textContent = 'Tudo em dia — volte amanhã!';
      return;
    }

    subtitle.textContent = `${queue.length} card${queue.length > 1 ? 's' : ''} para revisar hoje.`;
    area.classList.remove('hidden');
    showCard(0);
  };

  const buildQueue = () => {
    const all = [];

    // Frases de módulos
    DB.getModules().forEach(mod => {
      mod.sentences.forEach(s => {
        if (SM2.isDue(s.srs)) {
          all.push({
            id:         s.id,
            moduleId:   mod.id,
            english:    s.english,
            portuguese: s.portuguese,
            context:    '',
            type:       'module',
            srs:        s.srs,
          });
        }
      });
    });

    // Cards avulsos
    DB.getCards().forEach(c => {
      if (SM2.isDue(c.srs)) {
        all.push({ ...c, type: 'manual' });
      }
    });

    // Embaralha
    return all.sort(() => Math.random() - .5);
  };

  const showCard = (index) => {
    if (index >= queue.length) {
      finishReview();
      return;
    }

    const card  = queue[index];
    const front = document.getElementById('cardFront');
    const back  = document.getElementById('cardBack');
    const bback = document.querySelector('.card-back');
    const ctx   = document.getElementById('cardContext');

    front.textContent = card.english;
    document.getElementById('cardBack').textContent = card.portuguese;
    ctx.textContent   = card.context || '';

    bback.classList.add('hidden');
    document.getElementById('cardShowBtn').classList.remove('hidden');
    document.getElementById('cardFeedbackBtns').classList.add('hidden');
  };

  const revealCard = () => {
    document.querySelector('.card-back').classList.remove('hidden');
    document.getElementById('cardShowBtn').classList.add('hidden');
    document.getElementById('cardFeedbackBtns').classList.remove('hidden');
  };

  const applyFeedback = (quality) => {
    const card = queue[currentIndex];
    const updated = SM2.review(card.srs, quality);

    // Persiste no local correto
    if (card.type === 'manual') {
      const cards = DB.getCards();
      const found = cards.find(c => c.id === card.id);
      if (found) { found.srs = updated; DB.saveCards(cards); }
    } else {
      const modules = DB.getModules();
      const mod = modules.find(m => m.id === card.moduleId);
      if (mod) {
        const s = mod.sentences.find(s => s.id === card.id);
        if (s) { s.srs = updated; DB.saveModules(modules); }
      }
    }

    // Adiciona à playlist
    PlaylistModule.addItem({ id: card.id, english: card.english, portuguese: card.portuguese });

    currentIndex++;
    updateHeaderStats();
    showCard(currentIndex);
  };

  const finishReview = () => {
    document.getElementById('reviewArea').classList.add('hidden');
    document.getElementById('reviewDone').classList.remove('hidden');
    const msg = document.getElementById('reviewDoneMsg');
    msg.textContent = `Você revisou ${queue.length} card${queue.length > 1 ? 's' : ''} hoje. Ótimo trabalho!`;
  };

  const init = () => {
    document.getElementById('btnRevealCard').addEventListener('click', revealCard);

    document.getElementById('cardFeedbackBtns').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quality]');
      if (btn) applyFeedback(Number(btn.dataset.quality));
    });

    document.getElementById('cardPlayAudio').addEventListener('click', () => {
      const card = queue[currentIndex];
      if (card) TTS.speak(card.english);
    });

    document.getElementById('btnGoPlaylist').addEventListener('click', () => {
      TabManager.switchTab('playlist');
    });
  };

  return { init, load };
})();

/* ═══════════════════════════════════════════════════════════════
   PlaylistModule — player de listening passivo
═══════════════════════════════════════════════════════════════ */
const PlaylistModule = (() => {
  let isPlaying = false;
  let isPaused  = false;
  let current   = 0;
  let pauseTimer = null;
  const PAUSE_MS = 2000;

  const init = () => {
    document.getElementById('btnPlayPlaylist').addEventListener('click',  play);
    document.getElementById('btnPausePlaylist').addEventListener('click', pause);
    document.getElementById('btnStopPlaylist').addEventListener('click',  stop);
  };

  const addItem = (item) => {
    const playlist = DB.getPlaylist();
    if (!playlist.find(p => p.id === item.id)) {
      playlist.push(item);
      DB.savePlaylist(playlist);
    }
  };

  const refresh = () => renderItems();

  const renderItems = () => {
    const playlist = DB.getPlaylist();
    const el = document.getElementById('playlistItems');
    if (!playlist.length) {
      el.innerHTML = '<p class="empty-state">A playlist estará disponível após revisar frases no módulo de estudo ou na revisão diária.</p>';
      return;
    }
    el.innerHTML = playlist.map((item, i) => `
      <div class="playlist-item" id="pi-${item.id}">
        <span class="pi-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="pi-text">${escHtml(item.english)}</span>
        <span class="pi-badge">${escHtml(item.portuguese?.slice(0, 20) || '')}…</span>
      </div>
    `).join('');
  };

  const play = () => {
    const playlist = DB.getPlaylist();
    if (!playlist.length) { UIUtils.toast('A playlist está vazia. Estude algumas frases primeiro.', 'error'); return; }
    isPlaying = true;
    isPaused  = false;
    if (current >= playlist.length) current = 0;
    playNext();
  };

  const playNext = () => {
    if (!isPlaying || isPaused) return;
    const playlist = DB.getPlaylist();
    if (current >= playlist.length) {
      const loop = document.getElementById('playlistLoop').checked;
      if (loop) { current = 0; playNext(); }
      else { stop(); UIUtils.toast('Playlist concluída.', 'success'); }
      return;
    }

    const item = playlist[current];
    updateNowPlaying(item, current, playlist.length);

    // Highlight
    document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('pi-active'));
    document.getElementById(`pi-${item.id}`)?.classList.add('pi-active');

    TTS.speak(item.english, () => {
      pauseTimer = setTimeout(() => {
        current++;
        playNext();
      }, PAUSE_MS);
    });
  };

  const updateNowPlaying = (item, idx, total) => {
    const showText = document.getElementById('playlistShowText').checked;
    document.getElementById('npText').textContent = showText ? item.english : '🎧 Ouvindo…';
    document.getElementById('npTranslation').textContent = showText ? (item.portuguese || '') : '';
    const pct = Math.round(((idx + 1) / total) * 100);
    document.getElementById('npProgressBar').style.width = `${pct}%`;
  };

  const pause = () => {
    isPaused = !isPaused;
    if (isPaused) { TTS.stop(); clearTimeout(pauseTimer); }
    else          { playNext(); }
    UIUtils.toast(isPaused ? 'Pausado.' : 'Retomando…');
  };

  const stop = () => {
    isPlaying = false;
    isPaused  = false;
    current   = 0;
    clearTimeout(pauseTimer);
    TTS.stop();
    document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('pi-active'));
    document.getElementById('npText').textContent = '—';
    document.getElementById('npTranslation').textContent = '—';
    document.getElementById('npProgressBar').style.width = '0';
  };

  return { init, addItem, refresh };
})();

/* ═══════════════════════════════════════════════════════════════
   SettingsModule — backup, vozes, estatísticas
═══════════════════════════════════════════════════════════════ */
const SettingsModule = (() => {
  const init = () => {
    document.getElementById('btnExport').addEventListener('click', exportBackup);
    document.getElementById('importFile').addEventListener('change', importBackup);
    document.getElementById('btnClearAll').addEventListener('click', clearAll);
    document.getElementById('btnTestVoice').addEventListener('click', testVoice);
    document.getElementById('voiceSelector').addEventListener('change', (e) => {
      const settings = DB.getSettings();
      settings.voiceName = e.target.value;
      DB.saveSettings(settings);
      TTS.setVoice(e.target.value);
    });

    loadVoices();
  };

  const loadVoices = () => {
    const fill = () => {
      const voices = TTS.getEnglishVoices();
      const sel = document.getElementById('voiceSelector');
      const saved = DB.getSettings().voiceName;
      sel.innerHTML = voices.map(v =>
        `<option value="${escHtml(v.name)}" ${v.name === saved ? 'selected' : ''}>${escHtml(v.name)} (${v.lang})</option>`
      ).join('');
      if (!voices.length) sel.innerHTML = '<option>Nenhuma voz en encontrada</option>';
    };
    fill();
    // Reattempt quando vozes carregam async
    setTimeout(fill, 1000);
  };

  const testVoice = () => {
    const text = document.getElementById('ttsTestText').value || 'Hello! Testing voice.';
    TTS.speak(text);
  };

  const exportBackup = () => {
    const data = DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: `englishflow-backup-${SM2.todayStr()}.json`
    });
    a.click();
    URL.revokeObjectURL(url);
    UIUtils.toast('Backup exportado com sucesso!', 'success');
  };

  const importBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = await UIUtils.confirm('Importar este backup? Os dados atuais serão mesclados.');
    if (!ok) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      DB.importAll(data);
      UIUtils.toast('Backup importado! Recarregue a página.', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch {
      UIUtils.toast('Erro ao importar. Verifique o arquivo.', 'error');
    }
    e.target.value = '';
  };

  const clearAll = async () => {
    const ok = await UIUtils.confirm('Apagar TODOS os dados permanentemente? Isso não pode ser desfeito.');
    if (!ok) return;
    DB.clearAll();
    UIUtils.toast('Todos os dados foram apagados.', '');
    setTimeout(() => location.reload(), 1000);
  };

  const refresh = () => {
    loadVoices();
    renderStats();
  };

  const renderStats = () => {
    const modules  = DB.getModules();
    const cards    = DB.getCards();
    const playlist = DB.getPlaylist();

    const totalSentences = modules.reduce((n, m) => n + m.sentences.length, 0);
    const reviewed = modules.reduce((n, m) =>
      n + m.sentences.filter(s => s.srs.lastReview).length, 0);
    const dueToday = modules.reduce((n, m) =>
      n + m.sentences.filter(s => SM2.isDue(s.srs)).length, 0) +
      cards.filter(c => SM2.isDue(c.srs)).length;

    document.getElementById('statsDisplay').innerHTML = `
      <div class="stat-row"><span>Módulos</span><span>${modules.length}</span></div>
      <div class="stat-row"><span>Frases totais</span><span>${totalSentences}</span></div>
      <div class="stat-row"><span>Frases revisadas</span><span>${reviewed}</span></div>
      <div class="stat-row"><span>Cards avulsos</span><span>${cards.length}</span></div>
      <div class="stat-row"><span>Na playlist</span><span>${playlist.length}</span></div>
      <div class="stat-row"><span>Para revisar hoje</span><span>${dueToday}</span></div>
    `;
  };

  return { init, refresh };
})();

/* ═══════════════════════════════════════════════════════════════
   GLOBAL HELPERS
═══════════════════════════════════════════════════════════════ */
const escHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const updateHeaderStats = () => {
  const modules = DB.getModules();
  const cards   = DB.getCards();
  const due = modules.reduce((n, m) =>
    n + m.sentences.filter(s => SM2.isDue(s.srs)).length, 0) +
    cards.filter(c => SM2.isDue(c.srs)).length;
  document.getElementById('stats-due').textContent = `${due} hoje`;
};

/* ═══════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  TabManager.init();
  CreateModule.init();
  StudyModule.init();
  ReviewModule.init();
  PlaylistModule.init();
  SettingsModule.init();
  updateHeaderStats();

  // Expõe objetos globais necessários para os onclick inline
  window.StudyModule   = StudyModule;
  window.CreateModule  = CreateModule;
  window.TabManager    = TabManager;
});
