/**
 * EnglishFlow — script.js
 * Arquitetura Vanilla Inteligente com Mapeamento por Tags estruturadas de Curso
 */

'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

const DB = (() => {
  const KEYS = { MODULES: 'ef_modules', CARDS: 'ef_cards', PLAYLIST: 'ef_playlist' };
  const load = (key, fb = []) => { try { return JSON.parse(localStorage.getItem(key)) ?? fb; } catch { return fb; } };
  const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));
  return {
    getModules: () => load(KEYS.MODULES, []),
    saveModules: (d) => save(KEYS.MODULES, d),
    getCards: () => load(KEYS.CARDS, []),
    saveCards: (d) => save(KEYS.CARDS, d),
    getPlaylist: () => load(KEYS.PLAYLIST, []),
    savePlaylist: (d) => save(KEYS.PLAYLIST, d),
    clearAll: () => Object.values(KEYS).forEach(k => localStorage.removeItem(k))
  };
})();

const SM2 = (() => {
  const todayStr = () => new Date().toISOString().slice(0, 10);
  return {
    newCard: () => ({ interval: 1, easeFactor: 2.5, repetitions: 0, nextReview: todayStr() }),
    review: (card, q) => {
      const c = { ...card };
      if (q === 0) { c.repetitions = 0; c.interval = 1; } 
      else {
        c.repetitions += 1;
        if (c.repetitions === 1) c.interval = 1;
        else if (c.repetitions === 2) c.interval = 3;
        else c.interval = Math.round(c.interval * c.easeFactor);
        c.easeFactor = Math.max(1.3, c.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      }
      const d = new Date(); d.setDate(d.getDate() + c.interval);
      c.nextReview = d.toISOString().slice(0, 10);
      return c;
    },
    isDue: (c) => c.nextReview <= todayStr(),
    todayStr
  };
})();

const TTS = (() => {
  const synth = window.speechSynthesis;
  let voiceName = '';
  let rate = 0.75;
  return {
    init: () => {
      const loadV = () => {
        const sel = document.getElementById('studyVoiceSelector');
        if(!sel) return;
        const voices = synth.getVoices().filter(v => v.lang.startsWith('en'));
        sel.innerHTML = voices.map(v => {
          let label = "Nativo";
          if(v.lang === "en-US") label = "Americano 🇺🇸";
          if(v.lang === "en-GB") label = "Britânico 🇬🇧";
          if(v.lang === "en-AU") label = "Australiano 🇦🇺";
          return `<option value="${v.name}">${v.name} (${label})</option>`;
        }).join('');
        if(voices.length && !voiceName) voiceName = voices[0].name;
      };
      loadV(); if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadV;
    },
    setVoice: (n) => { voiceName = n; },
    setRate: (r) => { rate = Number(r); },
    speak: (text, onEnd) => {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = synth.getVoices().find(x => x.name === voiceName);
      if(v) u.voice = v;
      u.rate = rate;
      if(onEnd) u.onend = onEnd;
      synth.speak(u);
    },
    stop: () => synth.cancel()
  };
})();

const UIUtils = (() => {
  return {
    toast: (m, type = '') => { const e = document.getElementById('toast'); e.textContent = m; e.className = `toast show ${type}`; setTimeout(() => e.classList.remove('show'), 3000); },
    confirm: (m) => new Promise(res => {
      const o = document.getElementById('confirmModal'); document.getElementById('confirmMsg').textContent = m; o.classList.remove('hidden');
      document.getElementById('confirmOk').onclick = () => { o.classList.add('hidden'); res(true); };
      document.getElementById('confirmCancel').onclick = () => { o.classList.add('hidden'); res(false); };
    }),
    uuid: () => Math.random().toString(36).substring(2, 11)
  };
})();

const TabManager = (() => {
  return {
    init: () => { document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => TabManager.switchTab(b.dataset.tab)); },
    switchTab: (id) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${id}`));
      if(id === 'study') StudyModule.refresh(); if(id === 'review') ReviewModule.load(); if(id === 'playlist') PlaylistModule.refresh();
    }
  };
})();

const CreateModule = (() => {
  let parsedSentences = [];
  let parsedTrainingText = "";

  const runTextParserEngine = (fullRawString) => {
    parsedSentences = [];
    parsedTrainingText = "";

    const lines = fullRawString.replace(/\r\n/g, '\n').split('\n').map(x => x.trim()).filter(x => x.length > 0);
    
    let mode = "metadata"; // metadata -> linha_a_linha -> treinamento
    let currentEnglish = "";

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const upperLine = currentLine.toUpperCase();

      // Interceptores de seções baseados nas imagens e estrutura real
      if (upperLine.includes("TEXTO LINHA A LINHA") || upperLine.includes("LINHA A LINHA")) {
        mode = "linha_a_linha";
        continue;
      }
      if (upperLine.includes("TEXTO PARA TREINAMENTO") || upperLine.includes("PARA TREINAMENTO")) {
        mode = "treinamento";
        continue;
      }

      if (mode === "linha_a_linha") {
        // Se a frase não tiver acentos, assume-se que é a estrutura em inglês
        if (/[a-zA-Z]/.test(currentLine) && !currentLine.match(/[ãáéíóúçÂÊÎÔÛÃÕ]/i)) {
          if (currentEnglish !== "") {
            // Se já existia uma em inglês sem tradução, fecha com aviso amigável
            parsedSentences.push({ en: currentEnglish, pt: "Suporte textual pendente." });
          }
          currentEnglish = currentLine;
        } else {
          // Se contiver acentos, trata-se da tradução imediata da linha anterior
          if (currentEnglish !== "") {
            parsedSentences.push({ en: currentEnglish, pt: currentLine });
            currentEnglish = ""; // Limpa ponteiro para o próximo par
          }
        }
      }

      if (mode === "treinamento") {
        parsedTrainingText += currentLine + " ";
      }
    }

    // Fallback de segurança se sobrar frase na esteira
    if (currentEnglish !== "") {
      parsedSentences.push({ en: currentEnglish, pt: "Suporte textual pendente." });
    }

    // Se a aba de treinamento vier em branco, reconstrói unificando as frases do linha a linha
    if (parsedTrainingText.trim() === "" && parsedSentences.length > 0) {
      parsedTrainingText = parsedSentences.map(s => s.en).join(" ");
    }
  };

  return {
    init: () => {
      // Gerenciador de Alternância Visível das Opções de Entrada de Dados (PDF vs Colar)
      document.querySelectorAll('input[name="inputMode"]').forEach(r => {
        r.addEventListener('change', (e) => {
          const modePdf = e.target.value === 'pdf';
          document.getElementById('pdfDropZone').style.display = modePdf ? 'block' : 'none';
          document.getElementById('textInputArea').style.display = modePdf ? 'none' : 'flex';
        });
      });

      // Gatilho de Importação do PDF
      document.getElementById('pdfFileInput').onchange = async (e) => {
        const file = e.target.files[0]; if(!file) return;
        UIUtils.toast("Extraindo dados estruturais do PDF...");
        try {
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
          let textAccumulator = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const rawContent = await page.getTextContent();
            textAccumulator += rawContent.items.map(item => item.str).join(" ") + "\n";
          }

          runTextParserEngine(textAccumulator);

          UIUtils.toast(`${parsedSentences.length} Frases mapeadas no Linha a Linha!`, "success");
          document.getElementById('moduleTitle').value = file.name.replace(".pdf", "");
        } catch { UIUtils.toast("Falha na decodificação do PDF.", "error"); }
      };

      // Execução do Botão de Criação Único
      document.getElementById('btnCreateModule').onclick = () => {
        const title = document.getElementById('moduleTitle').value.trim();
        if(!title) { UIUtils.toast("Atribua um título para a lição.", "error"); return; }
        const mode = document.querySelector('input[name="inputMode"]:checked').value;

        if (mode === 'text') {
          const enBox = document.getElementById('rawEnglishText').value.split('\n').map(x => x.trim()).filter(x => x.length > 0);
          const ptBox = document.getElementById('rawPortugueseText').value.split('\n').map(x => x.trim()).filter(x => x.length > 0);
          const customTraining = document.getElementById('rawTrainingText').value.trim();

          if (!enBox.length) { UIUtils.toast("O campo em inglês precisa conter as frases.", "error"); return; }
          
          parsedSentences = enBox.map((en, idx) => ({ en, pt: ptBox[idx] || "Tradução pendente" }));
          parsedTrainingText = customTraining !== "" ? customTraining : enBox.join(" ");
        }

        if(!parsedSentences.length) { UIUtils.toast("Faça o input dos dados antes de processar.", "error"); return; }

        const mappedSentences = parsedSentences.map(item => ({
          id: UIUtils.uuid(),
          english: item.en,
          portuguese: item.pt,
          srs: SM2.newCard()
        }));

        const modulesList = DB.getModules();
        modulesList.push({ id: UIUtils.uuid(), title, sentences: mappedSentences, fullText: parsedTrainingText });
        DB.saveModules(modulesList);

        // Reset e higienização dos formulários
        document.getElementById('createForm').reset();
        parsedSentences = [];
        parsedTrainingText = "";
        document.getElementById('textInputArea').style.display = 'none';
        document.getElementById('pdfDropZone').style.display = 'block';

        UIUtils.toast("História integrada no sistema de estudo!", "success");
        CreateModule.renderModuleList(); updateHeaderStats();
      };

      document.getElementById('btnAddAnki').onclick = () => {
        const en = document.getElementById('ankiEnglish').value.trim();
        const pt = document.getElementById('ankiPortuguese').value.trim();
        if(!en || !pt) return;
        const cards = DB.getCards(); cards.push({ id: UIUtils.uuid(), english: en, portuguese: pt, srs: SM2.newCard() });
        DB.saveCards(cards); document.getElementById('anki-form').reset();
        UIUtils.toast("Card gerado com sucesso!", "success"); updateHeaderStats();
      };

      CreateModule.renderModuleList();
    },
    renderModuleList: () => {
      const mods = DB.getModules(); const el = document.getElementById('modulesList');
      document.getElementById('moduleCount').textContent = mods.length;
      if(!mods.length) { el.innerHTML = '<p class="empty-state">Nenhuma lição pronta.</p>'; return; }
      el.innerHTML = mods.map(m => `
        <div class="module-card">
          <div class="mc-title">${m.title}</div>
          <div class="mc-meta">${m.sentences.length} estruturas extraídas</div>
          <div class="mc-actions" style="margin-top: .5rem;">
            <button class="btn btn-accent btn-sm" onclick="StudyModule.open('${m.id}'); TabManager.switchTab('study')">▶ Estudar</button>
            <button class="btn btn-ghost btn-sm" onclick="CreateModule.delete('${m.id}')">🗑</button>
          </div>
        </div>
      `).join('');
    },
    delete: async (id) => { if(await UIUtils.confirm("Remover lição da base de dados?")) { DB.saveModules(DB.getModules().filter(m => m.id !== id)); CreateModule.renderModuleList(); updateHeaderStats(); } }
  };
})();

const StudyModule = (() => {
  let curMod = null;
  return {
    init: () => {
      document.getElementById('btnBackToModules').onclick = () => { document.getElementById('studyArea').classList.add('hidden'); document.getElementById('studyModuleSelector').classList.remove('hidden'); };
      document.getElementById('subTabLinha').onclick = () => { document.getElementById('containerLinhaLinha').classList.remove('hidden'); document.getElementById('containerTextoAudio').classList.add('hidden'); };
      document.getElementById('subTabTextoAudio').onclick = () => { document.getElementById('containerLinhaLinha').classList.add('hidden'); document.getElementById('containerTextoAudio').classList.remove('hidden'); };
      document.getElementById('studyVoiceSelector').onchange = (e) => TTS.setVoice(e.target.value);
      document.getElementById('studyRateSelector').onchange = (e) => TTS.setRate(e.target.value);
      
      document.getElementById('btnPlayAll').onclick = () => {
        let idx = 0;
        const next = () => {
          if(idx >= curMod.sentences.length) { UIUtils.toast("Leitura contínua encerrada."); return; }
          const s = curMod.sentences[idx];
          document.getElementById(`s-card-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          TTS.speak(s.english, () => { idx++; setTimeout(next, 1200); });
        };
        next();
      };
      document.getElementById('btnStopAll').onclick = () => TTS.stop();
      document.getElementById('btnAddToPlaylistComplete').onclick = () => {
        curMod.sentences.forEach(s => PlaylistModule.addItem(s));
        UIUtils.toast("Áudios acoplados na playlist de listening passivo!", "success");
      };
    },
    refresh: () => {
      const mods = DB.getModules(); const list = document.getElementById('studyModuleList');
      document.getElementById('noModulesMsg').classList.toggle('hidden', mods.length > 0);
      list.innerHTML = mods.map(m => `<div class="module-card"><div class="mc-title">${m.title}</div><button class="btn btn-accent btn-sm" style="margin-top:.5rem;" onclick="StudyModule.open('${m.id}')">▶ Carregar</button></div>`).join('');
    },
    open: (id) => {
      curMod = DB.getModules().find(m => m.id === id); if(!curMod) return;
      document.getElementById('studyModuleSelector').classList.add('hidden');
      document.getElementById('studyArea').classList.remove('hidden');
      document.getElementById('studyTitle').textContent = curMod.title;
      
      document.getElementById('containerLinhaLinha').innerHTML = curMod.sentences.map((s, idx) => `
        <div class="sentence-card" id="s-card-${s.id}">
          <div class="sentence-num">ESTRUTURA ${idx+1}</div>
          <div class="sentence-en" style="font-size:1.15rem; color:#fff; font-weight:600;">${s.english}</div>
          <div class="sentence-pt" style="color:var(--accent); font-size:0.98rem; margin-top:.4rem;">${s.portuguese}</div>
          <div class="sentence-controls" style="margin-top: .75rem;">
            <button class="btn btn-accent btn-sm" onclick="TTS.speak('${s.english.replace(/'/g, "\\'")}')">▶ Ouvir</button>
            <button class="btn btn-ghost btn-sm" onclick="StudyModule.addSRS('${s.id}')">◈ Agendar no Anki</button>
          </div>
        </div>
      `).join('');
      
      document.getElementById('fullTextParagraphs').textContent = curMod.fullText || curMod.sentences.map(s => s.english).join(" ");
      document.getElementById('studyProgress').style.width = "100%";
    },
    addSRS: (sid) => {
      UIUtils.toast("Card gerado na Fila Diária de Revisões!", "success");
      const mods = DB.getModules(); const m = mods.find(x => x.id === curMod.id);
      const s = m.sentences.find(x => x.id === sid); s.srs.nextReview = new Date().toISOString().slice(0, 10);
      DB.saveModules(mods); updateHeaderStats();
    }
  };
})();

const ReviewModule = (() => {
  let queue = [], idx = 0;
  return {
    init: () => {
      document.getElementById('btnRevealCard').onclick = () => { document.querySelector('.card-back').classList.remove('hidden'); document.getElementById('cardShowBtn').classList.add('hidden'); document.getElementById('cardFeedbackBtns').classList.remove('hidden'); };
      document.getElementById('cardPlayAudio').onclick = () => { if(queue[idx]) TTS.speak(queue[idx].english); };
      document.getElementById('cardFeedbackBtns').onclick = (e) => {
        const btn = e.target.closest('[data-quality]'); if(!btn) return;
        const q = Number(btn.dataset.quality); const item = queue[idx];
        const up = SM2.review(item.srs, q);
        if(item.moduleId) {
          const mods = DB.getModules(); mods.find(x => x.id === item.moduleId).sentences.find(x => x.id === item.id).srs = up; DB.saveModules(mods);
        } else {
          const cards = DB.getCards(); cards.find(x => x.id === item.id).srs = up; DB.saveCards(cards);
        }
        idx++; updateHeaderStats(); ReviewModule.show();
      };
    },
    load: () => {
      queue = []; idx = 0;
      DB.getModules().forEach(m => m.sentences.forEach(s => { if(SM2.isDue(s.srs)) queue.push({ ...s, moduleId: m.id }); }));
      DB.getCards().forEach(c => { if(SM2.isDue(c.srs)) queue.push(c); });
      document.getElementById('reviewEmpty').classList.add('hidden');
      document.getElementById('reviewDone').classList.add('hidden');
      if(!queue.length) { document.getElementById('reviewArea').classList.add('hidden'); document.getElementById('reviewEmpty').classList.remove('hidden'); document.getElementById('reviewSubtitle').textContent = "0 cards para revisar."; return; }
      document.getElementById('reviewSubtitle').textContent = `${queue.length} cartões aguardando ação de fixação`;
      document.getElementById('reviewArea').classList.remove('hidden');
      ReviewModule.show();
    },
    show: () => {
      if(idx >= queue.length) { document.getElementById('reviewArea').classList.add('hidden'); document.getElementById('reviewDone').classList.remove('hidden'); return; }
      const item = queue[idx];
      document.getElementById('cardFront').textContent = item.english;
      document.getElementById('cardBack').textContent = item.portuguese;
      document.querySelector('.card-back').classList.add('hidden');
      document.getElementById('cardShowBtn').classList.remove('hidden');
      document.getElementById('cardFeedbackBtns').classList.add('hidden');
    }
  };
})();

const PlaylistModule = (() => {
  let playing = false, idx = 0, loopTimer = null;
  return {
    init: () => {
      document.getElementById('btnPlayPlaylist').onclick = () => { playing = true; idx = 0; PlaylistModule.run(); };
      document.getElementById('btnPausePlaylist').onclick = () => { playing = false; clearTimeout(loopTimer); TTS.stop(); };
      document.getElementById('btnStopPlaylist').onclick = () => { playing = false; clearTimeout(loopTimer); TTS.stop(); document.getElementById('npText').textContent = '—'; document.getElementById('npTranslation').textContent = '—'; };
    },
    addItem: (s) => { const list = DB.getPlaylist(); if(!list.find(x => x.id === s.id)) { list.push(s); DB.savePlaylist(list); } },
    refresh: () => {
      const list = DB.getPlaylist(); const box = document.getElementById('playlistItems');
      if(!list.length) { box.innerHTML = '<p class="empty-state">Nenhum bloco de escuta inserido.</p>'; return; }
      box.innerHTML = list.map((x, i) => `<div class="playlist-item"><span>${i+1}. ${x.english}</span></div>`).join('');
    },
    run: () => {
      const list = DB.getPlaylist(); if(!list.length || !playing) return;
      if(idx >= list.length) { if(document.getElementById('playlistLoop').checked) idx = 0; else { playing = false; return; } }
      const item = list[idx];
      document.getElementById('npText').textContent = document.getElementById('playlistShowText').checked ? item.english : "Treinamento Auditivo Oculto Ativo...";
      document.getElementById('npTranslation').textContent = document.getElementById('playlistShowText').checked ? item.portuguese : "";
      document.getElementById('npProgressBar').style.width = `${((idx + 1) / list.length) * 100}%`;
      TTS.speak(item.english, () => { loopTimer = setTimeout(() => { idx++; PlaylistModule.run(); }, 1800); });
    }
  };
})();

const updateHeaderStats = () => {
  let due = 0;
  DB.getModules().forEach(m => m.sentences.forEach(s => { if(SM2.isDue(s.srs)) due++; }));
  DB.getCards().forEach(c => { if(SM2.isDue(c.srs)) due++; });
  const b = document.getElementById('stats-due'); b.textContent = `${due} hoje`;
  b.style.background = due > 0 ? 'var(--red)' : 'var(--accent-glow)';
  b.style.color = due > 0 ? '#fff' : 'var(--accent)';
};

document.addEventListener('DOMContentLoaded', () => {
  TabManager.init(); CreateModule.init(); StudyModule.init(); ReviewModule.init(); PlaylistModule.init();
  TTS.init(); updateHeaderStats();
  
  document.getElementById('btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify(DB.exportAll())], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'backup.json' }); a.click();
  };
  document.getElementById('importFile').onchange = async (e) => {
    try { DB.importAll(JSON.parse(await e.target.files[0].text())); location.reload(); } catch { UIUtils.toast("Arquivo inválido", "error"); }
  };
  document.getElementById('btnClearAll').onclick = async () => { if(await UIUtils.confirm("Resetar todo o sistema?")) { DB.clearAll(); location.reload(); } };
});
