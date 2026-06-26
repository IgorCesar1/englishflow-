// Configuração do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Estado da Aplicação
let state = {
    lessons: JSON.parse(localStorage.getItem('ef_lessons')) || [],
    srs: JSON.parse(localStorage.getItem('ef_srs')) || [],
    currentLesson: null
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    updateReviewBadge();
    renderLibrary();
    
    // Botão de processamento
    document.getElementById('process-btn').addEventListener('click', handleImport);
});

// --- NAVEGAÇÃO ---
function showSection(sectionId) {
    document.querySelectorAll('.app-section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    
    if(sectionId === 'library-section') renderLibrary();
    if(sectionId === 'review-section') startReviewSession();
}

function toggleInputMethod(method) {
    const isPdf = method === 'pdf';
    document.getElementById('input-pdf').style.display = isPdf ? 'block' : 'none';
    document.getElementById('input-raw').style.display = isPdf ? 'none' : 'block';
    document.getElementById('btn-pdf').classList.toggle('active', isPdf);
    document.getElementById('btn-raw').classList.toggle('active', !isPdf);
}

// --- PARSER E IMPORTAÇÃO ---
async function handleImport() {
    const isPdf = document.getElementById('btn-pdf').classList.contains('active');
    const status = document.getElementById('status-msg');
    status.innerText = "Processando...";

    try {
        let lessonData;
        if (isPdf) {
            const file = document.getElementById('pdf-file').files[0];
            if (!file) throw new Error("Selecione um arquivo PDF.");
            lessonData = await parseCIMVPdf(file);
        } else {
            const title = document.getElementById('raw-title').value;
            const text = document.getElementById('raw-text').value;
            if (!title || !text) throw new Error("Preencha título e texto.");
            lessonData = parseRawText(title, text);
        }

        state.lessons.push(lessonData);
        saveState();
        status.innerText = "Sucesso! Lição adicionada.";
        renderLibrary();
        setTimeout(() => showSection('library-section'), 1000);
    } catch (err) {
        status.innerText = "Erro: " + err.message;
        console.error(err);
    }
}

async function parseCIMVPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        
        // Filtragem básica de cabeçalho/rodapé
        const filteredStrings = strings.filter(s => {
            const val = s.trim();
            if (!val) return false;
            if (val.includes("CIMV") || val.includes("Mairo Vergara")) return false;
            if (/^\d+$/.test(val)) return false; // Números de página
            return true;
        });
        
        fullText += filteredStrings.join(" ") + "\n";
    }

    // Identificar Seções
    const partLineByLine = fullText.split(/Texto Linha a Linha/i)[1]?.split(/Texto para Treinamento/i)[0];
    const partTraining = fullText.split(/Texto para Treinamento/i)[1];

    if (!partLineByLine) throw new Error("Não foi possível identificar o padrão 'Linha a Linha' no PDF.");

    const lines = extractLineByLine(partLineByLine);
    
    return {
        id: Date.now(),
        title: file.name.replace(".pdf", ""),
        lines: lines,
        trainingText: partTraining ? partTraining.trim() : ""
    };
}

function extractLineByLine(rawChunk) {
    // Tenta separar frases baseadas em pontuação final seguida de espaço ou quebra
    const regex = /([^.!?]+[.!?]+)/g;
    const segments = rawChunk.match(regex) || rawChunk.split('\n');
    
    let processed = [];
    let currentPair = { en: "", pt: "" };

    segments.forEach(seg => {
        const clean = seg.trim();
        if (clean.length < 3) return;

        // Heurística: Inglês raramente tem caracteres como á, é, í, ó, ú, ç, ã
        const isPortuguese = /[áéíóúçãõÀÈÌÒÙ]/i.test(clean);

        if (!isPortuguese && !currentPair.en) {
            currentPair.en = clean;
        } else if (isPortuguese && currentPair.en) {
            currentPair.pt = clean;
            processed.push({ ...currentPair, id: Math.random().toString(36).substr(2, 9) });
            currentPair = { en: "", pt: "" };
        }
    });

    return processed;
}

function parseRawText(title, text) {
    const rawLines = text.split('\n').filter(l => l.trim());
    let lines = [];
    for (let i = 0; i < rawLines.length; i += 2) {
        if (rawLines[i] && rawLines[i+1]) {
            lines.push({ 
                en: rawLines[i].trim(), 
                pt: rawLines[i+1].trim(), 
                id: Math.random().toString(36).substr(2, 9) 
            });
        }
    }
    return { id: Date.now(), title, lines, trainingText: "" };
}

// --- BIBLIOTECA E ESTUDO ---
function renderLibrary() {
    const list = document.getElementById('lessons-list');
    list.innerHTML = state.lessons.length === 0 ? "<p>Nenhuma lição importada.</p>" : "";
    
    state.lessons.forEach(lesson => {
        const div = document.createElement('div');
        div.className = 'lesson-item';
        div.innerHTML = `<h3>${lesson.title}</h3><p>${lesson.lines.length} frases</p>`;
        div.onclick = () => openLesson(lesson);
        list.appendChild(div);
    });
}

function openLesson(lesson) {
    state.currentLesson = lesson;
    document.getElementById('study-title').innerText = lesson.title;
    const content = document.getElementById('line-by-line-content');
    content.innerHTML = "";

    lesson.lines.forEach(line => {
        const isAdded = state.srs.some(s => s.lineId === line.id);
        const div = document.createElement('div');
        div.className = `study-line ${isAdded ? 'active-srs' : ''}`;
        div.id = `line-${line.id}`;
        div.innerHTML = `
            <div class="line-content">
                <span class="en">${line.en}</span>
                <span class="pt">${line.pt}</span>
            </div>
            <div class="line-actions">
                <button onclick="speak('${line.en.replace(/'/g, "\\'")}')">🔊</button>
                <button class="btn-check" onclick="toggleSRS('${line.id}')">${isAdded ? '✔' : '✚'}</button>
            </div>
        `;
        content.appendChild(div);
    });

    document.getElementById('training-text-content').innerText = lesson.trainingText;
    showSection('study-section');
}

function speak(text) {
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'en-US';
    window.speechSynthesis.speak(msg);
}

// --- SISTEMA SRS (SM-2) ---
function toggleSRS(lineId) {
    const index = state.srs.findIndex(s => s.lineId === lineId);
    const line = state.currentLesson.lines.find(l => l.id === lineId);

    if (index > -1) {
        state.srs.splice(index, 1);
    } else {
        state.srs.push({
            lineId: lineId,
            en: line.en,
            pt: line.pt,
            lessonTitle: state.currentLesson.title,
            nextReview: Date.now(),
            interval: 0,
            reps: 0,
            ef: 2.5
        });
    }
    
    saveState();
    openLesson(state.currentLesson); // Refresh UI
    updateReviewBadge();
}

function startReviewSession() {
    const now = Date.now();
    const dueCards = state.srs.filter(card => card.nextReview <= now);
    const container = document.getElementById('srs-card-container');

    if (dueCards.length === 0) {
        container.innerHTML = "<h3>🎉 Tudo revisado por enquanto!</h3>";
        return;
    }

    const card = dueCards[0];
    container.innerHTML = `
        <div class="srs-front">${card.en}</div>
        <button class="btn-primary" id="btn-reveal">Mostrar Tradução</button>
        <div id="srs-answer" class="hidden">
            <div class="srs-back">${card.pt}</div>
            <div class="srs-buttons">
                <button class="btn-err" onclick="handleSRSAnswer('${card.lineId}', 0)">Errei</button>
                <button class="btn-hard" onclick="handleSRSAnswer('${card.lineId}', 1)">Difícil</button>
                <button class="btn-good" onclick="handleSRSAnswer('${card.lineId}', 2)">Bom</button>
                <button class="btn-easy" onclick="handleSRSAnswer('${card.lineId}', 3)">Fácil</button>
            </div>
        </div>
    `;

    document.getElementById('btn-reveal').onclick = () => {
        document.getElementById('srs-answer').classList.remove('hidden');
        document.getElementById('btn-reveal').classList.add('hidden');
        speak(card.en);
    };
}

function handleSRSAnswer(lineId, quality) {
    const card = state.srs.find(s => s.lineId === lineId);
    
    // Algoritmo SM-2 simplificado
    if (quality < 2) {
        card.reps = 0;
        card.interval = 1;
    } else {
        if (card.reps === 0) card.interval = 1;
        else if (card.reps === 1) card.interval = 6;
        else card.interval = Math.round(card.interval * card.ef);
        
        card.reps++;
        card.ef = card.ef + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02));
        if (card.ef < 1.3) card.ef = 1.3;
    }

    const newDate = new Date();
    newDate.setDate(newDate.getDate() + card.interval);
    card.nextReview = newDate.getTime();

    saveState();
    updateReviewBadge();
    startReviewSession();
}

// --- UTILITÁRIOS ---
function saveState() {
    localStorage.setItem('ef_lessons', JSON.stringify(state.lessons));
    localStorage.setItem('ef_srs', JSON.stringify(state.srs));
}

function updateReviewBadge() {
    const now = Date.now();
    const count = state.srs.filter(card => card.nextReview <= now).length;
    document.getElementById('review-count').innerText = count;
}
