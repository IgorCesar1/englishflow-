/**
 * EnglishFlow — script.js
 * Arquitetura de Parse Inteligente Baseada em Marcadores de Curso (PDF/Colagem)
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
        if (c.repetitions === 1) c.interval = 1; // 1 dia
        else if (c.repetitions === 2) c.interval = 3; // 3 dias
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
          let label = "Global";
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

/* ── MÓDULO PARSER INTELIGENTE (Focado na estrutura real do curso) ── */
const CreateModule = (() => {
  let globalSentences = [];
  let globalFullText = "";

  // Função centralizada para processar e alinhar a estrutura do texto
  const processRawTextContent = (rawText) => {
    // 1. Isolar seções
    let textLinhaLinha = "";
    let textTreinamento = "";

    const normalizeText = rawText.replace(/\r\n/g, '\n');
    
    const idxLinha = normalizeText.toUpperCase().indexOf("TEXTO LINHA A LINHA");
    const idxTreino = normalizeText.toUpperCase().indexOf("TEXTO PARA TREINAMENTO");

    if (idxLinha !== -1 && idxTreino !== -1) {
      textLinhaLinha = normalizeText.substring(idxLinha, idxTreino);
      textTreinamento = normalizeText.substring(idxTreino);
    } else if (idxLinha !== -1) {
      textLinhaLinha = normalizeText.substring(idxLinha);
    } else {
      textLinhaLinha = normalizeText; 
    }

    // 2. Extrair Bloco Completo de Treinamento
    if (idxTreino !== -1) {
      globalFullText = textTreinamento.replace(/TEXTO PARA TREINAMENTO:?/i, '').trim();
    } else {
      // Fallback: junta as linhas
      globalFullText = "";
    }

    // 3. Processar Linha a Linha dividindo em pontuações (, ou .)
    const rawLines = textLinhaLinha.split('\n')
                      .map(l => l.trim())
                      .filter(l => l.length > 0 && !l.toUpperCase().includes("TEXTO LINHA A LINHA"));
    
    globalSentences = [];
    
    // Varre procurando pares consecutivos (Inglês -> Português)
    // Sabendo que inglês usa caracteres latinos comuns sem acentuação pesada
    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      
      // Validação básica se a linha atual parece inglês (Frente)
      if (/[a-zA-Z]/Hex.test(line) && !line.match(/[ãáéíóúçÂÊÎÔÛÃÕ]/i)) {
        let englishPart = line;
        let portuguesePart = "";
        
        // Espia se a próxima linha é o suporte/tradução em português
        if (rawLines[i+1] && (rawLines[i+1].match(/[ãáéíóúçÂÊÎÔÛÃÕ]/i) || i+1 < rawLines.length)) {
          portuguesePart = rawLines[i+1];
          i++; // avança o ponteiro para o par consumido
        } else {
          portuguesePart = "Tradução não mapeada automaticamente.";
        }

        // Quebra estruturas internas em vírgulas ou pontos se a frase for muito longa
        globalSentences.push({
          en: englishPart,
          pt: portuguesePart
        });
      }
    }

    if(globalFullText === "" && globalSentences.length > 0) {
      globalFullText = globalSentences.map(s => s.en).join(" ");
    }
  };

  return {
    init: () => {
      document.querySelectorAll('input[name="inputMode"]').forEach(r => {
        r.addEventListener('change', (e) => {
          const isPdf = e.target.value === 'pdf';
          document.getElementById('pdfDropZone').style.display = isPdf ? 'block' : 'none';
          document.getElementById('textInputArea').style.display = isPdf ? 'none' : 'flex';
        });
      });

      // Leitor do PDF do Curso
      document.getElementById('pdfFileInput').onchange = async (e) => {
        const file = e.target.files[0]; if(!file) return;
        UIUtils.toast("Mapeando estrutura do PDF do curso...");
        try {
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
          let compiledText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            compiledText += content.items.map(item => item.str).join(" ") + "\n";
          }

          processRawTextContent(compiledText);

          UIUtils.toast(`${globalSentences.length} Frases estruturadas do PDF!`, "success");
          document.getElementById('moduleTitle').value = file.name.replace(".pdf", "");
        } catch (err) { 
          console.error(err);
          UIUtils.toast("Erro ao processar as seções do PDF.", "error"); 
        }
      };

      // Execução do Botão Centralizado de Geração
      document.getElementById('btnCreateModule').onclick = () => {
        const title = document.getElementById('moduleTitle').value.trim();
        if(!title) { UIUtils.toast("Por favor, dê um nome ao módulo.", "error"); return; }
        const mode = document.querySelector('input[name="inputMode"]:checked').value;

        if(mode === 'text') {
          const enText = document.getElementById('rawEnglishText').value;
          const ptText = document.getElementById('rawPortugueseText').value;
          
          if(!enText.trim()) { UIUtils.toast("Insira o texto para gerar.", "error"); return; }
          
          // Tratamento unificado de colagem manual
          const enLines = enText.split('\n').map(x => x.trim()).filter(x => x.length > 0);
          const ptLines = ptText.split('\n').map(x => x.trim()).filter(x => x.length > 0);
          
          globalSentences = enLines.map((en, i) => ({ en, pt: ptLines[i] || "Tradução pendente" }));
          globalFullText = enLines.join(" ");
        }

        if(!globalSentences.length) { UIUtils.toast("Nenhuma estrutura carregada para salvar.", "error"); return; }

        const sentences = globalSentences.map(l => ({
          id: UIUtils.uuid(),
          english: l.en,
          portuguese: l.pt,
          srs: SM2.newCard()
        }));

        const mods = DB.getModules();
        mods.push({ id: UIUtils.uuid(), title, sentences, fullText: globalFullText });
        DB.saveModules(mods);

        document.getElementById('createForm').reset();
        globalSentences = [];
        globalFullText = "";
        
        document.getElementById('textInputArea').style.display = 'none';
        document.getElementById('pdfDropZone').style.display = 'block';
        
        UIUtils.toast("Módulo estruturado com sucesso!", "success");
        CreateModule.renderModuleList(); updateHeaderStats();
      };

      document.getElementById('btnAddAnki').onclick = () => {
        const en = document.getElementById('ankiEnglish').value.trim();
        const pt = document.getElementById('ankiPortuguese').value.trim();
        if(!en || !pt) return;
        const cards = DB.getCards(); cards.push({ id: UIUtils.uuid(), english: en, portuguese: pt, srs: SM2.newCard() });
        DB.saveCards(cards); document.getElementById('anki-form').reset();
        UIUtils.toast("Card avulso adicionado!", "success"); updateHeaderStats();
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
          <div class="mc-meta">${m.sentences.length} estruturas divididas</div>
          <div class="mc-actions" style="margin-top: .5rem;">
            <button class="btn btn-accent btn-sm" onclick="StudyModule.open('${m.id}'); TabManager.switchTab('study')">▶ Estudar</button>
            <button class="btn btn-ghost btn-sm" onclick="CreateModule.delete('${m.id}')">🗑</button>
          </div>
        </div>
      `).join('');
    },
    delete: async (id) => { if(await UIUtils.confirm("Excluir história da base?")) { DB.saveModules(DB.getModules().filter(m => m.id !== id)); CreateModule.renderModuleList(); updateHeaderStats(); } }
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
        let i = 0;
        const next = () => {
          if(i >= curMod.sentences.length || !window.speechSynthesis.speaking) {
            if(i >= curMod.sentences.length) return;
          }
          const s = curMod.sentences[i];
          document.getElementById(`s-card-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          TTS.speak(s.english, () => { i++; setTimeout(next, 1200); });
        };
        next();
      };
      document.getElementById('btnStopAll').onclick = () => TTS.stop();
      document.getElementById('btnAddToPlaylistComplete').onclick = () => {
        curMod.sentences.forEach(s => PlaylistModule.addItem(s));
        UIUtils.toast("Módulo enviado para a Playlist Diária!", "success");
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
          <div class="sentence-en" style="font-size: 1.15rem; font-weight: 600; color:#fff;">${s.english}</div>
          <div class="sentence-pt" style="color:var(--accent); font-size: 0.98rem; margin-top:.4rem;">${s.portuguese}</div>
          <div class="sentence-controls" style="margin-top: .75rem;">
            <button class="btn btn-accent btn-sm" onclick
