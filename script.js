/**
 * EnglishFlow Engine — script.js (Engine Definitiva CIMV e Correção de UI)
 */

'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// ── BANCO DE DADOS CORE (LOCALSTORAGE) ──
const DB = (() => {
  const STORAGE_KEY = 'englishflow_premium_db';
  
  const defaultSchema = {
    modules: [],
    decks: [{ id: 'default_deck', name: 'Fundação (Principal)' }],
    cards: [],
    stats: {}
  };

  let data = null;

  const load = () => {
    if (data) return data;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      data = raw ? JSON.parse(raw) : { ...defaultSchema };
      if (!data.decks || !data.decks.length) data.decks = [...defaultSchema.decks];
      if (!data.cards) data.cards = [];
      if (!data.modules) data.modules = [];
      if (!data.stats) data.stats = {};
      return data;
    } catch (e) {
      console.error("Falha ao carregar banco local.", e);
      data = { ...defaultSchema };
      return data;
    }
  };

  const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); };

  return {
    getModules: () => load().modules,
    getDecks: () => load().decks,
    getCards: () => load().cards,
    getStats: () => load().stats,
    addModule: (m) => { load().modules.push(m); save(); },
    deleteModule: (id) => { 
      load().modules = load().modules.filter(m => m.id !== id); 
      load().cards = load().cards.filter(c => c.originModuleId !== id);
      save(); 
    },
    addDeck: (name) => {
      const id = 'deck_' + Math.random().toString(36).substring(2, 11);
      load().decks.push({ id, name }); save(); return id;
    },
    deleteDeck: (id) => {
      if (id === 'default_deck') return false;
      load().decks = load().decks.filter(d => d.id !== id);
      load().cards.forEach(c => { if (c.deckId === id) c.deckId = 'default_deck'; });
      save(); return true;
    },
    addCard: (card) => { load().cards.push(card); save(); },
    removeCardByOrigin: (sentenceId) => {
      load().cards = load().cards.filter(c => c.sentenceId !== sentenceId); save();
    },
    hasCard: (sentenceId) => load().cards.some(c => c.sentenceId === sentenceId),
    incrementViewCount: (audioKey) => {
      const s = load().stats; s[audioKey] = (s[audioKey] || 0) + 1; save(); return s[audioKey];
    },
    getViewCount: (audioKey) => load().stats[audioKey] || 0,
    importRawJSON: (jsonString) => {
      try {
        const parsed = JSON.parse(jsonString);
        if (parsed.decks && parsed.cards) { localStorage.setItem(STORAGE_KEY, jsonString); data = parsed; return true; }
      } catch {} return false;
    },
    clearAll: () => { localStorage.removeItem(STORAGE_KEY); data = null; load(); }
  };
})();

// ── ALGORITMO ANKI INTEGRADO ──
const SRS = (() => {
  const getTodayDateString = () => new Date().toISOString().slice(0, 10);
  return {
    createTemplate: () => ({ interval: 1, easeFactor: 2.5, repetitions: 0, nextReview: getTodayDateString() }),
    processResponse: (history, quality) => {
      const h = { ...history };
      if (quality < 3) {
        h.repetitions = 0; h.interval = 1; h.nextReview = getTodayDateString();
      } else {
        if (h.repetitions === 0) h.interval = 1;
        else if (h.repetitions === 1) h.interval = 3;
        else h.interval = Math.round(h.interval * h.easeFactor);
        h.repetitions += 1;
        h.easeFactor = Math.max(1.3, h.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
        const targetDate = new Date(); targetDate.setDate(targetDate.getDate() + h.interval);
        h.nextReview = targetDate.toISOString().slice(0, 10);
      }
      return h;
    },
    isDue: (card) => card.history.nextReview <= getTodayDateString(),
    todayStr: getTodayDateString
  };
})();

// ── ENGINE DE VOZES ──
const VoiceEngine = (() => {
  const synth = window.speechSynthesis;
  let activeVoiceName = '';
  let activeRate = 0.75;
  return {
    init: (selectElementId, callback) => {
      const populate = () => {
        const select = document.getElementById(selectElementId); if (!select) return;
        const voices = synth.getVoices().filter(v => v.lang.startsWith('en'));
        select.innerHTML = voices.map(v => {
          let badge = "Nativo";
          if (v.lang === "en-US") badge = "Americano 🇺🇸";
          if (v.lang === "en-GB") badge = "Britânico 🇬🇧";
          if (v.lang === "en-AU") badge = "Australiano 🇦🇺";
          return `<option value="${v.name}">${v.name} (${badge})</option>`;
        }).join('');
        if (voices.length && !activeVoiceName) activeVoiceName = voices[0].name;
        if (callback) callback(voices);
      };
      populate(); if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = populate;
    },
    setVoice: (name) => { activeVoiceName = name; },
    setRate: (rate) => { activeRate = Number(rate); },
    speak: (text, onEndCallback) => {
      synth.cancel(); if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const matched = synth.getVoices().find(v => v.name === activeVoiceName);
      if (matched) utterance.voice = matched;
      utterance.rate = activeRate;
      if (onEndCallback) utterance.onend = onEndCallback;
      synth.speak(utterance);
    },
    stop: () => synth.cancel()
  };
})();

// ── GERENCIADOR DE UI ──
const TabManager = (() => {
  const toast = document.getElementById('toast');
  const confirmModal = document.getElementById('confirmModal');
  const confirmMsg = document.getElementById('confirmModalMsg');
  let confirmResolver = null;
  return {
    init: () => {
      document.querySelectorAll('.tab-btn').forEach(btn => { btn.onclick = () => TabManager.switchTab(btn.dataset.tab); });
      document.getElementById('btnConfirmCancel').onclick = () => { confirmModal.classList.add('hidden'); if(confirmResolver) confirmResolver(false); };
      document.getElementById('btnConfirmOk').onclick = () => { confirmModal.classList.add('hidden'); if(confirmResolver) confirmResolver(true); };
    },
    switchTab: (tabId) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));
      if (tabId === 'create') ImportPanel.renderGrid();
      if (tabId === 'study') StudyPanel.refresh();
      if (tabId === 'decks') DecksPanel.refresh();
      if (tabId === 'review') ReviewPanel.startSession();
      if (tabId === 'playlist') PlaylistPanel.refresh();
      GlobalApp.updateBadges();
    },
    showToast: (msg, mode = '') => {
      toast.textContent = msg; toast.className = `toast show ${mode}`;
      setTimeout(() => toast.classList.remove('show'), 2500);
    },
    askConfirm: (msg) => new Promise(resolve => {
      confirmMsg.textContent = msg; confirmModal.classList.remove('hidden'); confirmResolver = resolve;
    })
  };
})();

// ── ABA 1: IMPORTAÇÃO BLINDADA COM ALGORITMO CIMV ──
const ImportPanel = (() => {
  let compiledSentences = [];
  let compiledTextBlock = "";

  const parseRawBuffer = (fullText) => {
    compiledSentences = [];
    compiledTextBlock = "";

    // Limpa quebras de linha sujas
    let lines = fullText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // FILTRO DE LIXO: Remove cabeçalhos e rodapés específicos do CIMV e Mairo Vergara
    lines = lines.filter(line => {
      const up = line.toUpperCase();
      if (up.includes("CIMV") || up.includes("CURSO DE INGL") || up.includes("MAIRO VERGARA") || up.includes("2019") || up.includes("2020")) return false;
      if (/^\d+$/.test(line)) return false; // Remove números soltos de páginas
      return true;
    });

    let startLinha = -1;
    let startTreino = -1;

    // Encontra os marcadores do curso
    for (let i = 0; i < lines.length; i++) {
      const up = lines[i].toUpperCase();
      if (up.includes("TEXTO LINHA A LINHA")) startLinha = i;
      if (up.includes("TEXTO PARA TREINAMENTO")) startTreino = i;
    }

    // EXTRAÇÃO LINHA A LINHA
    if (startLinha !== -1) {
      let endLinha = startTreino !== -1 ? startTreino : lines.length;
      let chunkLines = lines.slice(startLinha + 1, endLinha);

      let tempEn = "";
      let tempPt = "";

      for (let i = 0; i < chunkLines.length; i++) {
        let line = chunkLines[i];
        
        // Verifica se a linha é português: tem acento ou palavras-chave fortes do idioma
        let hasPtAccents = /[ãáéíóúçÂÊÎÔÛÃÕ]/i.test(line);
        let hasPtWords = /\b(um|uma|ele|ela|que|do|da|no|na|para|com|se|os|as|era|foi|tinha|havia|qual|deles|você|mesmo|esposa|marido)\b/i.test(line);

        if (hasPtAccents || hasPtWords) {
          tempPt += (tempPt ? " " : "") + line;
        } else {
          // É uma linha em inglês. Se já havia um bloco formado, salva no baralho.
          if (tempEn && tempPt) {
            compiledSentences.push({ en: tempEn, pt: tempPt });
            tempEn = line;
            tempPt = "";
          } else {
            tempEn += (tempEn ? " " : "") + line;
          }
        }
      }
      if (tempEn) compiledSentences.push({ en: tempEn, pt: tempPt || "Tradução pendente" });
    }

    // EXTRAÇÃO DO TEXTO DE TREINAMENTO
    if (startTreino !== -1) {
      compiledTextBlock = lines.slice(startTreino + 1).join(" ");
    } else {
      compiledTextBlock = compiledSentences.map(s => s.en).join(" ");
    }
  };

  const updateInputVisibility = (e) => {
    const isPdf = document.querySelector('input[name="importMode"]:checked').value === 'pdf';
    const pdfZone = document.getElementById('pdfDropZone');
    const textZone = document.getElementById('textInputArea');
    
    // Força bruta via JS para esmagar regras de CSS presas no cache
    if (isPdf) {
      pdfZone.style.setProperty('display', 'block', 'important');
      textZone.style.setProperty('display', 'none', 'important');
    } else {
      pdfZone.style.setProperty('display', 'none', 'important');
      textZone.style.setProperty('display', 'flex', 'important');
    }
  };

  return {
    init: () => {
      document.querySelectorAll('input[name="importMode"]').forEach(radio => {
        radio.addEventListener('click', updateInputVisibility);
      });
      updateInputVisibility();

      document.getElementById('pdfFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        TabManager.showToast("Decodificando PDF do Curso...");
        try {
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
          let extractedText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            extractedText += content.items.map(it => it.str).join(" ") + "\n";
          }
          parseRawBuffer(extractedText);
          
          if (compiledSentences.length === 0) {
            TabManager.showToast("Nenhuma estrutura compatível encontrada.", 'error');
            return;
          }
          
          TabManager.showToast(`${compiledSentences.length} frases mapeadas!`, 'success');
          if (!document.getElementById('moduleTitle').value) document.getElementById('moduleTitle').value = file.name.replace(".pdf", "");
        } catch (err) {
          console.error(err); TabManager.showToast("Falha ao ler PDF.", 'error');
        }
        e.target.value = '';
      });

      document.getElementById('btnProcessModule').onclick = () => {
        const title = document.getElementById('moduleTitle').value.trim();
        if (!title) return TabManager.showToast("Defina um título para a lição.", 'error');
        
        const mode = document.querySelector('input[name="importMode"]:checked').value;
        if (mode === 'text') {
          const enLines = document.getElementById('rawTextEn').value.split('\n').map(x=>x.trim()).filter(x=>x.length>0);
          const ptLines = document.getElementById('rawTextPt').value.split('\n').map(x=>x.trim()).filter(x=>x.length>0);
          if (!enLines.length) return TabManager.showToast("Insira as frases em inglês.", 'error');
          compiledSentences = enLines.map((en, idx) => ({ en, pt: ptLines[idx] || "Tradução pendente" }));
          compiledTextBlock = enLines.join(" ");
        }

        if (!compiledSentences || !compiledSentences.length) return TabManager.showToast("Nenhum dado pronto para salvar.", 'error');

        const sentences = compiledSentences.map(s => ({ id: 's_' + Math.random().toString(36).substring(2,11), english: s.en, portuguese: s.pt }));
        DB.addModule({ id: 'mod_' + Math.random().toString(36).substring(2,11), title, sentences, fullText: compiledTextBlock });
        
        document.getElementById('mainCreateForm').reset();
        compiledSentences = []; compiledTextBlock = ""; updateInputVisibility();
        
        TabManager.showToast("Módulo salvo na base de dados!", 'success');
        ImportPanel.renderGrid();
      };

      ImportPanel.renderGrid();
    },
    renderGrid: () => {
      const box = document.getElementById('compiledModulesGrid');
      const mods = DB.getModules();
      if (!mods.length) { box.innerHTML = '<p class="empty-state">Nenhum módulo importado.</p>'; return; }
      box.innerHTML = mods.map(m => `
        <div class="module-card">
          <div class="mc-title">${m.title}</div>
          <div class="mc-meta">${m.sentences.length} estruturas extraídas</div>
          <div class="mc-actions">
            <button class="btn btn-accent btn-sm" onclick="TabManager.switchTab('study'); StudyPanel.open('${m.id}')">Estudar</button>
            <button class="btn btn-danger btn-sm" onclick="ImportPanel.delete('${m.id}')">🗑</button>
          </div>
        </div>
      `).join('');
    },
    delete: async (id) => {
      if (await TabManager.askConfirm("Apagar módulo e todos os cards vinculados a ele?")) {
        DB.deleteModule(id); ImportPanel.renderGrid(); GlobalApp.updateBadges();
      }
    }
  };
})();

// ── ABA 2: ESTUDO ──
const StudyPanel = (() => {
  let activeModule = null;
  return {
    init: () => {
      document.getElementById('btnLeaveStudy').onclick = () => {
        document.getElementById('studyActiveView').classList.add('hidden'); document.getElementById('studySelectorView').classList.remove('hidden');
      };
      document.getElementById('btnToggleLinha').onclick = () => {
        document.getElementById('btnToggleLinha').classList.add('active'); document.getElementById('btnToggleTexto').classList.remove('active');
        document.getElementById('studyLinhaContainer').classList.remove('hidden'); document.getElementById('studyTextoContainer').classList.add('hidden');
      };
      document.getElementById('btnToggleTexto').onclick = () => {
        document.getElementById('btnToggleTexto').classList.add('active'); document.getElementById('btnToggleLinha').classList.remove('active');
        document.getElementById('studyTextoContainer').classList.remove('hidden'); document.getElementById('studyLinhaContainer').classList.add('hidden');
      };
      document.getElementById('studyVoicePicker').onchange = (e) => VoiceEngine.setVoice(e.target.value);
      document.getElementById('studyRatePicker').onchange = (e) => VoiceEngine.setRate(e.target.value);
      
      document.getElementById('btnPlayFullStory').onclick = () => {
        let currentIdx = 0;
        const readNext = () => {
          if (!activeModule || currentIdx >= activeModule.sentences.length) return;
          const currentSentence = activeModule.sentences[currentIdx];
          const element = document.getElementById(`scard_${currentSentence.id}`);
          if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          VoiceEngine.speak(currentSentence.english, () => { currentIdx++; setTimeout(readNext, 1000); });
        };
        readNext();
      };
      document.getElementById('btnStopFullStory').onclick = () => VoiceEngine.stop();
    },
    refresh: () => {
      const box = document.getElementById('studyAvailableGrid');
      const mods = DB.getModules();
      if (!mods.length) { box.innerHTML = '<p class="empty-state">Importe módulos primeiro.</p>'; return; }
      box.innerHTML = mods.map(m => `
        <div class="module-card">
          <div class="mc-title">${m.title}</div>
          <button class="btn btn-primary btn-sm" style="width:100%; margin-top:.5rem; justify-content:center;" onclick="StudyPanel.open('${m.id}')">Abrir Lição</button>
        </div>
      `).join('');
    },
    open: (id) => {
      activeModule = DB.getModules().find(m => m.id === id); if (!activeModule) return;
      document.getElementById('studySelectorView').classList.add('hidden'); document.getElementById('studyActiveView').classList.remove('hidden');
      document.getElementById('activeStudyTitle').textContent = activeModule.title;
      VoiceEngine.init('studyVoicePicker');
      
      const container = document.getElementById('studyLinhaContainer');
      container.innerHTML = activeModule.sentences.map((s, index) => {
        const isChecked = DB.hasCard(s.id);
        return `
          <div class="sentence-card ${isChecked ? 'card-active-green' : ''}" id="scard_${s.id}">
            <div class="sentence-num">ESTRUTURA ${index + 1}</div>
            <div class="sentence-en">${s.english}</div>
            <div class="sentence-pt">${s.portuguese}</div>
            <div class="sentence-controls">
              <button class="btn btn-accent btn-sm" onclick="VoiceEngine.speak(\`${s.english.replace(/'/g, "\\'")}\`)">🔊 Ouvir</button>
              <button class="btn ${isChecked ? 'btn-primary' : 'btn-ghost'} btn-sm check-toggle-btn" data-sid="${s.id}">✔ Concluído</button>
            </div>
          </div>
        `;
      }).join('');
      container.querySelectorAll('.check-toggle-btn').forEach(btn => { btn.onclick = () => StudyPanel.toggleCheck(btn, btn.dataset.sid); });
      document.getElementById('blockFullTextParagraph').textContent = activeModule.fullText;
    },
    toggleCheck: (buttonElement, sentenceId) => {
      const sentence = activeModule.sentences.find(x => x.id === sentenceId);
      const parentCard = document.getElementById(`scard_${sentenceId}`);
      if (DB.hasCard(sentenceId)) {
        DB.removeCardByOrigin(sentenceId);
        buttonElement.className = "btn btn-ghost btn-sm check-toggle-btn";
        if (parentCard) parentCard.classList.remove('card-active-green');
        TabManager.showToast("Removido do Anki.");
      } else {
        DB.addCard({ id: 'card_' + Math.random().toString(36).substring(2,11), sentenceId: sentenceId, originModuleId: activeModule.id, deckId: 'default_deck', english: sentence.english, portuguese: sentence.portuguese, voiceName: document.getElementById('studyVoicePicker').value, history: SRS.createTemplate() });
        buttonElement.className = "btn btn-primary btn-sm check-toggle-btn";
        if (parentCard) parentCard.classList.add('card-active-green');
        TabManager.showToast("Adicionado ao Anki!", "success");
      }
      GlobalApp.updateBadges();
    }
  };
})();

// ── ABA 3: BARALHOS ──
const DecksPanel = (() => {
  return {
    init: () => {
      document.getElementById('btnCreateDeck').onclick = () => {
        const name = document.getElementById('newDeckName').value.trim(); if (!name) return;
        DB.addDeck(name); document.getElementById('newDeckName').value = ''; TabManager.showToast("Baralho criado!", 'success'); DecksPanel.refresh();
      };
      document.getElementById('btnSaveManualCard').onclick = () => {
        const deckId = document.getElementById('cardDeckDestiny').value; const voiceName = document.getElementById('cardVoiceDestiny').value;
        const en = document.getElementById('manualCardEn').value.trim(); const pt = document.getElementById('manualCardPt').value.trim();
        if (!en || !pt) return TabManager.showToast("Preencha Frente e Verso.", 'error');
        DB.addCard({ id: 'card_' + Math.random().toString(36).substring(2,11), sentenceId: null, originModuleId: null, deckId, english: en, portuguese: pt, voiceName, history: SRS.createTemplate() });
        document.getElementById('manualCardEn').value = ''; document.getElementById('manualCardPt').value = ''; TabManager.showToast("Card inserido no baralho!", 'success'); DecksPanel.refresh();
      };
    },
    refresh: () => {
      const container = document.getElementById('decksManagementContainer'); const decks = DB.getDecks(); const cards = DB.getCards();
      container.innerHTML = decks.map(d => {
        const totalCards = cards.filter(c => c.deckId === d.id).length;
        return `
          <div class="voice-dashboard-panel" style="margin-bottom:.5rem; justify-content:space-between;">
            <div><strong>🗂 ${d.name}</strong> <span class="count-badge">${totalCards} cards</span></div>
            ${d.id !== 'default_deck' ? `<button class="btn btn-danger btn-sm" onclick="DecksPanel.delete('${d.id}')">Excluir</button>` : '<span style="font-size:0.8rem; color:var(--text-lo);">Sistema</span>'}
          </div>
        `;
      }).join('');
      const sel = document.getElementById('cardDeckDestiny'); if(sel) sel.innerHTML = decks.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
      VoiceEngine.init('cardVoiceDestiny');
    },
    delete: async (id) => { if (await TabManager.askConfirm("Apagar este baralho? Os cards voltarão para o baralho Principal.")) { DB.deleteDeck(id); DecksPanel.refresh(); } }
  };
})();

// ── ABA 4: REVISÃO (ANKI) ──
const ReviewPanel = (() => {
  let activeQueue = []; let index = 0;
  return {
    init: () => {
      document.getElementById('btnRevealReviewAnswer').onclick = () => {
        document.getElementById('reviewCardBackBlock').classList.remove('hidden'); document.getElementById('reviewActionTriggerRow').classList.add('hidden'); document.getElementById('reviewFeedbackButtonRow').classList.remove('hidden');
      };
      document.getElementById('btnSpeakReviewFront').onclick = () => {
        if (activeQueue[index]) { VoiceEngine.setVoice(activeQueue[index].voiceName); VoiceEngine.speak(activeQueue[index].english); }
      };
      document.getElementById('reviewFeedbackButtonRow').onclick = (e) => {
        const btn = e.target.closest('[data-q]'); if (!btn) return;
        const quality = Number(btn.dataset.q); const card = activeQueue[index];
        card.history = SRS.processResponse(card.history, quality); DB.saveCards;
        if (quality < 3) { const failedCard = activeQueue.splice(index, 1)[0]; activeQueue.push(failedCard); TabManager.showToast("Retido para reavaliação!"); } 
        else { index++; TabManager.showToast("Agendado!"); }
        ReviewPanel.renderCard();
      };
    },
    startSession: () => {
      const allCards = DB.getCards(); activeQueue = allCards.filter(c => SRS.isDue(c)); index = 0;
      document.getElementById('reviewSessionSubtitle').textContent = `${activeQueue.length} cards agendados para hoje`;
      if (!activeQueue.length) { document.getElementById('reviewActiveContainer').classList.add('hidden'); document.getElementById('reviewEmptyState').classList.remove('hidden'); } 
      else { document.getElementById('reviewEmptyState').classList.add('hidden'); document.getElementById('reviewActiveContainer').classList.remove('hidden'); ReviewPanel.renderCard(); }
    },
    renderCard: () => {
      if (index >= activeQueue.length) { document.getElementById('reviewActiveContainer').classList.add('hidden'); document.getElementById('reviewEmptyState').classList.remove('hidden'); GlobalApp.updateBadges(); return; }
      const card = activeQueue[index]; const decks = DB.getDecks(); const matchedDeck = decks.find(d => d.id === card.deckId);
      document.getElementById('reviewCardDeckLabel').textContent = matchedDeck ? matchedDeck.name.toUpperCase() : "BARALHO";
      document.getElementById('reviewTextFront').textContent = card.english; document.getElementById('reviewTextBack').textContent = card.portuguese;
      document.getElementById('reviewCardBackBlock').classList.add('hidden'); document.getElementById('reviewActionTriggerRow').classList.remove('hidden'); document.getElementById('reviewFeedbackButtonRow').classList.add('hidden');
      VoiceEngine.setVoice(card.voiceName); VoiceEngine.speak(card.english);
    }
  };
})();

// ── ABA 5: PLAYLIST ──
const PlaylistPanel = (() => {
  let isPlaying = false; let trackIdx = 0; let delayTimer = null;
  return {
    init: () => {
      document.getElementById('playlistBtnPlay').onclick = () => {
        if (isPlaying) { isPlaying = false; document.getElementById('playlistBtnPlay').textContent = "▶ Iniciar"; clearTimeout(delayTimer); VoiceEngine.stop(); } 
        else { isPlaying = true; document.getElementById('playlistBtnPlay').textContent = "⏸ Pausar"; PlaylistPanel.executeTrack(); }
      };
      document.getElementById('playlistBtnNext').onclick = () => { PlaylistPanel.shift(1); };
      document.getElementById('playlistBtnPrev').onclick = () => { PlaylistPanel.shift(-1); };
    },
    refresh: () => {
      const container = document.getElementById('playlistTracksBox'); const mods = DB.getModules();
      let totalSeconds = 0; mods.forEach(m => totalSeconds += (m.sentences.length * 4));
      document.getElementById('playlistDurationTrack').textContent = `Tempo estimado: ${Math.round(totalSeconds / 60)} minutos`;
      if (!mods.length) { container.innerHTML = '<p class="empty-state">Nenhuma lição adicionada.</p>'; return; }
      container.innerHTML = mods.map((m, idx) => `
        <div class="playlist-item ${trackIdx === idx && isPlaying ? 'active-track' : ''}">
          <div><strong>${idx + 1}. Audio Compilado — ${m.title}</strong></div>
          <span class="count-badge">👁 ${DB.getViewCount('track_views_' + m.id)} execuções</span>
        </div>
      `).join('');
    },
    executeTrack: () => {
      const mods = DB.getModules(); if (!mods.length || !isPlaying) return;
      if (trackIdx >= mods.length) { if (document.getElementById('playlistLoopToggle').checked) { trackIdx = 0; } else { isPlaying = false; document.getElementById('playlistBtnPlay').textContent = "▶ Iniciar"; return; } }
      const activeMod = mods[trackIdx]; document.getElementById('playlistCurrentTitle').textContent = activeMod.title; document.getElementById('playlistCurrentSub').textContent = "Tocando sequencialmente...";
      const key = 'track_views_' + activeMod.id; DB.incrementViewCount(key); PlaylistPanel.refresh();
      let sentencePointer = 0;
      const readBlock = () => {
        if (!isPlaying || trackIdx >= mods.length) return;
        if (sentencePointer >= activeMod.sentences.length) { trackIdx++; delayTimer = setTimeout(PlaylistPanel.executeTrack, 1500); return; }
        const s = activeMod.sentences[sentencePointer]; document.getElementById('playlistProgressIndicator').style.width = `${((sentencePointer + 1) / activeMod.sentences.length) * 100}%`;
        VoiceEngine.speak(s.english, () => { sentencePointer++; delayTimer = setTimeout(readBlock, 1200); });
      };
      readBlock();
    },
    shift: (offset) => { clearTimeout(delayTimer); VoiceEngine.stop(); trackIdx += offset; const mods = DB.getModules(); if (trackIdx < 0) trackIdx = mods.length - 1; if (trackIdx >= mods.length) trackIdx = 0; if (isPlaying) PlaylistPanel.executeTrack(); else PlaylistPanel.refresh(); }
  };
})();

// ── ORQUESTRAÇÃO GLOBAL ──
const GlobalApp = (() => {
  return {
    init: () => {
      TabManager.init(); ImportPanel.init(); StudyPanel.init(); DecksPanel.init(); ReviewPanel.init(); PlaylistPanel.init();
      document.getElementById('btnConfigExport').onclick = () => { const blob = new Blob([localStorage.getItem('englishflow_premium_db')], { type: 'application/json' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `englishflow_backup_${SRS.todayStr()}.json` }); a.click(); };
      document.getElementById('configImportFile').onchange = async (e) => { try { const rawText = await e.target.files[0].text(); if (DB.importRawJSON(rawText)) { TabManager.showToast("Banco carregado com sucesso!", 'success'); setTimeout(() => location.reload(), 1000); } else { TabManager.showToast("Arquivo JSON inválido.", 'error'); } } catch { TabManager.showToast("Falha ao abrir arquivo.", 'error'); } };
      document.getElementById('btnConfigClearAll').onclick = async () => { if (await TabManager.askConfirm("Zerar todos os dados, baralhos e histórias?")) { DB.clearAll(); location.reload(); } };
      GlobalApp.updateBadges();
    },
    updateBadges: () => {
      const dues = DB.getCards().filter(c => SRS.isDue(c)).length; const badge = document.getElementById('review-badge');
      if (dues > 0) { badge.textContent = dues; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
    }
  };
})();

document.addEventListener('DOMContentLoaded', GlobalApp.init);
