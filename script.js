/**
 * EnglishFlow — script.js (Corrigido)
 */

'use strict';

// Força o carregamento do worker auxiliar do PDF.js de forma interna estável
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

const DB = (() => {
  const KEYS = { MODULES: 'ef_modules', CARDS: 'ef_cards', PLAYLIST: 'ef_playlist', SETTINGS: 'ef_settings' };
  const load = (key, fb = []) => { try { return JSON.parse(localStorage.getItem(key)) ?? fb; } catch { return fb; } };
  const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));
  return {
    getModules: () => load(KEYS.MODULES, []),
    saveModules: (d) => save(KEYS.MODULES, d),
    getCards: () => load(KEYS.CARDS, []),
    saveCards: (d) => save(KEYS.CARDS, d),
    getPlaylist: () => load(KEYS.PLAYLIST, []),
    savePlaylist: (d) => save(KEYS.PLAYLIST, d),
    getSettings: () => load(KEYS.SETTINGS, { voiceName: '', rate: 0.75 }),
    saveSettings: (d) => save(KEYS.SETTINGS, d),
    exportAll: () => ({ modules: load(KEYS.MODULES, []), cards: load(KEYS.CARDS, []), playlist: load(KEYS.PLAYLIST, []), settings: load(KEYS.SETTINGS, {}) }),
    importAll: (d) => { if(d.modules) save(KEYS.MODULES, d.modules); if(d.cards) save(KEYS.CARDS, d.cards); if(d.playlist) save(KEYS.PLAYLIST, d.playlist); if(d.settings) save(KEYS.SETTINGS, d.settings); },
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
    isDue: (c) => c.nextReview <= todayStr()
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
          let label = "Internacional";
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
  let pdfLines = [];
  return {
    init: () => {
      // Monitora os botões de rádio para trocar as telas de PDF e Colar na hora!
      document.querySelectorAll('input[name="inputMode"]').forEach(r => {
        r.addEventListener('change', (e) => {
          const isPdf = e.target.value === 'pdf';
          document.getElementById('pdfDropZone').classList.toggle('hidden', !isPdf);
          document.getElementById('textInputArea').classList.toggle('hidden', isPdf);
        });
      });

      document.getElementById('pdfFileInput').onchange = async (e) => {
        const file = e.target.files[0]; if(!file) return;
        UIUtils.toast("Lendo estrutura do PDF...");
        try {
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
          let text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(" ") + "\n";
          }
          const raw = text.split(/[.!?]\s+/).map(l => l.trim()).filter(l => l.length > 2);
          pdfLines = [];
          for (let i = 0; i < raw.length; i += 2) {
            if (raw[i]) pdfLines.push({ en: raw[i] + ".", pt: raw[i+1] ? raw[i+1] + "." : "Tradução pendente" });
          }
          UIUtils.toast("PDF alinhado com sucesso!", "success");
          document.getElementById('moduleTitle').value = file.name.replace(".pdf", "");
        } catch { UIUtils.toast("Erro ao ler o arquivo PDF.", "error"); }
      };

      document.getElementById('btnCreateModule').onclick = () => {
        const title = document.getElementById('moduleTitle').value.trim();
        if(!title) { UIUtils.toast("Digite um título.", "error"); return; }
        const mode = document.querySelector('input[name="inputMode"]:checked').value;
        let finalLines = [];

        if(mode === 'text') {
          const enArr = document.getElementById('rawEnglishText').value.split('\n').map(x => x.trim()).filter(x => x.length > 0);
          const ptArr = document.getElementById('rawPortugueseTextText' ? document.getElementById('rawPortugueseText').value.split('\n').map(x => x.trim()) : []);
          if(!enArr.length) { UIUtils.toast("Cole o texto em inglês.", "error"); return; }
          finalLines = enArr.map((en, i) => ({ en, pt: ptArr[i] || "Tradução pendente" }));
        } else {
          if(!pdfLines.length) { UIUtils.toast("Faça o upload do PDF primeiro.", "error"); return; }
          finalLines = [...pdfLines];
        }

        const sentences = finalLines.map(l => ({ id: UIUtils.uuid(), english: l.en, portuguese: l.pt, srs: SM2.newCard() }));
        const mods = DB.getModules(); mods.push({ id: UIUtils.uuid(), title, sentences });
        DB.saveModules(mods);

        document.getElementById('createForm').reset();
        pdfLines = [];
        document.getElementById('textInputArea').classList.add('hidden');
        document.getElementById('pdfDropZone').classList.remove('hidden');
        
        UIUtils.toast("Módulo criado com sucesso!", "success");
        CreateModule.renderModuleList(); updateHeaderStats();
      };

      document.getElementById('btnAddAnki').onclick = () => {
        const en = document.getElementById('ankiEnglish').value.trim();
        const pt = document.getElementById('ankiPortuguese').value.trim();
        if(!en || !pt) return;
        const cards = DB.getCards(); cards.push({ id: UIUtils.uuid(), english: en, portuguese: pt, srs: SM2.newCard() });
        DB.saveCards(cards); document.getElementById('anki-form').reset();
        UIUtils.toast("Card adicionado!", "success"); updateHeaderStats();
      };
      CreateModule.renderModuleList();
    },
    renderModuleList: () => {
      const mods = DB.getModules(); const el = document.getElementById('modulesList');
      document.getElementById('moduleCount').textContent = mods.length;
      if(!mods.length) { el.innerHTML = '<p class="empty-state">Nenhum módulo criado.</p>'; return; }
      el.innerHTML = mods.map(m => `
        <div class="module-card">
          <div class="mc-title">${m.title}</div>
          <div class="mc-meta">${m.sentences.length} frases</div>
          <div class="mc-actions" style="margin-top: .5rem;">
            <button class="btn btn-accent btn-sm" onclick="StudyModule.open('${m.id}'); TabManager.switchTab('study')">▶ Estudar</button>
            <button class="btn btn-ghost btn-sm" onclick="CreateModule.delete('${m.id}')">🗑</button>
          </div>
        </div>
      `).join('');
    },
    delete: async (id) => { if(await UIUtils.confirm("Apagar este módulo?")) { DB.saveModules(DB.getModules().filter(m => m.id !== id)); CreateModule.renderModuleList(); updateHeaderStats(); } }
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
          if(i >= curMod.sentences.length) return;
          const s = curMod.sentences[i];
          document.getElementById(`s-card-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          TTS.speak(s.english, () => { i++; setTimeout(next, 1000); });
        };
        next();
      };
      document.getElementById('btnStopAll').onclick = () => TTS.stop();
      document.getElementById('btnAddToPlaylistComplete').onclick = () => {
        curMod.sentences.forEach(s => PlaylistModule.addItem(s));
        UIUtils.toast("História enviada para a playlist!", "success");
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
          <div class="sentence-num">FRASE ${idx+1}</div>
          <div class="sentence-en">${s.english}</div>
          <div class="sentence-pt">${s.portuguese}</div>
          <div class="sentence-controls" style="margin-top: .5rem;">
            <button class="btn btn-accent btn-sm" onclick="TTS.speak('${s.english.replace(/'/g, "\\'")}')">▶ Ouvir</button>
            <button class="btn btn-ghost btn-sm" onclick="StudyModule.addSRS('${s.id}')">◈ Enviar ao Anki</button>
          </div>
        </div>
      `).join('');
      document.getElementById('fullTextParagraphs').textContent = curMod.sentences.map(s => s.english).join(" ");
      document.getElementById('studyProgress').style.width = "100%";
    },
    addSRS: (sid) => {
      UIUtils.toast("Card gerado com sucesso!", "success");
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
      if(!queue.length) { document.getElementById('reviewArea').classList.add('hidden'); document.getElementById('reviewEmpty').classList.remove('hidden'); document.getElementById('reviewSubtitle').textContent = "0 cards"; return; }
      document.getElementById('reviewSubtitle').textContent = `${queue.length} pendentes`;
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
  let playing = false, i = 0, t = null;
  return {
    init: () => {
      document.getElementById('btnPlayPlaylist').onclick = () => { playing = true; i = 0; PlaylistModule.run(); };
      document.getElementById('btnPausePlaylist').onclick = () => { playing = false; clearTimeout(t); TTS.stop(); };
      document.getElementById('btnStopPlaylist').onclick = () => { playing = false; clearTimeout(t); TTS.stop(); };
    },
    addItem: (s) => { const list = DB.getPlaylist(); if(!list.find(x => x.id === s.id)) { list.push(s); DB.savePlaylist(list); } },
    refresh: () => {
      const list = DB.getPlaylist(); const box = document.getElementById('playlistItems');
      if(!list.length) { box.innerHTML = '<p class="empty-state">Playlist vazia.</p>'; return; }
      box.innerHTML = list.map((x, idx) => `<div class="playlist-item"><span>${idx+1}. ${x.english}</span></div>`).join('');
    },
    run: () => {
      const list = DB.getPlaylist(); if(!list.length || !playing) return;
      if(i >= list.length) { if(document.getElementById('playlistLoop').checked) i = 0; else { playing = false; return; } }
      const item = list[i];
      document.getElementById('npText').textContent = document.getElementById('playlistShowText').checked ? item.english : "Listening Passivo...";
      document.getElementById('npTranslation').textContent = document.getElementById('playlistShowText').checked ? item.portuguese : "";
      TTS.speak(item.english, () => { t = setTimeout(() => { i++; PlaylistModule.run(); }, 1500); });
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
  
  // Script para configurações de limpar e exportar
  document.getElementById('btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify(DB.exportAll())], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'backup.json' }); a.click();
  };
  document.getElementById('importFile').onchange = async (e) => {
    try { DB.importAll(JSON.parse(await e.target.files[0].text())); location.reload(); } catch { UIUtils.toast("Arquivo inválido", "error"); }
  };
  document.getElementById('btnClearAll').onclick = async () => { if(await UIUtils.confirm("Zerar sistema?")) { DB.clearAll(); location.reload(); } };
});
